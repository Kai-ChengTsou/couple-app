-- Run this entire file once in Supabase Dashboard > SQL Editor.
-- It creates the Duet data model and row-level security policies.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'New partner',
  avatar_url text,
  theme text not null default 'blush' check (theme in ('blush', 'midnight', 'lilac', 'sage', 'sunset', 'latte')),
  created_at timestamptz not null default now()
);

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our duet',
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  anniversary date,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  notes text,
  category text not null default 'date',
  visibility text not null default 'shared' check (visibility in ('shared', 'private', 'surprise')),
  created_at timestamptz not null default now()
);

create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  category text not null default 'idea',
  location text,
  url text,
  image_url text,
  estimated_price numeric(12,2),
  status text not null default 'idea' check (status in ('idea', 'planned', 'completed')),
  notes text,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  happened_on date not null default current_date,
  note text,
  image_url text,
  created_at timestamptz not null default now()
);

create or replace function public.is_couple_member(target_couple uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.couple_members where couple_id = target_couple and user_id = auth.uid()) $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.events enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.tasks enable row level security;
alter table public.memories enable row level security;

create policy "profiles are readable by signed in users" on public.profiles for select to authenticated using (true);
create policy "users update their own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "members read their couples" on public.couples for select to authenticated using (public.is_couple_member(id));
create policy "users create couples" on public.couples for insert to authenticated with check (created_by = auth.uid());
create policy "members update their couples" on public.couples for update to authenticated using (public.is_couple_member(id));
create policy "members read memberships" on public.couple_members for select to authenticated using (public.is_couple_member(couple_id) or user_id = auth.uid());
create policy "users join a couple" on public.couple_members for insert to authenticated with check (user_id = auth.uid());

create policy "members read events" on public.events for select to authenticated using (public.is_couple_member(couple_id) and (visibility = 'shared' or created_by = auth.uid()));
create policy "members add events" on public.events for insert to authenticated with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "members edit events" on public.events for update to authenticated using (public.is_couple_member(couple_id) and (visibility = 'shared' or created_by = auth.uid())) with check (public.is_couple_member(couple_id) and (visibility = 'shared' or created_by = auth.uid()));
create policy "members delete events" on public.events for delete to authenticated using (public.is_couple_member(couple_id) and (visibility = 'shared' or created_by = auth.uid()));
create policy "members read wishes" on public.wishlist_items for select to authenticated using (public.is_couple_member(couple_id));
create policy "members add wishes" on public.wishlist_items for insert to authenticated with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "members edit wishes" on public.wishlist_items for update to authenticated using (public.is_couple_member(couple_id)) with check (public.is_couple_member(couple_id));
create policy "members delete wishes" on public.wishlist_items for delete to authenticated using (public.is_couple_member(couple_id));
create policy "members read tasks" on public.tasks for select to authenticated using (public.is_couple_member(couple_id));
create policy "members add tasks" on public.tasks for insert to authenticated with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "members edit tasks" on public.tasks for update to authenticated using (public.is_couple_member(couple_id)) with check (public.is_couple_member(couple_id));
create policy "members delete tasks" on public.tasks for delete to authenticated using (public.is_couple_member(couple_id));
create policy "members read memories" on public.memories for select to authenticated using (public.is_couple_member(couple_id));
create policy "members add memories" on public.memories for insert to authenticated with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "members edit memories" on public.memories for update to authenticated using (public.is_couple_member(couple_id)) with check (public.is_couple_member(couple_id));
create policy "members delete memories" on public.memories for delete to authenticated using (public.is_couple_member(couple_id));

-- Create-couple helper: creates the couple and adds its creator atomically.
create or replace function public.create_couple(couple_name text default 'Our duet')
returns public.couples language plpgsql security definer set search_path = public
as $$ declare created public.couples; begin
  insert into public.couples(name, created_by) values (couple_name, auth.uid()) returning * into created;
  insert into public.couple_members(couple_id, user_id) values (created.id, auth.uid());
  return created;
end; $$;

-- Join helper avoids exposing other couples while allowing a partner to use a code.
create or replace function public.join_couple(code text)
returns uuid language plpgsql security definer set search_path = public
as $$ declare target uuid; begin
  select id into target from public.couples where invite_code = upper(trim(code));
  if target is null then raise exception 'Invite code not found'; end if;
  if (select count(*) from public.couple_members where couple_id = target) >= 2 then raise exception 'This duet already has two partners'; end if;
  insert into public.couple_members(couple_id, user_id) values (target, auth.uid()) on conflict do nothing;
  return target;
end; $$;

grant execute on function public.create_couple(text) to authenticated;
grant execute on function public.join_couple(text) to authenticated;

-- Leaving keeps the space while another partner remains. If the final member
-- leaves, deleting the couple cascades to all shared records.
create or replace function public.leave_couple()
returns boolean language plpgsql security definer set search_path = public
as $$ declare target_couple uuid; deleted_space boolean := false; begin
  select couple_id into target_couple from public.couple_members where user_id = auth.uid() limit 1;
  if target_couple is null then return false; end if;
  delete from public.couple_members where couple_id = target_couple and user_id = auth.uid();
  if not exists (select 1 from public.couple_members where couple_id = target_couple) then
    delete from public.couples where id = target_couple;
    deleted_space := true;
  end if;
  return deleted_space;
end; $$;

grant execute on function public.leave_couple() to authenticated;

alter publication supabase_realtime add table public.events, public.wishlist_items, public.tasks, public.memories;
