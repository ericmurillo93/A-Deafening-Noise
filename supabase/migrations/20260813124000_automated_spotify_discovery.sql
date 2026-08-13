create extension if not exists supabase_vault with schema vault;

alter table public.spotify_connections add column refresh_secret_id uuid;
alter table public.spotify_connections add column authorized_at timestamptz;
alter table public.spotify_connections add column reauthorization_required boolean not null default false;
alter table public.profiles add column suggestion_email_enabled boolean not null default false;

update public.spotify_connections
set reauthorization_required = true
where refresh_secret_id is null;

create or replace function public.replace_spotify_artists(target_user uuid, payload jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; artist_count integer := 0;
begin
  if payload is null or jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) > 150 then
    raise exception 'Invalid Spotify artist list' using errcode = '22023';
  end if;
  delete from public.user_listened_artists where user_id = target_user;
  for item in select value from jsonb_array_elements(payload) loop
    if nullif(trim(item->>'spotifyId'), '') is not null and nullif(trim(item->>'name'), '') is not null then
      insert into public.user_listened_artists(user_id, spotify_artist_id, artist_name, time_ranges)
      values(target_user, left(item->>'spotifyId', 200), left(item->>'name', 300),
        array(select value from jsonb_array_elements_text(coalesce(item->'ranges', '[]'::jsonb)) where value in ('short_term','medium_term','long_term')))
      on conflict(user_id, spotify_artist_id) do nothing;
      artist_count := artist_count + 1;
    end if;
  end loop;
  return artist_count;
end;
$$;

create or replace function public.sync_my_spotify_artists(payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare secret_id uuid; refresh_token text; artist_count integer;
begin
  perform public.assert_active_user();
  if nullif(trim(payload->>'spotifyUserId'), '') is null or nullif(trim(payload->>'displayName'), '') is null then
    raise exception 'Invalid Spotify profile' using errcode = '22023';
  end if;
  refresh_token := nullif(payload->>'refreshToken', '');
  if refresh_token is not null and length(refresh_token) > 2000 then
    raise exception 'Invalid Spotify refresh token' using errcode = '22023';
  end if;
  select refresh_secret_id into secret_id from public.spotify_connections where user_id = auth.uid();
  if refresh_token is not null then
    if secret_id is null then
      secret_id := vault.create_secret(refresh_token, 'spotify-' || auth.uid()::text, 'Spotify refresh token for A Deafening Noise');
    else
      perform vault.update_secret(secret_id, refresh_token);
    end if;
  end if;
  if secret_id is null then
    raise exception 'Spotify must be reconnected to enable automatic updates' using errcode = '22023';
  end if;
  insert into public.spotify_connections(user_id, spotify_user_id, display_name, synced_at, refresh_secret_id, authorized_at, reauthorization_required)
  values(auth.uid(), left(payload->>'spotifyUserId', 200), left(payload->>'displayName', 200), now(), secret_id, now(), false)
  on conflict(user_id) do update set spotify_user_id=excluded.spotify_user_id, display_name=excluded.display_name,
    synced_at=now(), refresh_secret_id=excluded.refresh_secret_id,
    authorized_at=case when refresh_token is not null then now() else public.spotify_connections.authorized_at end,
    reauthorization_required=false;
  artist_count := public.replace_spotify_artists(auth.uid(), payload->'artists');
  return jsonb_build_object('connected', true, 'displayName', left(payload->>'displayName', 200), 'syncedAt', now(),
    'artistCount', artist_count, 'needsReauthorization', false);
end;
$$;

create or replace function public.get_my_spotify_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when sc.user_id is null then jsonb_build_object('connected', false)
    else jsonb_build_object('connected', true, 'displayName', sc.display_name, 'syncedAt', sc.synced_at,
      'artistCount', (select count(*) from public.user_listened_artists ula where ula.user_id = auth.uid()),
      'needsReauthorization', sc.reauthorization_required) end
  from (select auth.uid() as user_id) caller
  left join public.spotify_connections sc on sc.user_id = caller.user_id;
$$;

create or replace function public.get_my_listened_artists()
returns text[] language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_active_user();
  return coalesce(array(select artist_name from public.user_listened_artists where user_id = auth.uid() order by artist_name), '{}'::text[]);
end;
$$;

create or replace function public.get_my_preferences()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare caller public.profiles;
begin
  caller := public.assert_active_user();
  return jsonb_build_object('suggestionEmailEnabled', caller.suggestion_email_enabled);
end;
$$;

create or replace function public.get_my_access()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare caller public.profiles;
begin
  caller := public.assert_active_user();
  return jsonb_build_object('role', caller.role);
end;
$$;

create or replace function public.update_my_profile(payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller public.profiles;
begin
  caller := public.assert_active_user();
  update public.profiles set
    display_name = left(trim(coalesce(payload->>'displayName', display_name)), 80),
    avatar_url = nullif(left(trim(payload->>'avatarUrl'), 500), ''),
    city = nullif(left(trim(payload->>'city'), 80), ''),
    country = nullif(left(trim(payload->>'country'), 80), ''),
    discoverable = coalesce((payload->>'discoverable')::boolean, discoverable),
    suggestion_email_enabled = coalesce((payload->>'suggestionEmailEnabled')::boolean, suggestion_email_enabled),
    updated_at = now()
  where id = caller.id;
  return public.get_app_data()->'profile' || public.get_my_preferences();
end;
$$;

create or replace function public.get_spotify_sync_accounts()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service access required' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('userId', sc.user_id, 'refreshToken', secrets.decrypted_secret))
    from public.spotify_connections sc join vault.decrypted_secrets secrets on secrets.id = sc.refresh_secret_id
    join public.profiles p on p.id = sc.user_id where p.account_status = 'active'), '[]'::jsonb);
end;
$$;

create or replace function public.complete_spotify_background_sync(target_user uuid, payload jsonb, rotated_refresh_token text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare secret_id uuid; artist_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Service access required' using errcode = '42501'; end if;
  select refresh_secret_id into secret_id from public.spotify_connections where user_id = target_user;
  if secret_id is null then raise exception 'Spotify connection not found' using errcode = 'P0002'; end if;
  if nullif(rotated_refresh_token, '') is not null then perform vault.update_secret(secret_id, rotated_refresh_token); end if;
  artist_count := public.replace_spotify_artists(target_user, payload);
  update public.spotify_connections set synced_at=now(), reauthorization_required=false where user_id=target_user;
  return artist_count;
end;
$$;

create or replace function public.mark_spotify_reauthorization_required(target_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service access required' using errcode = '42501'; end if;
  update public.spotify_connections set reauthorization_required=true where user_id=target_user;
end;
$$;

create or replace function public.get_suggestion_notification_recipients()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service access required' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'userId', p.id, 'email', p.email, 'displayName', p.display_name,
    'artists', coalesce((select jsonb_agg(ula.artist_name) from public.user_listened_artists ula where ula.user_id=p.id), '[]'::jsonb),
    'dismissed', coalesce((select jsonb_agg(uds.suggestion_key) from public.user_dismissed_suggestions uds where uds.user_id=p.id), '[]'::jsonb),
    'concerts', coalesce((select jsonb_agg(lower(c.artist) || '|' || c.concert_date) from public.concert_participants cp join public.concerts c on c.id=cp.concert_id where cp.user_id=p.id and cp.status='confirmed'), '[]'::jsonb)
  )) from public.profiles p join public.spotify_connections sc on sc.user_id=p.id
  where p.account_status='active' and p.suggestion_email_enabled and not sc.reauthorization_required), '[]'::jsonb);
end;
$$;

create or replace function public.delete_spotify_vault_secret()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.refresh_secret_id is not null then delete from vault.secrets where id=old.refresh_secret_id; end if;
  return old;
end;
$$;
drop trigger if exists delete_spotify_vault_secret on public.spotify_connections;
create trigger delete_spotify_vault_secret after delete on public.spotify_connections
for each row execute function public.delete_spotify_vault_secret();

create or replace function public.disconnect_my_spotify()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_active_user();
  delete from public.user_listened_artists where user_id = auth.uid();
  delete from public.spotify_connections where user_id = auth.uid();
end;
$$;

revoke all on function public.replace_spotify_artists(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.get_my_listened_artists() from public, anon;
revoke all on function public.get_my_preferences() from public, anon;
revoke all on function public.get_my_access() from public, anon;
revoke all on function public.get_spotify_sync_accounts() from public, anon, authenticated;
revoke all on function public.complete_spotify_background_sync(uuid,jsonb,text) from public, anon, authenticated;
revoke all on function public.mark_spotify_reauthorization_required(uuid) from public, anon, authenticated;
revoke all on function public.get_suggestion_notification_recipients() from public, anon, authenticated;
grant execute on function public.get_my_listened_artists() to authenticated;
grant execute on function public.get_my_preferences() to authenticated;
grant execute on function public.get_my_access() to authenticated;
grant execute on function public.get_spotify_sync_accounts() to service_role;
grant execute on function public.complete_spotify_background_sync(uuid,jsonb,text) to service_role;
grant execute on function public.mark_spotify_reauthorization_required(uuid) to service_role;
grant execute on function public.get_suggestion_notification_recipients() to service_role;
grant select on public.user_listened_artists to service_role;
