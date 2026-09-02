create or replace function public.normalize_city_label(value text)
returns text language sql immutable parallel safe set search_path='' as $$
  select case
    when regexp_replace(lower(translate(coalesce(value,''),'áàäâéèëêíìïîóòöôúùüûñç','aaaaeeeeiiiioooouuuunc')), '[^a-z0-9]+', ' ', 'g') ~ '^l? ?hospitalet( de llobregat)? ?$' then 'hospitalet de llobregat'
    else trim(regexp_replace(lower(translate(coalesce(value,''),'áàäâéèëêíìïîóòöôúùüûñç','aaaaeeeeiiiioooouuuunc')), '[^a-z0-9]+', ' ', 'g'))
  end
$$;

alter table public.concerts add column if not exists normalized_city text generated always as (public.normalize_city_label(city)) stored;
create index if not exists concerts_country_normalized_city_idx on public.concerts(country,normalized_city);

create or replace function public.admin_data_quality()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and account_status='active') then raise exception 'Admin access required' using errcode='42501'; end if;
  return jsonb_build_object(
    'artistLabels',coalesce((select jsonb_agg(row_to_json(d)) from (select normalized_artist as artist,array_agg(distinct artist order by artist) labels,count(*) count from public.concerts group by 1 having count(distinct artist)>1 order by count(*) desc limit 100)d),'[]'::jsonb),
    'venueLabels',coalesce((select jsonb_agg(row_to_json(d)) from (select normalized_venue as venue,array_agg(distinct venue order by venue) labels,count(*) count from public.concerts group by 1 having count(distinct venue)>1 order by count(*) desc limit 100)d),'[]'::jsonb),
    'cityLabels',coalesce((select jsonb_agg(row_to_json(d)) from (select country,normalized_city as city,array_agg(distinct city order by city) labels,count(*) count from public.concerts group by 1,2 having count(distinct city)>1 order by count(*) desc limit 100)d),'[]'::jsonb),
    'missingLocation',coalesce((select jsonb_agg(jsonb_build_object('id',id,'artist',artist,'venue',venue,'date',concert_date)) from public.concerts where nullif(trim(city),'') is null or country !~ '^[A-Z]{2}$'),'[]'::jsonb),
    'suspiciousDates',coalesce((select jsonb_agg(jsonb_build_object('id',id,'artist',artist,'date',concert_date)) from public.concerts where start_date is null or end_date<start_date or start_date>current_date+interval '5 years'),'[]'::jsonb),
    'missingCreator',coalesce((select jsonb_agg(jsonb_build_object('id',id,'artist',artist,'date',concert_date)) from public.concerts where created_by is null),'[]'::jsonb),
    'missingSetlist',coalesce((select jsonb_agg(jsonb_build_object('id',id,'artist',artist,'date',concert_date)) from (select * from public.concerts where start_date<current_date and setlist_id is null order by start_date desc limit 100)c),'[]'::jsonb),
    'missingArtwork',coalesce((select jsonb_agg(jsonb_build_object('id',id,'artist',artist,'date',concert_date)) from (select c.* from public.concerts c where not exists(select 1 from public.artist_images ai where ai.normalized_artist=c.normalized_artist) order by c.start_date desc nulls last limit 100)c),'[]'::jsonb),
    'possibleDuplicates',coalesce((select jsonb_agg(row_to_json(d)) from (select normalized_artist as artist,normalized_venue as venue,concert_date as date,count(*) as count from public.concerts group by 1,2,3 having count(*)>1 order by count(*) desc limit 100)d),'[]'::jsonb),
    'uncheckedLinks',coalesce((select jsonb_agg(jsonb_build_object('id',id,'source',source,'url',coalesce(ticket_url,source_url))) from (select * from public.concert_sources where coalesce(ticket_url,source_url) is not null and (link_checked_at is null or link_checked_at<now()-interval '30 days') order by updated_at desc limit 100)links),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.normalize_city_label(text) from public,anon,authenticated;
revoke all on function public.admin_data_quality() from public,anon;
grant execute on function public.admin_data_quality() to authenticated;
