-- Staging follow-up: preference-aware activity, ticket-change events and a
-- broader catalog quality report discovered while exercising the first cut.

alter function public.get_app_data() rename to get_app_data_base_20260827_preferences;
create or replace function public.get_app_data()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; filtered jsonb; prefs jsonb;
begin
  result:=public.get_app_data_base_20260827_preferences();
  select notification_preferences into prefs from public.profiles where id=auth.uid();
  select coalesce(jsonb_agg(item.value order by item.ordinality),'[]'::jsonb) into filtered
  from jsonb_array_elements(result->'notifications') with ordinality item(value,ordinality)
  where coalesce((prefs->(case
    when item.value->>'kind' in ('friend_request','friend_request_accepted','friend_request_declined','concert_invitation','invitation_accepted','invitation_declined') then 'social'
    when item.value->>'kind'='concert_changed' then 'concertUpdates'
    when item.value->>'kind' in ('ticket_available','ticket_link_changed','selling_fast') then 'ticketUpdates'
    when item.value->>'kind'='spotify_reconnect' then 'spotify' else 'social' end)->>'web')::boolean,true);
  return jsonb_set(result,'{notifications}',filtered);
end;
$$;

create or replace function public.notify_ticket_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid; notification_kind text;
begin
  if old.ticket_url is not distinct from new.ticket_url or coalesce(new.start_date,current_date-1)<current_date then return new; end if;
  notification_kind:=case when old.ticket_url is null and new.ticket_url is not null then 'ticket_available' else 'ticket_link_changed' end;
  for recipient in select user_id from public.concert_participants where concert_id=new.id and user_id<>auth.uid() and status in ('pending','interested','confirmed') loop
    insert into public.notifications(user_id,actor_id,concert_id,kind,dedupe_key)
    values(recipient,auth.uid(),new.id,notification_kind,'ticket:'||new.id||':'||notification_kind||':'||md5(coalesce(new.ticket_url,''))) on conflict do nothing;
  end loop;
  return new;
end;
$$;
drop trigger if exists notify_ticket_change on public.concerts;
create trigger notify_ticket_change after update of ticket_url on public.concerts for each row execute function public.notify_ticket_change();

create or replace function public.admin_data_quality()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and account_status='active') then raise exception 'Admin access required' using errcode='42501'; end if;
  return jsonb_build_object(
    'artistLabels',coalesce((select jsonb_agg(row_to_json(d)) from (select normalized_artist as artist,array_agg(distinct artist order by artist) labels,count(*) count from public.concerts group by 1 having count(distinct artist)>1 order by count(*) desc limit 100)d),'[]'::jsonb),
    'venueLabels',coalesce((select jsonb_agg(row_to_json(d)) from (select normalized_venue as venue,array_agg(distinct venue order by venue) labels,count(*) count from public.concerts group by 1 having count(distinct venue)>1 order by count(*) desc limit 100)d),'[]'::jsonb),
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

revoke all on function public.get_app_data_base_20260827_preferences() from public,anon,authenticated;
revoke all on function public.get_app_data(),public.admin_data_quality() from public,anon;
grant execute on function public.get_app_data(),public.admin_data_quality() to authenticated;
