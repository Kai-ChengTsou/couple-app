import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const SIGNED_URL_SECONDS = 60 * 60 * 24 * 7;
const SIGNED_URL_CACHE_MS = 1000 * 60 * 60 * 24 * 6;

function readSignedCache(bucket) {
  try { return JSON.parse(localStorage.getItem(`duet-photo-urls:${bucket}`) || '{}'); }
  catch { return {}; }
}

function writeSignedCache(bucket, cache) {
  try { localStorage.setItem(`duet-photo-urls:${bucket}`, JSON.stringify(cache)); }
  catch {}
}

async function resolveSignedUrls(bucket, paths) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (!uniquePaths.length) return {};
  const now = Date.now();
  const cache = readSignedCache(bucket);
  const resolved = {};
  const missing = [];
  uniquePaths.forEach(path => {
    const saved = cache[path];
    if (saved?.url && saved.expiresAt > now) resolved[path] = saved.url;
    else missing.push(path);
  });
  if (missing.length) {
    const result = await supabase.storage.from(bucket).createSignedUrls(missing, SIGNED_URL_SECONDS);
    (result.data ?? []).forEach(photo => {
      if (!photo.signedUrl) return;
      resolved[photo.path] = photo.signedUrl;
      cache[photo.path] = { url: photo.signedUrl, expiresAt: now + SIGNED_URL_CACHE_MS };
    });
    writeSignedCache(bucket, cache);
  }
  return resolved;
}

function warmPhotoCache(urls) {
  urls.filter(Boolean).slice(0, 16).forEach(url => {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
  });
}

export function useDuetData(user) {
  const [state, setState] = useState({ loading: true, profile: null, couple: null, members: [], events: [], wishes: [], tasks: [], memories: [], countdowns: [] });

  const refresh = useCallback(async () => {
    if (!user || !supabase) return;
    const [profileResult, memberResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('couple_members').select('couple_id, couples(*)').eq('user_id', user.id).maybeSingle(),
    ]);
    const couple = memberResult.data?.couples ?? null;
    if (!couple) return setState({ loading: false, profile: profileResult.data, couple: null, members: [], events: [], wishes: [], tasks: [], memories: [], countdowns: [] });
    const [eventResult, wishResult, taskResult, memoryResult, membersResult, countdownResult] = await Promise.all([
      supabase.from('events').select('*').eq('couple_id', couple.id).order('starts_at').limit(200),
      supabase.from('wishlist_items').select('*').eq('couple_id', couple.id).order('created_at', { ascending: false }).limit(200),
      supabase.from('tasks').select('*').eq('couple_id', couple.id).order('created_at', { ascending: false }).limit(200),
      supabase.from('memories').select('*').eq('couple_id', couple.id).order('happened_on', { ascending: false }).limit(200),
      supabase.from('couple_members').select('user_id, joined_at').eq('couple_id', couple.id).order('joined_at'),
      supabase.from('countdowns').select('*').eq('couple_id', couple.id).order('target_date'),
    ]);
    const memberRows = membersResult.data ?? [];
    const profileIds = memberRows.map(member => member.user_id);
    const profilesResult = profileIds.length
      ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', profileIds)
      : { data: [] };
    const profilesById = Object.fromEntries((profilesResult.data ?? []).map(memberProfile => [memberProfile.id, memberProfile]));
    const members = memberRows.map(member => ({ ...member, profile: profilesById[member.user_id] ?? null }));
    const rawWishes = wishResult.data ?? [];
    const wishPhotoPaths = rawWishes.map(wish => wish.image_path).filter(Boolean);
    const wishSignedByPath = await resolveSignedUrls('wishlist-photos', wishPhotoPaths);
    const wishes = rawWishes.map(wish => ({ ...wish, image_url: wish.image_path ? wishSignedByPath[wish.image_path] ?? null : wish.image_url }));
    const rawMemories = memoryResult.data ?? [];
    const photoPaths = rawMemories.map(memory => memory.image_path).filter(Boolean);
    const signedByPath = await resolveSignedUrls('memory-photos', photoPaths);
    const memories = rawMemories.map(memory => ({ ...memory, image_url: memory.image_path ? signedByPath[memory.image_path] ?? null : memory.image_url }));
    warmPhotoCache([...wishes.map(wish => wish.image_url), ...memories.map(memory => memory.image_url)]);
    setState({ loading: false, profile: profileResult.data, couple, members, events: eventResult.data ?? [], wishes, tasks: taskResult.data ?? [], memories, countdowns: countdownResult.data ?? [] });
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!state.couple || !supabase) return;
    const channel = supabase.channel(`duet-${state.couple.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `couple_id=eq.${state.couple.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wishlist_items', filter: `couple_id=eq.${state.couple.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `couple_id=eq.${state.couple.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memories', filter: `couple_id=eq.${state.couple.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'countdowns', filter: `couple_id=eq.${state.couple.id}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [state.couple?.id, refresh]);
  return { ...state, refresh };
}
