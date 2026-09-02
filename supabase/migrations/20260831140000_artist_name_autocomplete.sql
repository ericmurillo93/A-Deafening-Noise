-- Stable artist autocomplete is independent from provider event search.
create or replace function public.search_artist_names(search_prefix text)
returns text[] language plpgsql stable security definer set search_path='' as $$
begin
  perform public.assert_active_user();
  if length(trim(coalesce(search_prefix,''))) not between 1 and 100 then return '{}'::text[]; end if;
  return coalesce(array(
    select artist from (
      select ca.artist from public.concert_artists ca
      union
      select ula.artist_name from public.user_listened_artists ula
    ) known
    where known.artist ilike trim(search_prefix)||'%'
    order by lower(known.artist),known.artist
    limit 500
  ),'{}'::text[]);
end;
$$;
revoke all on function public.search_artist_names(text) from public,anon;
grant execute on function public.search_artist_names(text) to authenticated;
