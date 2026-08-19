import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useDuetData(user) {
  const [state, setState] = useState({ loading: true, profile: null, couple: null, members: [], events: [], wishes: [], tasks: [], memories: [] });

  const refresh = useCallback(async () => {
    if (!user || !supabase) return;
    const [profileResult, memberResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('couple_members').select('couple_id, couples(*)').eq('user_id', user.id).maybeSingle(),
    ]);
    const couple = memberResult.data?.couples ?? null;
    if (!couple) return setState({ loading: false, profile: profileResult.data, couple: null, members: [], events: [], wishes: [], tasks: [], memories: [] });
    const [eventResult, wishResult, taskResult, memoryResult, membersResult] = await Promise.all([
      supabase.from('events').select('*').eq('couple_id', couple.id).order('starts_at').limit(200),
      supabase.from('wishlist_items').select('*').eq('couple_id', couple.id).order('created_at', { ascending: false }).limit(200),
      supabase.from('tasks').select('*').eq('couple_id', couple.id).order('created_at', { ascending: false }).limit(200),
      supabase.from('memories').select('*').eq('couple_id', couple.id).order('happened_on', { ascending: false }).limit(200),
      supabase.from('couple_members').select('user_id, joined_at').eq('couple_id', couple.id).order('joined_at'),
    ]);
    const memberRows = membersResult.data ?? [];
    const profileIds = memberRows.map(member => member.user_id);
    const profilesResult = profileIds.length
      ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', profileIds)
      : { data: [] };
    const profilesById = Object.fromEntries((profilesResult.data ?? []).map(memberProfile => [memberProfile.id, memberProfile]));
    const members = memberRows.map(member => ({ ...member, profile: profilesById[member.user_id] ?? null }));
    setState({ loading: false, profile: profileResult.data, couple, members, events: eventResult.data ?? [], wishes: wishResult.data ?? [], tasks: taskResult.data ?? [], memories: memoryResult.data ?? [] });
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!state.couple || !supabase) return;
    const channel = supabase.channel(`duet-${state.couple.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `couple_id=eq.${state.couple.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wishlist_items', filter: `couple_id=eq.${state.couple.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `couple_id=eq.${state.couple.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memories', filter: `couple_id=eq.${state.couple.id}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [state.couple?.id, refresh]);
  return { ...state, refresh };
}
