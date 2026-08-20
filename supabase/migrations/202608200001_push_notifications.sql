alter table public.events
  add column if not exists reminder_minutes integer,
  add column if not exists reminder_sent_at timestamptz;

alter table public.events drop constraint if exists events_reminder_minutes_check;
alter table public.events add constraint events_reminder_minutes_check
  check (reminder_minutes is null or reminder_minutes in (30, 60, 1440));

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "users read their push subscriptions" on public.push_subscriptions;
create policy "users read their push subscriptions" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "users add their push subscriptions" on public.push_subscriptions;
create policy "users add their push subscriptions" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "users update their push subscriptions" on public.push_subscriptions;
create policy "users update their push subscriptions" on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users delete their push subscriptions" on public.push_subscriptions;
create policy "users delete their push subscriptions" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());
