alter table public.memories add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memory-photos', 'memory-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members view memory photos" on storage.objects;
drop policy if exists "members upload memory photos" on storage.objects;
drop policy if exists "members delete memory photos" on storage.objects;

create policy "members view memory photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'memory-photos'
  and public.is_couple_member(((storage.foldername(name))[1])::uuid)
);

create policy "members upload memory photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'memory-photos'
  and public.is_couple_member(((storage.foldername(name))[1])::uuid)
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy "members delete memory photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'memory-photos'
  and public.is_couple_member(((storage.foldername(name))[1])::uuid)
);
