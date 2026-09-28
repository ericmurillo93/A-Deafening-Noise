create or replace function public.get_discovery_artist_catalog()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(artist order by artist) from (
    select distinct upper(trim(artist)) artist from (
      select a.artist_name artist from public.user_listened_artists a join public.profiles p on p.id=a.user_id where p.account_status='active'
      union
      select a.artist from public.concert_artists a join public.concert_participants cp on cp.concert_id=a.concert_id join public.profiles p on p.id=cp.user_id where p.account_status='active' and cp.status='confirmed'
      union
      select b.artist from public.bucket_list_artists b join public.profiles p on p.id=b.user_id where p.account_status='active'
    ) candidates where nullif(trim(artist),'') is not null
  ) catalog),'[]'::jsonb);
end;
$$;
revoke all on function public.get_discovery_artist_catalog() from public,anon,authenticated;
grant execute on function public.get_discovery_artist_catalog() to service_role;
