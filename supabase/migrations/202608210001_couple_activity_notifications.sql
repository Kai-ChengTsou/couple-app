create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  url text not null default '/',
  tag text not null,
  dedupe_key text not null unique,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (scheduled_for)
  where sent_at is null;

alter table public.notification_outbox enable row level security;

create or replace function public.duet_actor_name(actor uuid)
returns text language sql stable security definer set search_path = public
as $$
  select coalesce((select display_name from public.profiles where id = actor), '另一半')
$$;

create or replace function public.duet_notify_partner(
  target_couple uuid,
  actor uuid,
  notification_kind text,
  notification_title text,
  notification_body text,
  notification_url text,
  notification_tag text
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if actor is null then return; end if;
  insert into public.notification_outbox
    (couple_id, recipient_id, kind, title, body, url, tag, dedupe_key)
  select target_couple, member.user_id, notification_kind, notification_title,
    notification_body, notification_url, notification_tag,
    notification_kind || ':' || notification_tag || ':' || member.user_id || ':' || gen_random_uuid()
  from public.couple_members member
  where member.couple_id = target_couple and member.user_id <> actor;
end;
$$;

create or replace function public.duet_event_activity_notification()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  actor uuid := auth.uid();
  event_day text;
  changed boolean := false;
begin
  if actor is null then return new; end if;
  if tg_op = 'UPDATE' then
    changed := old.title is distinct from new.title
      or old.starts_at is distinct from new.starts_at
      or old.ends_at is distinct from new.ends_at
      or old.location is distinct from new.location
      or old.notes is distinct from new.notes
      or old.category is distinct from new.category
      or old.visibility is distinct from new.visibility
      or old.event_scope is distinct from new.event_scope
      or old.reminder_minutes is distinct from new.reminder_minutes;
    if not changed then return new; end if;
  end if;
  if new.visibility <> 'shared' or new.event_scope <> 'shared' then return new; end if;
  event_day := to_char(new.starts_at at time zone 'Asia/Taipei', 'YYYY-MM-DD');
  perform public.duet_notify_partner(
    new.couple_id, actor, case when tg_op='INSERT' then 'event_created' else 'event_updated' end,
    case when tg_op='INSERT' then '新的共同安排' else '共同安排有更新' end,
    public.duet_actor_name(actor) || case when tg_op='INSERT' then ' 新增了「' else ' 修改了「' end || new.title || '」',
    '/?open=calendar&date=' || event_day,
    'event-activity-' || new.id
  );
  return new;
end;
$$;

drop trigger if exists duet_event_activity_push on public.events;
create trigger duet_event_activity_push
after insert or update on public.events
for each row execute function public.duet_event_activity_notification();

create or replace function public.duet_wishlist_activity_notification()
returns trigger language plpgsql security definer set search_path = public
as $$
declare actor uuid := coalesce(auth.uid(), new.accepted_by);
begin
  if new.status = 'accepted'
    and (old.status is distinct from 'accepted' or old.accepted_by is distinct from new.accepted_by) then
    perform public.duet_notify_partner(
      new.couple_id, actor, 'wish_accepted', '願望被答應了',
      public.duet_actor_name(actor) || ' 答應了「' || new.title || '」',
      '/?open=wishlist', 'wish-accepted-' || new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists duet_wishlist_activity_push on public.wishlist_items;
create trigger duet_wishlist_activity_push
after update on public.wishlist_items
for each row execute function public.duet_wishlist_activity_notification();

create or replace function public.duet_task_progress_notification()
returns trigger language plpgsql security definer set search_path = public
as $$
declare actor uuid := auth.uid();
declare progress integer := coalesce(new.progress_percent, case when new.completed_at is null then 0 else 100 end);
begin
  if actor is null then return new; end if;
  if old.progress_percent is distinct from new.progress_percent
    or old.completed_at is distinct from new.completed_at then
    perform public.duet_notify_partner(
      new.couple_id, actor, 'task_progress',
      case when new.completed_at is not null then '共同任務完成了' else '共同任務有進度' end,
      public.duet_actor_name(actor) || ' 將「' || new.title || '」更新為 ' || progress || '%',
      '/?open=us', 'task-progress-' || new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists duet_task_progress_push on public.tasks;
create trigger duet_task_progress_push
after update on public.tasks
for each row execute function public.duet_task_progress_notification();

revoke all on public.notification_outbox from anon, authenticated;
revoke all on function public.duet_actor_name(uuid) from public;
revoke all on function public.duet_notify_partner(uuid,uuid,text,text,text,text,text) from public;
