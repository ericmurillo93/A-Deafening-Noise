-- Keep typing suggestions stable and complete without calling external event APIs.
create extension if not exists unaccent with schema extensions;

create or replace function public.search_artist_names(search_prefix text)
returns text[] language plpgsql stable security definer set search_path='' as $$
declare normalized_prefix text := lower(extensions.unaccent(trim(coalesce(search_prefix,''))));
begin
  perform public.assert_active_user();
  if length(normalized_prefix) not between 1 and 100 then return '{}'::text[]; end if;
  return coalesce(array(
    select artist from (
      select ca.artist from public.concert_artists ca
      union
      select ula.artist_name from public.user_listened_artists ula
      union
      select suggestion->>'artist'
      from public.concert_suggestion_catalog catalog
      cross join lateral jsonb_array_elements(catalog.suggestions) suggestion
    ) known(artist)
    where nullif(trim(known.artist),'') is not null
      and lower(extensions.unaccent(known.artist)) like normalized_prefix||'%'
    order by lower(extensions.unaccent(known.artist)),known.artist
    limit 2000
  ),'{}'::text[]);
end;
$$;

revoke all on function public.search_artist_names(text) from public,anon;
grant execute on function public.search_artist_names(text) to authenticated;
