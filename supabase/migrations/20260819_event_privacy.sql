-- Hide personal and surprise plans from the other partner.
drop policy if exists "members read events" on public.events;
drop policy if exists "members edit events" on public.events;
drop policy if exists "members delete events" on public.events;

create policy "members read events" on public.events
for select to authenticated
using (public.is_couple_member(couple_id) and (visibility = 'shared' or created_by = auth.uid()));

create policy "members edit events" on public.events
for update to authenticated
using (public.is_couple_member(couple_id) and (visibility = 'shared' or created_by = auth.uid()))
with check (public.is_couple_member(couple_id) and (visibility = 'shared' or created_by = auth.uid()));

create policy "members delete events" on public.events
for delete to authenticated
using (public.is_couple_member(couple_id) and (visibility = 'shared' or created_by = auth.uid()));
