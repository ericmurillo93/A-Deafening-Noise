-- Return the shared discovery catalog already scoped to the signed-in user.
-- This is the same affinity and country boundary used by suggestion emails.
create or replace function public.get_my_concert_suggestions()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare caller public.profiles; catalog public.concert_suggestion_catalog;
begin
  caller:=public.assert_active_user();
  select * into catalog from public.concert_suggestion_catalog where singleton;

  return jsonb_build_object(
    'generatedAt',case when catalog.singleton then to_char(catalog.generated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
    'suggestions',coalesce((
      select jsonb_agg(item.value order by item.value->>'date',item.value->>'artist')
      from jsonb_array_elements(coalesce(catalog.suggestions,'[]'::jsonb)) item
      where upper(coalesce(item.value->>'country',''))=any(caller.discovery_countries)
      and public.normalize_concert_value(item.value->>'artist') in (
        select public.normalize_concert_value(artist) from (
          select artist_name artist from public.user_listened_artists where user_id=caller.id
          union
          select ca.artist from public.concert_participants cp join public.concert_artists ca on ca.concert_id=cp.concert_id
            where cp.user_id=caller.id and cp.status='confirmed'
          union
          select artist from public.bucket_list_artists where user_id=caller.id
        ) affinity
      )
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_my_concert_suggestions() from public,anon;
grant execute on function public.get_my_concert_suggestions() to authenticated;
