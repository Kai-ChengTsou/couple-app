alter table public.events
add column if not exists event_scope text not null default 'shared'
check (event_scope in ('shared', 'personal'));
