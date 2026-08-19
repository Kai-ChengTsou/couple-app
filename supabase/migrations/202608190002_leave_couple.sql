-- Let a signed-in member leave their current couple space safely.
-- Shared data remains while another member exists. The final member leaving
-- deletes the couple, and cascading foreign keys remove its shared records.
create or replace function public.leave_couple()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_couple uuid;
  deleted_space boolean := false;
begin
  select couple_id
    into target_couple
    from public.couple_members
   where user_id = auth.uid()
   limit 1;

  if target_couple is null then
    return false;
  end if;

  delete from public.couple_members
   where couple_id = target_couple
     and user_id = auth.uid();

  if not exists (
    select 1 from public.couple_members where couple_id = target_couple
  ) then
    delete from public.couples where id = target_couple;
    deleted_space := true;
  end if;

  return deleted_space;
end;
$$;

grant execute on function public.leave_couple() to authenticated;
