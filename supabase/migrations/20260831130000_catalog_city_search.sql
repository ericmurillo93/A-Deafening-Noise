-- City autocomplete uses the shared event catalogue without exposing attendance.
create or replace function public.search_concert_catalog(search_field text, search_value text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.assert_active_user();
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'concertId',candidate.id,'artist',candidate.artist,'venue',candidate.venue,
    'city',candidate.city,'country',candidate.country,'date',candidate.concert_date,
    'ticketUrl',candidate.ticket_url
  )) order by candidate.rank,candidate.concert_date desc,candidate.artist),'[]'::jsonb) into result
  from (
    select c.*,case search_field
      when 'artist' then position(lower(trim(search_value)) in lower(c.artist))
      when 'venue' then position(lower(trim(search_value)) in lower(c.venue))
      when 'city' then position(lower(trim(search_value)) in lower(c.city))
      when 'date' then position(lower(trim(search_value)) in lower(c.concert_date))
      else 999 end rank
    from public.concerts c
    where length(trim(coalesce(search_value,''))) between 2 and 100
      and case search_field
        when 'artist' then c.artist ilike trim(search_value)||'%'
        when 'venue' then c.venue ilike '%'||trim(search_value)||'%'
        when 'city' then c.city ilike trim(search_value)||'%'
        when 'date' then c.concert_date ilike '%'||trim(search_value)||'%'
        else false end
    order by rank,c.concert_date desc,c.artist limit 12
  ) candidate;
  return result;
end;
$$;
revoke all on function public.search_concert_catalog(text,text) from public,anon;
grant execute on function public.search_concert_catalog(text,text) to authenticated;
