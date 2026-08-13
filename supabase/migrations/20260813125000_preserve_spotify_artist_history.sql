create or replace function public.replace_spotify_artists(target_user uuid, payload jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; artist_count integer := 0;
begin
  if payload is null or jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) > 150 then
    raise exception 'Invalid Spotify artist list' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(payload) loop
    if nullif(trim(item->>'spotifyId'), '') is not null and nullif(trim(item->>'name'), '') is not null then
      insert into public.user_listened_artists(user_id, spotify_artist_id, artist_name, time_ranges, synced_at)
      values(target_user, left(item->>'spotifyId', 200), left(item->>'name', 300),
        array(select value from jsonb_array_elements_text(coalesce(item->'ranges', '[]'::jsonb)) where value in ('short_term','medium_term','long_term')), now())
      on conflict(user_id, spotify_artist_id) do update set artist_name=excluded.artist_name,
        time_ranges=excluded.time_ranges, synced_at=now();
      artist_count := artist_count + 1;
    end if;
  end loop;
  return artist_count;
end;
$$;

revoke all on function public.replace_spotify_artists(uuid,jsonb) from public, anon, authenticated;
grant select, insert, update on public.user_listened_artists to service_role;
