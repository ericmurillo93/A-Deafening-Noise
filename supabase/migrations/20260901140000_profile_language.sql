-- Language follows the account across devices. English remains the safe fallback.
alter table public.profiles add column if not exists language text not null default 'en';
alter table public.profiles drop constraint if exists profiles_language_check;
alter table public.profiles add constraint profiles_language_check check (language in ('en','es'));

create or replace function public.get_my_preferences()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller public.profiles;
begin
  caller:=public.assert_active_user();
  return jsonb_build_object(
    'suggestionEmailEnabled',caller.suggestion_email_enabled,
    'theme',caller.theme,
    'language',caller.language,
    'notificationPreferences',caller.notification_preferences,
    'profileVisibility',caller.profile_visibility,
    'discoveryCountries',caller.discovery_countries
  );
end;
$$;

alter function public.update_my_profile(jsonb) rename to update_my_profile_base_20260901_language;
create or replace function public.update_my_profile(payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare requested_language text; result jsonb;
begin
  perform public.assert_active_user();
  if payload ? 'language' then
    requested_language:=lower(trim(payload->>'language'));
    if requested_language not in ('en','es') then raise exception 'Invalid language' using errcode='22023'; end if;
    update public.profiles set language=requested_language,updated_at=now() where id=auth.uid();
  end if;
  result:=public.update_my_profile_base_20260901_language(payload-'language');
  return result||public.get_my_preferences();
end;
$$;

revoke all on function public.update_my_profile_base_20260901_language(jsonb) from public,anon,authenticated;
revoke all on function public.get_my_preferences(),public.update_my_profile(jsonb) from public,anon;
grant execute on function public.get_my_preferences(),public.update_my_profile(jsonb) to authenticated;
