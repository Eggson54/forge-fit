-- Private storage bucket for progress photos. Each user can only access files
-- under a folder named by their own uid (path: "<uid>/<file>").

insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

drop policy if exists "own_photos_select" on storage.objects;
create policy "own_photos_select" on storage.objects
  for select using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own_photos_insert" on storage.objects;
create policy "own_photos_insert" on storage.objects
  for insert with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own_photos_delete" on storage.objects;
create policy "own_photos_delete" on storage.objects
  for delete using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
