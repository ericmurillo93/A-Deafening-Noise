-- Preserve legacy venue-alias dismissals when an interested decision is reversed.
create or replace function public.review_my_suggestion(suggestion jsonb, interested boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller public.profiles; decision_key text; legacy_key text; event_id bigint; own public.concert_participants; request jsonb;
begin
  caller:=public.assert_active_user();
  decision_key:=suggestion->>'reviewKey';legacy_key:=suggestion->>'legacyKey';
  if decision_key is null or decision_key not like 'v2|%' or length(decision_key)>1000 or interested is null then
    raise exception 'Invalid suggestion decision' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller.id::text||decision_key,0));
  select c.id into event_id from public.concerts c where c.normalized_artist=public.normalize_concert_value(suggestion->>'artist')
    and c.normalized_venue=public.normalize_concert_value(suggestion->>'venue') and c.concert_date=suggestion->>'date' order by c.id limit 1;
  if interested then
    if to_date(suggestion->>'date','DD/MM/YYYY')<current_date then raise exception 'Suggestion has ended' using errcode='22023';end if;
    select * into own from public.concert_participants where concert_id=event_id and user_id=caller.id;
    if own.concert_id is null or own.status<>'confirmed' or not own.visible_in_archive then
      request:=jsonb_build_object('artist',upper(suggestion->>'artist'),'venue',upper(suggestion->>'venue'),
        'city',suggestion->>'city','country',upper(suggestion->>'country'),'date',suggestion->>'date',
        'bought',false,'source',suggestion->>'source','sourceEventId',suggestion->>'id','sourceUrl',suggestion->>'sourceUrl');
      if event_id is null then request:=request||jsonb_build_object('ticketUrl',suggestion->>'sourceUrl');end if;
      perform public.upsert_my_concert(request);
    end if;
    delete from public.user_dismissed_suggestions where user_id=caller.id and
      (suggestion_key in(decision_key,legacy_key) or suggestion_key in(select value from jsonb_array_elements_text(coalesce(suggestion->'dismissalKeys','[]'::jsonb))));
  else
    if exists(select 1 from public.concert_participants where concert_id=event_id and user_id=caller.id and status='confirmed' and visible_in_archive) then
      perform public.delete_my_concert(event_id);
    end if;
    insert into public.user_dismissed_suggestions(user_id,suggestion_key) values(caller.id,decision_key)
      on conflict(user_id,suggestion_key) do nothing;
  end if;
  return public.get_my_archive_snapshot();
end;
$$;
revoke all on function public.save_my_concert(jsonb),public.review_my_suggestion(jsonb,boolean) from public,anon;
grant execute on function public.save_my_concert(jsonb),public.review_my_suggestion(jsonb,boolean) to authenticated;

-- Return complete event metadata without any participant identity.
create or replace function public.search_concert_catalog(search_field text, search_value text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.assert_active_user();
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'concertId',candidate.id,'artist',candidate.artist,'venue',candidate.venue,
    'city',candidate.city,'country',candidate.country,'date',candidate.concert_date,
    'ticketUrl',candidate.ticket_url,'setlistId',candidate.setlist_id,
    'doorsAt',candidate.doors_at,'startsAt',candidate.starts_at,'address',candidate.address,
    'latitude',candidate.latitude,'longitude',candidate.longitude,'promoter',candidate.promoter,
    'festival',candidate.festival,'tour',candidate.tour,'eventStatus',candidate.event_status,
    'lineup',(select jsonb_agg(jsonb_build_object('artist',ca.artist,'role',ca.role) order by ca.billing_order)
      from public.concert_artists ca where ca.concert_id=candidate.id)
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
create index if not exists notifications_recent_user_idx on public.notifications(user_id,created_at desc,id desc);
