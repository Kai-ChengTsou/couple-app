create table if not exists public.countdowns (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  target_date date not null,
  repeats_yearly boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.countdowns enable row level security;

create policy "members read countdowns" on public.countdowns for select to authenticated
using (public.is_couple_member(couple_id));
create policy "members add countdowns" on public.countdowns for insert to authenticated
with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "members edit countdowns" on public.countdowns for update to authenticated
using (public.is_couple_member(couple_id)) with check (public.is_couple_member(couple_id));
create policy "members delete countdowns" on public.countdowns for delete to authenticated
using (public.is_couple_member(couple_id));

alter publication supabase_realtime add table public.countdowns;
