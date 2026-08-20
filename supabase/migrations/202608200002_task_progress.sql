alter table public.tasks
  add column if not exists track_progress boolean not null default false,
  add column if not exists progress_percent integer not null default 0;

alter table public.tasks drop constraint if exists tasks_progress_percent_check;
alter table public.tasks add constraint tasks_progress_percent_check
  check (progress_percent between 0 and 100);

update public.tasks
set progress_percent = 100
where completed_at is not null and progress_percent = 0;
