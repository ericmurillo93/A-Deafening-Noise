-- Location belongs to the canonical concert event and is shared by every
-- participant. ISO 3166-1 alpha-2 country codes keep filtering predictable.
alter table public.concerts add column if not exists city text;
alter table public.concerts add column if not exists country text;

update public.concerts set city = case venue
  when 'BE PROG! MY FRIEND' then 'Barcelona'
  when 'BERN' then 'Bern'
  when 'BRAGA' then 'Braga'
  when 'DOWNLOAD FESTIVAL MADRID' then 'Madrid'
  when 'ESTADI OLÍMPIC LLUÍS COMPANYS' then 'Barcelona'
  when 'FRI-SON, FRIBOURG' then 'Fribourg'
  when 'GENEVE ARENA' then 'Geneva'
  when 'GIRONA' then 'Girona'
  when 'GRAN TEATRE DEL LICEU' then 'Barcelona'
  when 'GRANADA SOUND' then 'Granada'
  when 'HALLE 622 ZÜRICH' then 'Zürich'
  when 'HALLENSTADION ZÜRICH' then 'Zürich'
  when 'HELLFEST 2026' then 'Clisson'
  when 'KOMPLEX 457 ZURICH' then 'Zürich'
  when 'L''AUDITORI' then 'Barcelona'
  when 'LA FARGA' then 'L’Hospitalet de Llobregat'
  when 'LA RIVIERA' then 'Madrid'
  when 'LES DOCKS' then 'Lausanne'
  when 'LES NITS DE BARCELONA 2025 - JARDINS DEL PALAU DE PEDRALBES' then 'Barcelona'
  when 'MALEDUCATS 2025' then 'Barcelona'
  when 'MONTREUX JAZZ FESTIVAL' then 'Montreux'
  when 'NOCHES DEL BOTÁNICO - MADRID' then 'Madrid'
  when 'O2 ARENA' then 'London'
  when 'PALAU DE LA MÚSICA CATALANA' then 'Barcelona'
  when 'PALAU OLÍMPIC' then 'Badalona'
  when 'PALAU SANT JORDI' then 'Barcelona'
  when 'PARC DEL FÒRUM' then 'Barcelona'
  when 'POBLE ESPANYOL' then 'Barcelona'
  when 'RAZZMATAZZ' then 'Barcelona'
  when 'RAZZMATAZZ 2' then 'Barcelona'
  when 'RAZZMATAZZ 3' then 'Barcelona'
  when 'RESURRECTION FEST' then 'Viveiro'
  when 'RIYADH AIR METROPOLITANO' then 'Madrid'
  when 'SALA APOLO' then 'Barcelona'
  when 'SALA BIKINI' then 'Barcelona'
  when 'SALA PARAL·LEL 62' then 'Barcelona'
  when 'SALAMANDRA' then 'L’Hospitalet de Llobregat'
  when 'SALLE MÉTROPOLE LAUSANNE' then 'Lausanne'
  when 'SAMSUNG HALL, ZÚRICH' then 'Dübendorf'
  when 'SANT JORDI CLUB' then 'Barcelona'
  when 'ST. JAKOBSHALLE BASEL' then 'Basel'
  when 'SÓNAR 2025' then 'Barcelona'
  when 'THÉÂTRE BENNO BESSON, YVERDON-LES-BAINS' then 'Yverdon-les-Bains'
  when 'Z7 - PRATTELN' then 'Pratteln'
  else city end,
country = case venue
  when 'BERN' then 'CH' when 'BRAGA' then 'PT'
  when 'FRI-SON, FRIBOURG' then 'CH' when 'GENEVE ARENA' then 'CH'
  when 'HALLE 622 ZÜRICH' then 'CH' when 'HALLENSTADION ZÜRICH' then 'CH'
  when 'HELLFEST 2026' then 'FR' when 'KOMPLEX 457 ZURICH' then 'CH'
  when 'LES DOCKS' then 'CH' when 'MONTREUX JAZZ FESTIVAL' then 'CH'
  when 'O2 ARENA' then 'GB' when 'SALLE MÉTROPOLE LAUSANNE' then 'CH'
  when 'SAMSUNG HALL, ZÚRICH' then 'CH' when 'ST. JAKOBSHALLE BASEL' then 'CH'
  when 'THÉÂTRE BENNO BESSON, YVERDON-LES-BAINS' then 'CH' when 'Z7 - PRATTELN' then 'CH'
  else case when venue in (
    'BE PROG! MY FRIEND','DOWNLOAD FESTIVAL MADRID','ESTADI OLÍMPIC LLUÍS COMPANYS','GIRONA',
    'GRAN TEATRE DEL LICEU','GRANADA SOUND','L''AUDITORI','LA FARGA','LA RIVIERA',
    'LES NITS DE BARCELONA 2025 - JARDINS DEL PALAU DE PEDRALBES','MALEDUCATS 2025',
    'NOCHES DEL BOTÁNICO - MADRID','PALAU DE LA MÚSICA CATALANA','PALAU OLÍMPIC',
    'PALAU SANT JORDI','PARC DEL FÒRUM','POBLE ESPANYOL','RAZZMATAZZ','RAZZMATAZZ 2','RAZZMATAZZ 3',
    'RESURRECTION FEST','RIYADH AIR METROPOLITANO','SALA APOLO','SALA BIKINI',
    'SALA PARAL·LEL 62','SALAMANDRA','SANT JORDI CLUB','SÓNAR 2025'
  ) then 'ES' else country end end;

do $$
declare unmapped text;
begin
  select string_agg(distinct venue, ', ' order by venue) into unmapped
  from public.concerts where nullif(trim(city), '') is null or country !~ '^[A-Z]{2}$';
  if unmapped is not null then raise exception 'Unmapped concert venues: %', unmapped; end if;
end;
$$;

alter table public.concerts alter column city set not null;
alter table public.concerts alter column country set not null;
alter table public.concerts add constraint concerts_country_check check (country ~ '^[A-Z]{2}$');
create index if not exists concerts_location_idx on public.concerts(country, city);

create or replace function public.get_app_data()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; visible_concerts jsonb; visible_notifications jsonb;
begin
  result := public.get_app_data_with_hidden();
  select coalesce(jsonb_agg(item.value || jsonb_build_object('city', c.city, 'country', c.country) order by item.ordinality), '[]'::jsonb)
  into visible_concerts
  from jsonb_array_elements(result->'concerts') with ordinality item(value, ordinality)
  join public.concerts c on c.id = (item.value->>'concertId')::bigint
  where exists (select 1 from public.concert_participants cp
    where cp.concert_id=c.id and cp.user_id=auth.uid() and cp.status='confirmed' and cp.visible_in_archive);
  select coalesce(jsonb_agg(item.value || jsonb_strip_nulls(jsonb_build_object('actorAvatarUrl', actor.avatar_url)) order by item.ordinality), '[]'::jsonb)
  into visible_notifications
  from jsonb_array_elements(result->'notifications') with ordinality item(value, ordinality)
  join public.notifications n on n.id = (item.value->>'id')::bigint
  left join public.profiles actor on actor.id = n.actor_id;
  return jsonb_set(jsonb_set(result, '{concerts}', visible_concerts), '{notifications}', visible_notifications);
end;
$$;

create or replace function public.search_concert_catalog(search_field text, search_value text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.assert_active_user();
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'concertId', candidate.id, 'artist', candidate.artist, 'venue', candidate.venue,
    'city', candidate.city, 'country', candidate.country, 'date', candidate.concert_date,
    'ticketUrl', candidate.ticket_url
  )) order by candidate.concert_date desc, candidate.artist), '[]'::jsonb) into result
  from (select c.* from public.concerts c
    where length(trim(coalesce(search_value, ''))) between 2 and 100
      and case search_field when 'artist' then c.artist ilike '%'||trim(search_value)||'%'
        when 'venue' then c.venue ilike '%'||trim(search_value)||'%'
        when 'date' then c.concert_date ilike '%'||trim(search_value)||'%' else false end
    order by case search_field when 'artist' then position(lower(trim(search_value)) in lower(c.artist))
      when 'venue' then position(lower(trim(search_value)) in lower(c.venue))
      when 'date' then position(lower(trim(search_value)) in lower(c.concert_date)) else 999 end,
      c.concert_date desc, c.artist limit 8) candidate;
  return result;
end;
$$;

create or replace function public.get_concert_data()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare caller public.profiles;
begin
  caller := public.assert_active_user();
  return jsonb_build_object('concerts', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'artist',c.artist,'venue',c.venue,'city',c.city,'country',c.country,'date',c.concert_date,
    'bought',cp.bought,'setlistId',c.setlist_id,'ticketUrl',c.ticket_url,
    'attendees',case when cardinality(cp.guest_attendees)>0 then to_jsonb(cp.guest_attendees) end
  )) order by c.id) from public.concerts c join public.concert_participants cp
    on cp.concert_id=c.id and cp.user_id=caller.id and cp.status='confirmed'),'[]'::jsonb),
    'dismissedSuggestions',case when caller.role='admin' then coalesce((select jsonb_agg(ds.suggestion_key order by ds.suggestion_key) from public.dismissed_suggestions ds),'[]'::jsonb) else '[]'::jsonb end);
end;
$$;

create or replace function public.upsert_my_concert(payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller public.profiles; target_id bigint; existing_match boolean:=false; friend_id uuid; guest_values text[]:=array[]::text[];
begin
  caller := public.assert_active_user();
  if nullif(trim(payload->>'city'),'') is null or upper(trim(payload->>'country')) !~ '^[A-Z]{2}$' then
    raise exception 'City and a two-letter country code are required' using errcode='22023';
  end if;
  target_id:=nullif(payload->>'concertId','')::bigint;
  if target_id is null then
    select c.id into target_id from public.concerts c where c.normalized_artist=public.normalize_concert_value(payload->>'artist')
      and c.normalized_venue=public.normalize_concert_value(payload->>'venue') and c.concert_date=trim(payload->>'date') order by c.id limit 1;
    existing_match:=target_id is not null;
  end if;
  if target_id is null then
    insert into public.concerts(artist,venue,city,country,concert_date,bought,setlist_id,ticket_url,guest_attendees,created_by,normalized_artist,normalized_venue)
    values(trim(payload->>'artist'),coalesce(trim(payload->>'venue'),''),trim(payload->>'city'),upper(trim(payload->>'country')),trim(payload->>'date'),
      coalesce((payload->>'bought')::boolean,true),nullif(trim(payload->>'setlistId'),''),nullif(trim(payload->>'ticketUrl'),''),array[]::text[],caller.id,
      public.normalize_concert_value(payload->>'artist'),public.normalize_concert_value(payload->>'venue')) returning id into target_id;
  elsif not exists(select 1 from public.concerts where id=target_id) then raise exception 'Concert not found' using errcode='P0002';
  elsif caller.role='admin' or exists(select 1 from public.concerts where id=target_id and created_by=caller.id) then
    update public.concerts set artist=trim(payload->>'artist'),venue=coalesce(trim(payload->>'venue'),''),city=trim(payload->>'city'),country=upper(trim(payload->>'country')),
      concert_date=trim(payload->>'date'),setlist_id=nullif(trim(payload->>'setlistId'),''),ticket_url=nullif(trim(payload->>'ticketUrl'),''),
      normalized_artist=public.normalize_concert_value(payload->>'artist'),normalized_venue=public.normalize_concert_value(payload->>'venue') where id=target_id;
  end if;
  select coalesce(array_agg(value),array[]::text[]) into guest_values from jsonb_array_elements_text(coalesce(payload->'guestAttendees','[]'::jsonb));
  insert into public.concert_participants(concert_id,user_id,bought,status,guest_attendees)
  values(target_id,caller.id,coalesce((payload->>'bought')::boolean,true),'confirmed',guest_values)
  on conflict(concert_id,user_id) do update set bought=excluded.bought,status='confirmed',invited_by=null,guest_attendees=excluded.guest_attendees;
  delete from public.concert_participants cp where cp.concert_id=target_id and cp.status='pending' and cp.invited_by=caller.id
    and not exists(select 1 from jsonb_array_elements_text(coalesce(payload->'attendeeUserIds','[]'::jsonb)) selected(value) where selected.value::uuid=cp.user_id);
  for friend_id in select value::uuid from jsonb_array_elements_text(coalesce(payload->'attendeeUserIds','[]'::jsonb)) loop
    if friend_id<>caller.id and public.are_friends(caller.id,friend_id) then
      insert into public.concert_participants(concert_id,user_id,bought,status,invited_by) values(target_id,friend_id,true,'pending',caller.id)
      on conflict(concert_id,user_id) do update set invited_by=case when public.concert_participants.status='pending' then caller.id else public.concert_participants.invited_by end;
    end if;
  end loop;
  return jsonb_build_object('concertId',target_id,'matchedExisting',existing_match);
end;
$$;

revoke all on function public.get_app_data() from public, anon;
revoke all on function public.search_concert_catalog(text,text) from public, anon;
revoke all on function public.get_concert_data() from public, anon;
revoke all on function public.upsert_my_concert(jsonb) from public, anon;
grant execute on function public.get_app_data() to authenticated;
grant execute on function public.search_concert_catalog(text,text) to authenticated;
grant execute on function public.get_concert_data() to authenticated;
grant execute on function public.upsert_my_concert(jsonb) to authenticated;
