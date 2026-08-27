-- Staging-first product expansion: richer canonical events, complete activity,
-- notification preferences, safe bulk import and data-quality reporting.

alter table public.concerts
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists doors_at timestamptz,
  add column if not exists starts_at timestamptz,
  add column if not exists address text,
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6),
  add column if not exists promoter text,
  add column if not exists festival text,
  add column if not exists tour text,
  add column if not exists event_status text not null default 'announced',
  add column if not exists metadata_updated_at timestamptz;

alter table public.concerts drop constraint if exists concerts_event_status_check;
alter table public.concerts add constraint concerts_event_status_check
  check (event_status in ('announced','postponed','cancelled','sold_out'));
alter table public.concerts drop constraint if exists concerts_coordinates_check;
alter table public.concerts add constraint concerts_coordinates_check
  check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180));

update public.concerts set
  start_date = to_date(split_part(concert_date, ' - ', 1), 'DD/MM/YYYY'),
  end_date = case when concert_date like '% - %' then to_date(split_part(concert_date, ' - ', 2), 'DD/MM/YYYY') end,
  metadata_updated_at = coalesce(metadata_updated_at, created_at)
where start_date is null and split_part(concert_date, ' - ', 1) ~ '^\d{2}/\d{2}/\d{4}$';

create index if not exists concerts_start_date_idx on public.concerts(start_date);
create index if not exists concerts_status_date_idx on public.concerts(event_status,start_date);

create table if not exists public.concert_artists (
  concert_id bigint not null references public.concerts(id) on delete cascade,
  artist text not null,
  normalized_artist text not null,
  billing_order integer not null default 0 check (billing_order >= 0),
  role text not null default 'support' check (role in ('headliner','support')),
  primary key (concert_id, normalized_artist)
);

insert into public.concert_artists(concert_id,artist,normalized_artist,billing_order,role)
select id,artist,normalized_artist,0,'headliner' from public.concerts
on conflict (concert_id,normalized_artist) do nothing;

create table if not exists public.concert_sources (
  id bigint generated always as identity primary key,
  concert_id bigint not null references public.concerts(id) on delete cascade,
  source text not null,
  source_event_id text,
  source_url text,
  ticket_url text,
  observed_status text check (observed_status is null or observed_status in ('announced','postponed','cancelled','sold_out')),
  observed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  link_checked_at timestamptz,
  link_status smallint check (link_status is null or link_status between 100 and 599)
);
create unique index if not exists concert_sources_external_uidx
  on public.concert_sources(source,source_event_id) where source_event_id is not null;
create index if not exists concert_sources_concert_idx on public.concert_sources(concert_id,updated_at desc);

alter table public.concert_artists enable row level security;
alter table public.concert_sources enable row level security;
revoke all on public.concert_artists, public.concert_sources from public,anon,authenticated;
grant select,insert,update,delete on public.concert_artists,public.concert_sources to service_role;

alter table public.concert_participants add column if not exists responded_at timestamptz;
alter table public.concert_participants drop constraint if exists concert_participants_status_check;
alter table public.concert_participants add constraint concert_participants_status_check
  check (status in ('pending','interested','confirmed','declined'));

alter table public.notifications add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.notifications add column if not exists dedupe_key text;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'concert_invitation','friend_request','invitation_accepted','invitation_declined',
  'friend_request_accepted','friend_request_declined','concert_changed','ticket_available',
  'ticket_link_changed','selling_fast','spotify_reconnect'
));
create unique index if not exists notifications_dedupe_uidx on public.notifications(user_id,dedupe_key) where dedupe_key is not null;

create table if not exists public.notification_email_outbox (
  id bigint generated always as identity primary key,
  notification_id bigint not null unique references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.notification_email_outbox enable row level security;
revoke all on public.notification_email_outbox from public,anon,authenticated;
grant select,insert,update,delete on public.notification_email_outbox to service_role;

alter table public.profiles add column if not exists notification_preferences jsonb not null default
  '{"social":{"web":true,"email":true},"concertUpdates":{"web":true,"email":true},"ticketUpdates":{"web":true,"email":true},"suggestions":{"web":true,"email":false},"spotify":{"web":true,"email":true}}'::jsonb;
alter table public.profiles drop constraint if exists profiles_notification_preferences_check;
alter table public.profiles add constraint profiles_notification_preferences_check check (
  jsonb_typeof(notification_preferences)='object'
  and jsonb_typeof(notification_preferences->'social'->'web')='boolean'
  and jsonb_typeof(notification_preferences->'social'->'email')='boolean'
  and jsonb_typeof(notification_preferences->'concertUpdates'->'web')='boolean'
  and jsonb_typeof(notification_preferences->'concertUpdates'->'email')='boolean'
  and jsonb_typeof(notification_preferences->'ticketUpdates'->'web')='boolean'
  and jsonb_typeof(notification_preferences->'ticketUpdates'->'email')='boolean'
  and jsonb_typeof(notification_preferences->'suggestions'->'web')='boolean'
  and jsonb_typeof(notification_preferences->'suggestions'->'email')='boolean'
  and jsonb_typeof(notification_preferences->'spotify'->'web')='boolean'
  and jsonb_typeof(notification_preferences->'spotify'->'email')='boolean'
);

create or replace function public.queue_notification_email()
returns trigger language plpgsql security definer set search_path='' as $$
declare category text;
begin
  category:=case
    when new.kind in ('friend_request','friend_request_accepted','friend_request_declined','concert_invitation','invitation_accepted','invitation_declined') then 'social'
    when new.kind='concert_changed' then 'concertUpdates'
    when new.kind in ('ticket_available','ticket_link_changed','selling_fast') then 'ticketUpdates'
    when new.kind='spotify_reconnect' then 'spotify' end;
  if category is not null and coalesce((select (notification_preferences->category->>'email')::boolean from public.profiles where id=new.user_id),false) then
    insert into public.notification_email_outbox(notification_id,user_id) values(new.id,new.user_id) on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists queue_notification_email on public.notifications;
create trigger queue_notification_email after insert on public.notifications for each row execute function public.queue_notification_email();

create or replace function public.get_notification_email_batch(batch_size integer default 50)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('outboxId',o.id,'notificationId',n.id,'email',u.email,'displayName',p.display_name,
    'kind',n.kind,'actorName',a.display_name,'artist',c.artist,'venue',c.venue,'date',c.concert_date,'concertId',c.id) order by o.created_at)
    from (select * from public.notification_email_outbox where status='pending' and next_attempt_at<=now() and attempts<5 order by created_at limit least(greatest(batch_size,1),100)) o
    join public.notifications n on n.id=o.notification_id join public.profiles p on p.id=o.user_id join auth.users u on u.id=o.user_id
    left join public.profiles a on a.id=n.actor_id left join public.concerts c on c.id=n.concert_id
    where p.account_status='active' and coalesce(u.email,'')<>''),'[]'::jsonb);
end;
$$;

create or replace function public.complete_notification_email(outbox_id bigint,succeeded boolean,error_message text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
  update public.notification_email_outbox set attempts=attempts+1,status=case when succeeded then 'sent' when attempts+1>=5 then 'failed' else 'pending' end,
    sent_at=case when succeeded then now() else sent_at end,last_error=case when succeeded then null else left(error_message,500) end,
    next_attempt_at=case when succeeded then next_attempt_at else now()+make_interval(mins=>power(2,least(attempts,5))::integer*5) end where id=outbox_id;
end;
$$;

create or replace function public.respond_concert_invitation(target_concert bigint, accept_invitation boolean, response_bought boolean)
returns void language plpgsql security definer set search_path='' as $$
declare inviter uuid;
begin
  perform public.assert_active_user();
  select invited_by into inviter from public.concert_participants
  where concert_id=target_concert and user_id=auth.uid() and status='pending';
  if inviter is null then raise exception 'Invitation not found' using errcode='P0002'; end if;
  update public.concert_participants set
    status=case when accept_invitation then 'confirmed' else 'declined' end,
    bought=case when accept_invitation then coalesce(response_bought,true) else bought end,
    confirmed_at=case when accept_invitation then now() else confirmed_at end,
    responded_at=now()
  where concert_id=target_concert and user_id=auth.uid() and status='pending';
  insert into public.notifications(user_id,actor_id,concert_id,kind,dedupe_key)
  values(inviter,auth.uid(),target_concert,case when accept_invitation then 'invitation_accepted' else 'invitation_declined' end,
    'invitation-response:'||target_concert||':'||auth.uid()) on conflict do nothing;
end;
$$;

create or replace function public.set_concert_invitation_status(target_concert bigint,new_status text,response_bought boolean default true)
returns void language plpgsql security definer set search_path='' as $$
declare inviter uuid; previous_status text;
begin
  perform public.assert_active_user();
  if new_status not in ('interested','confirmed','declined') then raise exception 'Invalid invitation response' using errcode='22023'; end if;
  select invited_by,status into inviter,previous_status from public.concert_participants
  where concert_id=target_concert and user_id=auth.uid() and status in ('pending','interested');
  if inviter is null then raise exception 'Invitation not found' using errcode='P0002'; end if;
  update public.concert_participants set status=new_status,bought=case when new_status='confirmed' then coalesce(response_bought,true) else bought end,
    confirmed_at=case when new_status='confirmed' then now() else confirmed_at end,responded_at=now()
  where concert_id=target_concert and user_id=auth.uid();
  if new_status in ('confirmed','declined') then
    insert into public.notifications(user_id,actor_id,concert_id,kind,dedupe_key)
    values(inviter,auth.uid(),target_concert,case when new_status='confirmed' then 'invitation_accepted' else 'invitation_declined' end,
      'invitation-response:'||target_concert||':'||auth.uid()) on conflict do nothing;
  end if;
end;
$$;

alter function public.upsert_my_concert(jsonb) rename to upsert_my_concert_base_20260827;
create or replace function public.upsert_my_concert(payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; target_id bigint; caller public.profiles; old_event public.concerts; friend_id uuid;
begin
  caller:=public.assert_active_user();
  if payload ? 'eventStatus' and payload->>'eventStatus' not in ('announced','postponed','cancelled','sold_out') then
    raise exception 'Invalid concert status' using errcode='22023';
  end if;
  target_id:=nullif(payload->>'concertId','')::bigint;
  if target_id is not null then select * into old_event from public.concerts where id=target_id; end if;
  result:=public.upsert_my_concert_base_20260827(payload);
  target_id:=(result->>'concertId')::bigint;
  if caller.role='admin' or exists(select 1 from public.concerts where id=target_id and created_by=caller.id) then
    update public.concerts set
      start_date=to_date(split_part(concert_date,' - ',1),'DD/MM/YYYY'),
      end_date=case when concert_date like '% - %' then to_date(split_part(concert_date,' - ',2),'DD/MM/YYYY') end,
      doors_at=case when payload ? 'doorsAt' then nullif(payload->>'doorsAt','')::timestamptz else doors_at end,
      starts_at=case when payload ? 'startsAt' then nullif(payload->>'startsAt','')::timestamptz else starts_at end,
      address=case when payload ? 'address' then nullif(left(trim(payload->>'address'),300),'') else address end,
      latitude=case when payload ? 'latitude' then nullif(payload->>'latitude','')::numeric else latitude end,
      longitude=case when payload ? 'longitude' then nullif(payload->>'longitude','')::numeric else longitude end,
      promoter=case when payload ? 'promoter' then nullif(left(trim(payload->>'promoter'),120),'') else promoter end,
      festival=case when payload ? 'festival' then nullif(left(trim(payload->>'festival'),120),'') else festival end,
      tour=case when payload ? 'tour' then nullif(left(trim(payload->>'tour'),120),'') else tour end,
      event_status=coalesce(nullif(payload->>'eventStatus',''),event_status), metadata_updated_at=now()
    where id=target_id;
    delete from public.concert_artists where concert_id=target_id;
    insert into public.concert_artists(concert_id,artist,normalized_artist,billing_order,role)
    select target_id, value->>'artist', public.normalize_concert_value(value->>'artist'), ordinality-1,
      case when ordinality=1 then 'headliner' else 'support' end
    from jsonb_array_elements(coalesce(payload->'lineup',jsonb_build_array(jsonb_build_object('artist',payload->>'artist')))) with ordinality
    where nullif(trim(value->>'artist'),'') is not null on conflict do nothing;
    if nullif(trim(payload->>'source'),'') is not null then
      insert into public.concert_sources(concert_id,source,source_event_id,source_url,ticket_url,observed_status,observed_at,updated_at)
      values(target_id,left(trim(payload->>'source'),100),nullif(left(trim(payload->>'sourceEventId'),300),''),nullif(left(trim(payload->>'sourceUrl'),2000),''),
        nullif(left(trim(payload->>'ticketUrl'),2000),''),coalesce(nullif(payload->>'eventStatus',''),'announced'),now(),now())
      on conflict(source,source_event_id) where source_event_id is not null do update set concert_id=excluded.concert_id,source_url=excluded.source_url,
        ticket_url=excluded.ticket_url,observed_status=excluded.observed_status,observed_at=now(),updated_at=now();
    end if;
  end if;
  if old_event.id is not null and old_event.start_date>=current_date and
    (old_event.concert_date,old_event.venue,old_event.ticket_url,old_event.event_status)
      is distinct from ((select concert_date from public.concerts where id=target_id),(select venue from public.concerts where id=target_id),(select ticket_url from public.concerts where id=target_id),(select event_status from public.concerts where id=target_id)) then
    for friend_id in select user_id from public.concert_participants where concert_id=target_id and user_id<>caller.id and status in ('pending','confirmed') loop
      insert into public.notifications(user_id,actor_id,concert_id,kind,metadata,dedupe_key)
      values(friend_id,caller.id,target_id,'concert_changed',jsonb_build_object('oldDate',old_event.concert_date,'oldVenue',old_event.venue),
        'concert-change:'||target_id||':'||extract(epoch from now())::bigint) on conflict do nothing;
    end loop;
  end if;
  return result;
end;
$$;

alter function public.get_app_data() rename to get_app_data_base_20260827;
create or replace function public.get_app_data()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; enriched jsonb; invitations jsonb;
begin
  result:=public.get_app_data_base_20260827();
  select coalesce(jsonb_agg(item.value||jsonb_strip_nulls(jsonb_build_object(
    'startDate',c.start_date,'endDate',c.end_date,'doorsAt',c.doors_at,'startsAt',c.starts_at,
    'address',c.address,'latitude',c.latitude,'longitude',c.longitude,'promoter',c.promoter,
    'festival',c.festival,'tour',c.tour,'eventStatus',c.event_status,'metadataUpdatedAt',c.metadata_updated_at,
    'lineup',(select jsonb_agg(jsonb_build_object('artist',ca.artist,'role',ca.role) order by ca.billing_order) from public.concert_artists ca where ca.concert_id=c.id),
    'sources',(select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('source',cs.source,'url',cs.source_url,'updatedAt',cs.updated_at)) order by cs.updated_at desc) from public.concert_sources cs where cs.concert_id=c.id),
    'attendeeUsers',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'status',cp.status,'confirmedAt',cp.confirmed_at,'respondedAt',cp.responded_at) order by p.display_name),'[]'::jsonb) from public.concert_participants cp join public.profiles p on p.id=cp.user_id where cp.concert_id=c.id and cp.user_id<>auth.uid() and (cp.invited_by=auth.uid() or exists(select 1 from public.concert_participants own where own.concert_id=c.id and own.user_id=auth.uid() and own.invited_by=cp.user_id)))
  )) order by item.ordinality),'[]'::jsonb) into enriched
  from jsonb_array_elements(result->'concerts') with ordinality item(value,ordinality)
  join public.concerts c on c.id=(item.value->>'concertId')::bigint;
  select coalesce(jsonb_agg(jsonb_build_object('concertId',c.id,'artist',c.artist,'venue',c.venue,'date',c.concert_date,
    'status',cp.status,'invitedBy',inviter.display_name) order by cp.created_at desc),'[]'::jsonb) into invitations
  from public.concert_participants cp join public.concerts c on c.id=cp.concert_id left join public.profiles inviter on inviter.id=cp.invited_by
  where cp.user_id=auth.uid() and cp.status in ('pending','interested');
  return jsonb_set(jsonb_set(result,'{concerts}',enriched),'{concertInvitations}',invitations);
end;
$$;

create or replace function public.get_my_preferences()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller public.profiles;
begin
  caller:=public.assert_active_user();
  return jsonb_build_object('suggestionEmailEnabled',caller.suggestion_email_enabled,'theme',caller.theme,'notificationPreferences',caller.notification_preferences);
end;
$$;

alter function public.update_my_profile(jsonb) rename to update_my_profile_base_20260827;
create or replace function public.update_my_profile(payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prefs jsonb; result jsonb;
begin
  if payload ? 'notificationPreferences' then
    prefs:=payload->'notificationPreferences';
    if jsonb_typeof(prefs)<>'object' or exists(select 1 from unnest(array['social','concertUpdates','ticketUpdates','suggestions','spotify']) category
      where jsonb_typeof(prefs->category)<>'object' or jsonb_typeof(prefs->category->'web')<>'boolean' or jsonb_typeof(prefs->category->'email')<>'boolean') then
      raise exception 'Invalid notification preferences' using errcode='22023';
    end if;
    update public.profiles set notification_preferences=prefs where id=auth.uid();
  end if;
  result:=public.update_my_profile_base_20260827(payload-'notificationPreferences');
  return result||public.get_my_preferences();
end;
$$;

create or replace function public.import_my_concerts(payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; imported integer:=0; reused integer:=0; result jsonb;
begin
  perform public.assert_active_user();
  if jsonb_typeof(payload)<>'array' or jsonb_array_length(payload)>500 then raise exception 'Import must contain 1 to 500 concerts' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(payload) loop
    if nullif(trim(item->>'artist'),'') is null or nullif(trim(item->>'date'),'') is null or nullif(trim(item->>'city'),'') is null or upper(item->>'country') !~ '^[A-Z]{2}$' then
      raise exception 'Every concert needs artist, date, city and a two-letter country code' using errcode='22023';
    end if;
    result:=public.upsert_my_concert(item||jsonb_build_object('bought',case when to_date(split_part(item->>'date',' - ',1),'DD/MM/YYYY')<current_date then true else coalesce((item->>'bought')::boolean,false) end));
    imported:=imported+1; if coalesce((result->>'matchedExisting')::boolean,false) then reused:=reused+1; end if;
  end loop;
  return jsonb_build_object('imported',imported,'reused',reused,'created',imported-reused);
end;
$$;

create or replace function public.admin_data_quality()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and account_status='active') then raise exception 'Admin access required' using errcode='42501'; end if;
  return jsonb_build_object(
    'missingLocation',coalesce((select jsonb_agg(jsonb_build_object('id',id,'artist',artist,'venue',venue,'date',concert_date)) from public.concerts where nullif(trim(city),'') is null or country !~ '^[A-Z]{2}$'),'[]'::jsonb),
    'missingCreator',coalesce((select jsonb_agg(jsonb_build_object('id',id,'artist',artist,'date',concert_date)) from public.concerts where created_by is null),'[]'::jsonb),
    'missingSetlist',coalesce((select jsonb_agg(jsonb_build_object('id',id,'artist',artist,'date',concert_date)) from public.concerts where start_date<current_date and setlist_id is null limit 100),'[]'::jsonb),
    'missingArtwork',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'artist',c.artist,'date',c.concert_date)) from public.concerts c where not exists(select 1 from public.artist_images ai where ai.normalized_artist=c.normalized_artist) limit 100),'[]'::jsonb),
    'possibleDuplicates',coalesce((select jsonb_agg(row_to_json(d)) from (select normalized_artist as artist,normalized_venue as venue,concert_date as date,count(*) as count from public.concerts group by 1,2,3 having count(*)>1 order by count(*) desc limit 100)d),'[]'::jsonb),
    'uncheckedLinks',coalesce((select jsonb_agg(jsonb_build_object('id',id,'source',source,'url',coalesce(ticket_url,source_url))) from public.concert_sources where coalesce(ticket_url,source_url) is not null and (link_checked_at is null or link_checked_at<now()-interval '30 days') limit 100),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.upsert_my_concert_base_20260827(jsonb),public.get_app_data_base_20260827(),public.update_my_profile_base_20260827(jsonb) from public,anon,authenticated;
revoke all on function public.upsert_my_concert(jsonb),public.get_app_data(),public.get_my_preferences(),public.update_my_profile(jsonb),public.import_my_concerts(jsonb),public.admin_data_quality(),public.set_concert_invitation_status(bigint,text,boolean) from public,anon;
grant execute on function public.upsert_my_concert(jsonb),public.get_app_data(),public.get_my_preferences(),public.update_my_profile(jsonb),public.import_my_concerts(jsonb),public.admin_data_quality(),public.set_concert_invitation_status(bigint,text,boolean) to authenticated;
revoke all on function public.get_notification_email_batch(integer),public.complete_notification_email(bigint,boolean,text) from public,anon,authenticated;
grant execute on function public.get_notification_email_batch(integer),public.complete_notification_email(bigint,boolean,text) to service_role;
