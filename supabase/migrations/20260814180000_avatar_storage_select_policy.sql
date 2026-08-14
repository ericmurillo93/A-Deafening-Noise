drop policy if exists "Users read their own avatar object" on storage.objects;
create policy "Users read their own avatar object" on storage.objects for select to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
