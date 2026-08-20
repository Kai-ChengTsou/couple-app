alter table public.wishlist_items
  add column if not exists image_path text,
  add column if not exists accepted_by uuid references public.profiles(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists scheduled_event_id uuid references public.events(id) on delete set null;

alter table public.wishlist_items drop constraint if exists wishlist_items_status_check;
alter table public.wishlist_items add constraint wishlist_items_status_check
  check (status in ('idea', 'accepted', 'planned', 'completed'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wishlist-photos', 'wishlist-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members view wishlist photos" on storage.objects;
drop policy if exists "members upload wishlist photos" on storage.objects;
drop policy if exists "members delete wishlist photos" on storage.objects;

create policy "members view wishlist photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'wishlist-photos'
  and public.is_couple_member(((storage.foldername(name))[1])::uuid)
);

create policy "members upload wishlist photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'wishlist-photos'
  and public.is_couple_member(((storage.foldername(name))[1])::uuid)
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "members delete wishlist photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'wishlist-photos'
  and public.is_couple_member(((storage.foldername(name))[1])::uuid)
);
