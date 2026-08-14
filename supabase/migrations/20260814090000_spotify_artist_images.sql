alter table public.user_listened_artists add column image_url text;

alter table public.user_listened_artists add constraint user_listened_artists_image_url_check
  check (image_url is null or (length(image_url) <= 2000 and image_url ~ '^https://'));

create or replace function public.replace_spotify_artists(target_user uuid, payload jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; artist_count integer := 0; artist_image text;
begin
  if payload is null or jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) > 150 then
    raise exception 'Invalid Spotify artist list' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(payload) loop
    if nullif(trim(item->>'spotifyId'), '') is not null and nullif(trim(item->>'name'), '') is not null then
      artist_image := nullif(trim(item->>'imageUrl'), '');
      if artist_image is not null and (length(artist_image) > 2000 or artist_image !~ '^https://') then artist_image := null; end if;
      insert into public.user_listened_artists(user_id, spotify_artist_id, artist_name, time_ranges, synced_at, image_url)
      values(target_user, left(item->>'spotifyId', 200), left(item->>'name', 300),
        array(select value from jsonb_array_elements_text(coalesce(item->'ranges', '[]'::jsonb)) where value in ('short_term','medium_term','long_term')), now(), artist_image)
      on conflict(user_id, spotify_artist_id) do update set artist_name=excluded.artist_name,
        time_ranges=excluded.time_ranges, synced_at=now(), image_url=coalesce(excluded.image_url, public.user_listened_artists.image_url);
      artist_count := artist_count + 1;
    end if;
  end loop;
  return artist_count;
end;
$$;

create or replace function public.get_my_artist_images()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_active_user();
  return coalesce((select jsonb_agg(jsonb_build_object('artist', artist_name, 'imageUrl', image_url) order by artist_name)
    from public.user_listened_artists where user_id = auth.uid() and image_url is not null), '[]'::jsonb);
end;
$$;

revoke all on function public.replace_spotify_artists(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.get_my_artist_images() from public, anon;
grant select, insert, update on public.user_listened_artists to service_role;
grant execute on function public.get_my_artist_images() to authenticated;
