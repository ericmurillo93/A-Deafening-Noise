create table public.spotify_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  spotify_user_id text not null,
  display_name text not null,
  synced_at timestamptz not null default now()
);

create table public.user_listened_artists (
  user_id uuid not null references public.profiles(id) on delete cascade,
  spotify_artist_id text not null,
  artist_name text not null,
  time_ranges text[] not null default '{}',
  synced_at timestamptz not null default now(),
  primary key (user_id, spotify_artist_id)
);

alter table public.spotify_connections enable row level security;
alter table public.user_listened_artists enable row level security;
revoke all on public.spotify_connections, public.user_listened_artists from anon, authenticated;

create or replace function public.get_my_spotify_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when sc.user_id is null then jsonb_build_object('connected', false)
    else jsonb_build_object('connected', true, 'displayName', sc.display_name, 'syncedAt', sc.synced_at,
      'artistCount', (select count(*) from public.user_listened_artists ula where ula.user_id = auth.uid())) end
  from (select auth.uid() as user_id) caller
  left join public.spotify_connections sc on sc.user_id = caller.user_id;
$$;

create or replace function public.sync_my_spotify_artists(payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item jsonb; artist_count integer := 0;
begin
  perform public.assert_active_user();
  if nullif(trim(payload->>'spotifyUserId'), '') is null or nullif(trim(payload->>'displayName'), '') is null then
    raise exception 'Invalid Spotify profile' using errcode = '22023';
  end if;
  if jsonb_typeof(payload->'artists') <> 'array' or jsonb_array_length(payload->'artists') > 150 then
    raise exception 'Invalid Spotify artist list' using errcode = '22023';
  end if;
  insert into public.spotify_connections(user_id, spotify_user_id, display_name, synced_at)
  values(auth.uid(), left(payload->>'spotifyUserId', 200), left(payload->>'displayName', 200), now())
  on conflict(user_id) do update set spotify_user_id=excluded.spotify_user_id, display_name=excluded.display_name, synced_at=now();
  delete from public.user_listened_artists where user_id=auth.uid();
  for item in select value from jsonb_array_elements(payload->'artists') loop
    if nullif(trim(item->>'spotifyId'), '') is not null and nullif(trim(item->>'name'), '') is not null then
      insert into public.user_listened_artists(user_id, spotify_artist_id, artist_name, time_ranges)
      values(auth.uid(), left(item->>'spotifyId', 200), left(item->>'name', 300),
        array(select value from jsonb_array_elements_text(coalesce(item->'ranges', '[]'::jsonb)) where value in ('short_term','medium_term','long_term')))
      on conflict(user_id, spotify_artist_id) do nothing;
      artist_count := artist_count + 1;
    end if;
  end loop;
  return jsonb_build_object('connected', true, 'displayName', left(payload->>'displayName', 200), 'syncedAt', now(), 'artistCount', artist_count);
end;
$$;

revoke all on function public.get_my_spotify_status() from public, anon;
revoke all on function public.sync_my_spotify_artists(jsonb) from public, anon;
grant execute on function public.get_my_spotify_status() to authenticated;
grant execute on function public.sync_my_spotify_artists(jsonb) to authenticated;
