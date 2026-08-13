create or replace function public.sync_my_spotify_artists(payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare secret_id uuid; refresh_token text; artist_count integer; secret_name text := 'spotify-' || auth.uid()::text;
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
    if secret_id is null or not exists (select 1 from vault.secrets where id = secret_id) then
      select id into secret_id from vault.secrets where name = secret_name;
    end if;
    if secret_id is null then
      secret_id := vault.create_secret(refresh_token, secret_name, 'Spotify refresh token for A Deafening Noise');
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

revoke all on function public.sync_my_spotify_artists(jsonb) from public, anon;
grant execute on function public.sync_my_spotify_artists(jsonb) to authenticated;
