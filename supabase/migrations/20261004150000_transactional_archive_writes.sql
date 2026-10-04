-- Preserve omitted catalog metadata; explicit empty values still clear a field.
alter function public.upsert_my_concert(jsonb) rename to upsert_my_concert_before_20261004;
create or replace function public.upsert_my_concert(payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller public.profiles; existing public.concerts; defaults jsonb; event_date date; start_date date; date_parts text[];
begin
  caller:=public.assert_active_user();
  date_parts:=string_to_array(trim(payload->>'date'),' - ');
  if date_parts is null or cardinality(date_parts) not between 1 and 2 or date_parts[1] !~ '^\d{2}/\d{2}/\d{4}$' then
    raise exception 'Invalid concert date' using errcode='22023';
  end if;
  start_date:=to_date(date_parts[1],'DD/MM/YYYY');
  event_date:=to_date(date_parts[cardinality(date_parts)],'DD/MM/YYYY');
  if to_char(start_date,'DD/MM/YYYY')<>date_parts[1] or to_char(event_date,'DD/MM/YYYY')<>date_parts[cardinality(date_parts)] or event_date<start_date then
    raise exception 'Invalid concert date' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    public.normalize_concert_value(payload->>'artist')||'|'||public.normalize_concert_value(payload->>'venue')||'|'||trim(payload->>'date'),0));
  select * into existing from public.concerts c where
    c.id=nullif(payload->>'concertId','')::bigint or
    (nullif(payload->>'concertId','') is null and c.normalized_artist=public.normalize_concert_value(payload->>'artist')
     and c.normalized_venue=public.normalize_concert_value(payload->>'venue') and c.concert_date=trim(payload->>'date'))
    order by c.id limit 1 for update;
  if existing.id is not null then
    defaults:=jsonb_build_object('setlistId',existing.setlist_id,'ticketUrl',existing.ticket_url,
      'doorsAt',existing.doors_at,'startsAt',existing.starts_at,'address',existing.address,
      'latitude',existing.latitude,'longitude',existing.longitude,'promoter',existing.promoter,
      'festival',existing.festival,'tour',existing.tour,'eventStatus',existing.event_status,
      'lineup',coalesce((select jsonb_agg(jsonb_build_object('artist',ca.artist) order by ca.billing_order)
        from public.concert_artists ca where ca.concert_id=existing.id),'[]'::jsonb));
    payload:=defaults||payload;
  end if;
  event_date:=to_date(split_part(trim(payload->>'date'),' - ',1),'DD/MM/YYYY');
  if to_char(event_date,'DD/MM/YYYY')<>split_part(trim(payload->>'date'),' - ',1) then
    raise exception 'Invalid concert date' using errcode='22023';
  end if;
  event_date:=to_date(split_part(trim(payload->>'date'),' - ',case when payload->>'date' like '% - %' then 2 else 1 end),'DD/MM/YYYY');
  if event_date<current_date then payload:=payload||'{"bought":true}'::jsonb;end if;
  return public.upsert_my_concert_before_20261004(payload);
end;
$$;
revoke all on function public.upsert_my_concert_before_20261004(jsonb) from public,anon,authenticated;
revoke all on function public.upsert_my_concert(jsonb) from public,anon;
grant execute on function public.upsert_my_concert(jsonb) to authenticated;

create or replace function public.save_my_concert(payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.upsert_my_concert(payload);
  return public.get_my_archive_snapshot();
end;
$$;

-- One decision, one transaction. Never replace unrelated dismissals.
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
    delete from public.user_dismissed_suggestions where user_id=caller.id and suggestion_key in(decision_key,legacy_key);
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
