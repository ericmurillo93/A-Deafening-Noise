alter function public.export_my_data() rename to export_my_data_base_20260928;
create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; caller public.profiles;
begin
  caller:=public.assert_active_user();
  result:=public.export_my_data_base_20260928();
  return result || jsonb_build_object(
    'schemaVersion',2,
    'concerts',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'artist',c.artist,'venue',c.venue,'city',c.city,'country',c.country,'date',c.concert_date,
      'bought',cp.bought,'guestAttendees',cp.guest_attendees,'setlistId',c.setlist_id,'ticketUrl',c.ticket_url,
      'doorsAt',c.doors_at,'startsAt',c.starts_at,'address',c.address,'latitude',c.latitude,'longitude',c.longitude,
      'promoter',c.promoter,'festival',c.festival,'tour',c.tour,'eventStatus',c.event_status,
      'lineup',(select jsonb_agg(jsonb_build_object('artist',a.artist,'role',a.role) order by a.billing_order) from public.concert_artists a where a.concert_id=c.id),
      'sources',(select jsonb_agg(to_jsonb(s)-'id'-'concert_id') from public.concert_sources s where s.concert_id=c.id),
      'createdByMe',c.created_by=caller.id
    )) order by c.start_date,c.id) from public.concerts c join public.concert_participants cp on cp.concert_id=c.id
      where cp.user_id=caller.id and cp.status='confirmed' and cp.visible_in_archive),'[]'),
    'attendanceRecords',coalesce((select jsonb_agg(to_jsonb(cp)) from public.concert_participants cp where cp.user_id=caller.id),'[]'),
    'bucketList',coalesce((select jsonb_agg(to_jsonb(b)-'user_id') from public.bucket_list_artists b where b.user_id=caller.id),'[]'),
    'dismissedSuggestions',public.get_my_dismissed_suggestions(),
    'preferences',public.get_my_preferences(),
    'statsSharing',coalesce((select jsonb_agg(to_jsonb(s)) from public.stats_shares s where s.owner_id=caller.id),'[]')
  );
end;
$$;
revoke all on function public.export_my_data_base_20260928() from public,anon,authenticated;
revoke all on function public.export_my_data() from public,anon;
grant execute on function public.export_my_data() to authenticated;

-- Imports never turn pending/declined invitations into attendance or send invitations.
alter function public.import_my_concerts(jsonb) rename to import_my_concerts_base_20260928;
create or replace function public.import_my_concerts(payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item jsonb; cleaned jsonb:='[]';
begin
  perform public.assert_active_user();
  if jsonb_typeof(payload) is distinct from 'array' or jsonb_array_length(payload) not between 1 and 500 then raise exception 'Import must contain 1 to 500 concerts' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(payload) loop
    if item ? 'status' and item->>'status'<>'confirmed' then raise exception 'Only confirmed attendance can be imported' using errcode='22023'; end if;
    cleaned:=cleaned||jsonb_build_array(item-'concertId'-'attendeeUserIds'-'attendeeUsers'-'createdBy');
  end loop;
  return public.import_my_concerts_base_20260928(cleaned);
end;
$$;
revoke all on function public.import_my_concerts_base_20260928(jsonb) from public,anon,authenticated;
revoke all on function public.import_my_concerts(jsonb) from public,anon;
grant execute on function public.import_my_concerts(jsonb) to authenticated;
