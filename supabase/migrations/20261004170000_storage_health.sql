alter function public.get_admin_operations() rename to get_admin_operations_before_storage;
create or replace function public.get_admin_operations()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
  result:=public.get_admin_operations_before_storage(); -- Includes active-admin authorization.
  return result||jsonb_build_object('storage',jsonb_build_object(
    'bytes',coalesce((select sum(case when metadata->>'size' ~ '^\d+$' then (metadata->>'size')::bigint else 0 end)
      from storage.objects where bucket_id in('avatars','concert-memories')),0),
    'files',(select count(*) from storage.objects where bucket_id in('avatars','concert-memories')),
    'unreferencedPhotos',(select count(*) from storage.objects o where o.bucket_id='concert-memories'
      and o.created_at<now()-interval '24 hours' and not exists(
        select 1 from public.concert_memories m where o.name=any(m.photo_paths) or o.name=m.photo_path))));
end $$;
revoke all on function public.get_admin_operations_before_storage() from public,anon,authenticated;
revoke all on function public.get_admin_operations() from public,anon;
grant execute on function public.get_admin_operations() to authenticated;
