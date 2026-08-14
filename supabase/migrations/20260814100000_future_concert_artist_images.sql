create table public.artist_images (
  user_id uuid not null references public.profiles(id) on delete cascade,
  normalized_artist text not null,
  artist_name text not null,
  spotify_artist_id text not null,
  image_url text not null check (length(image_url) <= 2000 and image_url ~ '^https://(i\.scdn\.co/image/|image-cdn-ak\.spotifycdn\.com/)'),
  synced_at timestamptz not null default now(),
  primary key(user_id, normalized_artist)
);

alter table public.artist_images enable row level security;
revoke all on public.artist_images from public, anon, authenticated;
grant select, insert, update on public.artist_images to service_role;

create or replace function public.upsert_spotify_artist_images(target_user uuid, payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare item jsonb; artist_key text;
begin
  if payload is null then return; end if;
  if jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) > 100 then
    raise exception 'Invalid Spotify artwork list' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(payload) loop
    artist_key := nullif(public.normalize_concert_value(item->>'name'), '');
    if artist_key is not null and nullif(trim(item->>'name'), '') is not null
      and nullif(trim(item->>'spotifyId'), '') is not null and length(item->>'imageUrl') <= 2000
      and item->>'imageUrl' ~ '^https://(i\.scdn\.co/image/|image-cdn-ak\.spotifycdn\.com/)' then
      insert into public.artist_images(user_id, normalized_artist, artist_name, spotify_artist_id, image_url, synced_at)
      values(target_user, left(artist_key, 300), left(item->>'name', 300), left(item->>'spotifyId', 200), item->>'imageUrl', now())
      on conflict(user_id, normalized_artist) do update set artist_name=excluded.artist_name, spotify_artist_id=excluded.spotify_artist_id,
        image_url=excluded.image_url, synced_at=now();
    end if;
  end loop;
end;
$$;

create or replace function public.get_my_artist_images()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_active_user();
  return coalesce((select jsonb_agg(jsonb_build_object('artist', images.artist_name, 'imageUrl', images.image_url) order by images.artist_name)
    from (
      select artist_name, image_url from public.user_listened_artists where user_id = auth.uid() and image_url is not null
      union
      select ai.artist_name, ai.image_url from public.artist_images ai
      join public.concerts c on c.normalized_artist = ai.normalized_artist
      join public.concert_participants cp on cp.concert_id = c.id
      where ai.user_id = auth.uid() and cp.user_id = auth.uid() and cp.status = 'confirmed'
    ) images), '[]'::jsonb);
end;
$$;

create or replace function public.sync_my_spotify_artists(payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare secret_id uuid; refresh_token text; artist_count integer; secret_name text := 'spotify-' || auth.uid()::text;
begin
  perform public.assert_active_user();
  if nullif(trim(payload->>'spotifyUserId'), '') is null or nullif(trim(payload->>'displayName'), '') is null then
    raise exception 'Invalid Spotify profile' using errcode = '22023';
  end if;
  refresh_token := nullif(payload->>'refreshToken', '');
  if refresh_token is not null and length(refresh_token) > 2000 then raise exception 'Invalid Spotify refresh token' using errcode = '22023'; end if;
  select refresh_secret_id into secret_id from public.spotify_connections where user_id = auth.uid();
  if refresh_token is not null then
    if secret_id is null or not exists (select 1 from vault.secrets where id = secret_id) then select id into secret_id from vault.secrets where name = secret_name; end if;
    if secret_id is null then secret_id := vault.create_secret(refresh_token, secret_name, 'Spotify refresh token for A Deafening Noise');
    else perform vault.update_secret(secret_id, refresh_token); end if;
  end if;
  if secret_id is null then raise exception 'Spotify must be reconnected to enable automatic updates' using errcode = '22023'; end if;
  insert into public.spotify_connections(user_id, spotify_user_id, display_name, synced_at, refresh_secret_id, authorized_at, reauthorization_required)
  values(auth.uid(), left(payload->>'spotifyUserId', 200), left(payload->>'displayName', 200), now(), secret_id, now(), false)
  on conflict(user_id) do update set spotify_user_id=excluded.spotify_user_id, display_name=excluded.display_name,
    synced_at=now(), refresh_secret_id=excluded.refresh_secret_id,
    authorized_at=case when refresh_token is not null then now() else public.spotify_connections.authorized_at end, reauthorization_required=false;
  artist_count := public.replace_spotify_artists(auth.uid(), payload->'artists');
  perform public.upsert_spotify_artist_images(auth.uid(), payload->'artwork');
  return jsonb_build_object('connected', true, 'displayName', left(payload->>'displayName', 200), 'syncedAt', now(),
    'artistCount', artist_count, 'needsReauthorization', false);
end;
$$;

revoke all on function public.upsert_spotify_artist_images(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.get_my_artist_images() from public, anon;
revoke all on function public.sync_my_spotify_artists(jsonb) from public, anon;
grant execute on function public.get_my_artist_images() to authenticated;
grant execute on function public.sync_my_spotify_artists(jsonb) to authenticated;
grant execute on function public.upsert_spotify_artist_images(uuid,jsonb) to service_role;
