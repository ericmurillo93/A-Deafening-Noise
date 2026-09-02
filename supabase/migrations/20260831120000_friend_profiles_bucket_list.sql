-- Friend profiles stay private to accepted friends. Each owner chooses which
-- concert sections are visible; bucket-list completion is derived from their archive.

alter table public.profiles add column if not exists profile_visibility jsonb not null default
  '{"stats":true,"lastConcert":true,"nextConcert":true,"bucketList":true}'::jsonb;
alter table public.profiles drop constraint if exists profiles_profile_visibility_check;
alter table public.profiles add constraint profiles_profile_visibility_check check (
  jsonb_typeof(profile_visibility)='object'
  and jsonb_typeof(profile_visibility->'stats')='boolean'
  and jsonb_typeof(profile_visibility->'lastConcert')='boolean'
  and jsonb_typeof(profile_visibility->'nextConcert')='boolean'
  and jsonb_typeof(profile_visibility->'bucketList')='boolean'
);

create table public.bucket_list_artists (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  artist text not null check (length(trim(artist)) between 1 and 120),
  normalized_artist text not null,
  created_at timestamptz not null default now(),
  unique(user_id,normalized_artist)
);
create index bucket_list_artists_user_idx on public.bucket_list_artists(user_id,created_at);
alter table public.bucket_list_artists enable row level security;
revoke all on public.bucket_list_artists from public,anon,authenticated;

create or replace function public.get_my_preferences()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller public.profiles;
begin
  caller:=public.assert_active_user();
  return jsonb_build_object(
    'suggestionEmailEnabled',caller.suggestion_email_enabled,
    'theme',caller.theme,
    'notificationPreferences',caller.notification_preferences,
    'profileVisibility',caller.profile_visibility
  );
end;
$$;

alter function public.update_my_profile(jsonb) rename to update_my_profile_base_20260831;
create or replace function public.update_my_profile(payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare visibility jsonb; result jsonb;
begin
  perform public.assert_active_user();
  if payload ? 'profileVisibility' then
    visibility:=payload->'profileVisibility';
    if jsonb_typeof(visibility)<>'object'
      or exists(select 1 from unnest(array['stats','lastConcert','nextConcert','bucketList']) section
        where jsonb_typeof(visibility->section)<>'boolean') then
      raise exception 'Invalid profile visibility settings' using errcode='22023';
    end if;
    update public.profiles set profile_visibility=visibility,updated_at=now() where id=auth.uid();
  end if;
  result:=public.update_my_profile_base_20260831(payload-'profileVisibility');
  return result||public.get_my_preferences();
end;
$$;

create or replace function public.bucket_list_rows(owner uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'artist',b.artist,'addedAt',b.created_at,
    'seen',exists(
      select 1 from public.concert_participants cp
      join public.concerts c on c.id=cp.concert_id
      join public.concert_artists ca on ca.concert_id=c.id
      where cp.user_id=owner and cp.status='confirmed' and cp.bought and cp.visible_in_archive
        and c.start_date<current_date and ca.normalized_artist=b.normalized_artist
    )) order by b.created_at,b.artist),'[]'::jsonb)
  from public.bucket_list_artists b where b.user_id=owner;
$$;

create or replace function public.get_my_bucket_list()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform public.assert_active_user();
  return public.bucket_list_rows(auth.uid());
end;
$$;

create or replace function public.add_bucket_list_artist(artist_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare clean_name text;
begin
  perform public.assert_active_user();
  clean_name:=upper(trim(artist_name));
  if length(clean_name) not between 1 and 120 then raise exception 'Enter an artist name' using errcode='22023'; end if;
  insert into public.bucket_list_artists(user_id,artist,normalized_artist)
  values(auth.uid(),clean_name,public.normalize_concert_value(clean_name))
  on conflict(user_id,normalized_artist) do nothing;
  return public.bucket_list_rows(auth.uid());
end;
$$;

create or replace function public.remove_bucket_list_artist(bucket_artist_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_active_user();
  delete from public.bucket_list_artists where id=bucket_artist_id and user_id=auth.uid();
  return public.bucket_list_rows(auth.uid());
end;
$$;

create or replace function public.get_friend_profile(friend_user uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare friend public.profiles; visibility jsonb; result jsonb;
begin
  perform public.assert_active_user();
  if not public.are_friends(auth.uid(),friend_user) then
    raise exception 'This profile is only available to friends' using errcode='42501';
  end if;
  select * into friend from public.profiles where id=friend_user and account_status='active';
  if friend.id is null then raise exception 'Profile not found' using errcode='P0002'; end if;
  visibility:=friend.profile_visibility;
  result:=jsonb_build_object('profile',jsonb_build_object(
    'id',friend.id,'displayName',friend.display_name,'username',friend.username,
    'avatarUrl',friend.avatar_url,'city',friend.city,'country',friend.country
  ),'visibility',visibility);
  if (visibility->>'stats')::boolean then
    result:=result||jsonb_build_object('stats',jsonb_build_object(
      'concerts',(select count(*) from public.concert_participants cp where cp.user_id=friend_user and cp.status='confirmed' and cp.bought and cp.visible_in_archive and exists(select 1 from public.concerts c where c.id=cp.concert_id and c.start_date<current_date)),
      'artists',(select count(distinct c.normalized_artist) from public.concert_participants cp join public.concerts c on c.id=cp.concert_id where cp.user_id=friend_user and cp.status='confirmed' and cp.bought and cp.visible_in_archive and c.start_date<current_date),
      'venues',(select count(distinct c.normalized_venue) from public.concert_participants cp join public.concerts c on c.id=cp.concert_id where cp.user_id=friend_user and cp.status='confirmed' and cp.bought and cp.visible_in_archive and c.start_date<current_date),
      'countries',(select count(distinct c.country) from public.concert_participants cp join public.concerts c on c.id=cp.concert_id where cp.user_id=friend_user and cp.status='confirmed' and cp.bought and cp.visible_in_archive and c.start_date<current_date and c.country is not null)
    ));
  end if;
  if (visibility->>'lastConcert')::boolean then
    result:=result||jsonb_build_object('lastConcert',(select jsonb_build_object('concertId',c.id,'artist',c.artist,'venue',c.venue,'city',c.city,'country',c.country,'date',c.concert_date)
      from public.concert_participants cp join public.concerts c on c.id=cp.concert_id
      where cp.user_id=friend_user and cp.status='confirmed' and cp.bought and cp.visible_in_archive and c.start_date<current_date order by c.start_date desc,c.id desc limit 1));
  end if;
  if (visibility->>'nextConcert')::boolean then
    result:=result||jsonb_build_object('nextConcert',(select jsonb_build_object('concertId',c.id,'artist',c.artist,'venue',c.venue,'city',c.city,'country',c.country,'date',c.concert_date)
      from public.concert_participants cp join public.concerts c on c.id=cp.concert_id
      where cp.user_id=friend_user and cp.status='confirmed' and cp.bought and cp.visible_in_archive and c.start_date>=current_date order by c.start_date,c.id limit 1));
  end if;
  if (visibility->>'bucketList')::boolean then result:=result||jsonb_build_object('bucketList',public.bucket_list_rows(friend_user)); end if;
  return result;
end;
$$;

revoke all on function public.update_my_profile_base_20260831(jsonb),public.bucket_list_rows(uuid) from public,anon,authenticated;
revoke all on function public.get_my_preferences(),public.update_my_profile(jsonb),public.get_my_bucket_list(),public.add_bucket_list_artist(text),public.remove_bucket_list_artist(bigint),public.get_friend_profile(uuid) from public,anon;
grant execute on function public.get_my_preferences(),public.update_my_profile(jsonb),public.get_my_bucket_list(),public.add_bucket_list_artist(text),public.remove_bucket_list_artist(bigint),public.get_friend_profile(uuid) to authenticated;
