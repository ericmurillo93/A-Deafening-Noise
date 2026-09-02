-- Discovery location belongs to each user; Spotify remains an optional taste source.
alter table public.profiles add column if not exists discovery_countries text[] not null default '{}';
alter table public.profiles drop constraint if exists profiles_discovery_countries_check;
alter table public.profiles add constraint profiles_discovery_countries_check check (
  cardinality(discovery_countries) <= 5
  and array_to_string(discovery_countries,',') ~ '^([A-Z]{2})(,[A-Z]{2})*$|^$'
);

update public.profiles set discovery_countries=case
  when role='admin' then array['ES','CH']
  when lower(coalesce(country,'')) in ('spain','españa','es') then array['ES']
  when lower(coalesce(country,'')) in ('switzerland','schweiz','suisse','svizzera','ch') then array['CH']
  else discovery_countries end
where cardinality(discovery_countries)=0;

create or replace function public.get_my_preferences()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller public.profiles;
begin
  caller:=public.assert_active_user();
  return jsonb_build_object(
    'suggestionEmailEnabled',caller.suggestion_email_enabled,
    'theme',caller.theme,
    'notificationPreferences',caller.notification_preferences,
    'profileVisibility',caller.profile_visibility,
    'discoveryCountries',caller.discovery_countries
  );
end;
$$;

alter function public.update_my_profile(jsonb) rename to update_my_profile_base_20260901;
create or replace function public.update_my_profile(payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare countries text[]; result jsonb;
begin
  perform public.assert_active_user();
  if payload ? 'discoveryCountries' then
    if jsonb_typeof(payload->'discoveryCountries')<>'array' then raise exception 'Invalid discovery countries' using errcode='22023'; end if;
    select coalesce(array_agg(distinct upper(value) order by upper(value)),'{}') into countries
    from jsonb_array_elements_text(payload->'discoveryCountries');
    if cardinality(countries)>5 or exists(select 1 from unnest(countries) country where country !~ '^[A-Z]{2}$') then
      raise exception 'Choose up to five two-letter country codes' using errcode='22023';
    end if;
    update public.profiles set discovery_countries=countries,updated_at=now() where id=auth.uid();
  end if;
  result:=public.update_my_profile_base_20260901(payload-'discoveryCountries');
  return result||public.get_my_preferences();
end;
$$;

create or replace function public.get_my_listened_artists()
returns text[] language plpgsql stable security definer set search_path='' as $$
begin
  perform public.assert_active_user();
  return coalesce(array(
    select artist from (
      select artist_name artist from public.user_listened_artists where user_id=auth.uid()
      union
      select ca.artist from public.concert_participants cp join public.concert_artists ca on ca.concert_id=cp.concert_id
        where cp.user_id=auth.uid() and cp.status='confirmed'
      union
      select artist from public.bucket_list_artists where user_id=auth.uid()
    ) affinity order by lower(artist),artist
  ),'{}');
end;
$$;

create or replace function public.get_active_discovery_countries()
returns text[] language plpgsql stable security definer set search_path='' as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
  return coalesce(array(
    select distinct selected.code
    from public.profiles profile
    cross join unnest(profile.discovery_countries) as selected(code)
    where profile.account_status='active'
    order by selected.code
  ),'{}');
end;
$$;

create or replace function public.get_suggestion_notification_recipients()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'userId',p.id,'email',p.email,'displayName',p.display_name,'countries',p.discovery_countries,
    'artists',coalesce((select jsonb_agg(artist) from (
      select artist_name artist from public.user_listened_artists where user_id=p.id
      union select ca.artist from public.concert_participants cp join public.concert_artists ca on ca.concert_id=cp.concert_id where cp.user_id=p.id and cp.status='confirmed'
      union select artist from public.bucket_list_artists where user_id=p.id
    ) affinity),'[]'),
    'dismissed',coalesce((select jsonb_agg(suggestion_key) from public.user_dismissed_suggestions where user_id=p.id),'[]'),
    'concerts',coalesce((select jsonb_agg(lower(c.artist)||'|'||c.concert_date) from public.concert_participants cp join public.concerts c on c.id=cp.concert_id where cp.user_id=p.id and cp.status='confirmed'),'[]')
  )) from public.profiles p where p.account_status='active' and p.suggestion_email_enabled),'[]');
end;
$$;

revoke all on function public.update_my_profile_base_20260901(jsonb) from public,anon,authenticated;
revoke all on function public.update_my_profile(jsonb),public.get_my_listened_artists() from public,anon;
revoke all on function public.get_active_discovery_countries(),public.get_suggestion_notification_recipients() from public,anon,authenticated;
grant execute on function public.update_my_profile(jsonb),public.get_my_listened_artists() to authenticated;
grant execute on function public.get_active_discovery_countries(),public.get_suggestion_notification_recipients() to service_role;
