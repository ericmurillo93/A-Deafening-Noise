create or replace function public.get_my_archive_snapshot()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_set(data,'{profile}',coalesce(data->'profile','{}'::jsonb)||public.get_my_preferences())
    ||jsonb_build_object('dismissedSuggestions',public.get_my_dismissed_suggestions())
  from (select public.get_app_data() data) archive;
$$;
create or replace function public.get_my_discovery_snapshot()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('suggestions',public.get_my_concert_suggestions()->'suggestions',
    'listenedArtists',public.get_my_listened_artists(),'artistImages',public.get_my_artist_images(),'spotifyStatus',public.get_my_spotify_status());
$$;
revoke all on function public.get_my_archive_snapshot(),public.get_my_discovery_snapshot() from public,anon;
grant execute on function public.get_my_archive_snapshot(),public.get_my_discovery_snapshot() to authenticated;
