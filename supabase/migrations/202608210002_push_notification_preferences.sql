alter table public.push_subscriptions
  add column if not exists notify_schedule boolean not null default true,
  add column if not exists notify_wishes boolean not null default true,
  add column if not exists notify_tasks boolean not null default true;
