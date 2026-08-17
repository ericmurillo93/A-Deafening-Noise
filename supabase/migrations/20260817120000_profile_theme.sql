alter table public.profiles add column if not exists theme text not null default 'archive';
alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles add constraint profiles_theme_check check (theme in ('archive', 'poster'));

create or replace function public.get_my_preferences()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare caller public.profiles;
begin
  caller := public.assert_active_user();
  return jsonb_build_object(
    'suggestionEmailEnabled', caller.suggestion_email_enabled,
    'theme', caller.theme
  );
end;
$$;

create or replace function public.update_my_profile(payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller public.profiles;
begin
  caller := public.assert_active_user();
  update public.profiles set
    display_name = case when payload ? 'displayName' then left(trim(payload->>'displayName'), 80) else display_name end,
    avatar_url = case when payload ? 'avatarUrl' then nullif(left(trim(payload->>'avatarUrl'), 500), '') else avatar_url end,
    city = case when payload ? 'city' then nullif(left(trim(payload->>'city'), 80), '') else city end,
    country = case when payload ? 'country' then nullif(left(trim(payload->>'country'), 80), '') else country end,
    discoverable = case when payload ? 'discoverable' then (payload->>'discoverable')::boolean else discoverable end,
    suggestion_email_enabled = case when payload ? 'suggestionEmailEnabled' then (payload->>'suggestionEmailEnabled')::boolean else suggestion_email_enabled end,
    theme = case when payload ? 'theme' then payload->>'theme' else theme end,
    updated_at = now()
  where id = caller.id;
  return public.get_app_data()->'profile' || public.get_my_preferences();
end;
$$;
