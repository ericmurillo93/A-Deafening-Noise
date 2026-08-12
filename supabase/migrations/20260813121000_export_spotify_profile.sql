create or replace function public.export_my_data()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'exportedAt', now(),
    'profile', to_jsonb(p) - 'is_admin',
    'concerts', coalesce((select jsonb_agg(jsonb_build_object(
      'artist', c.artist, 'venue', c.venue, 'date', c.concert_date,
      'bought', cp.bought, 'status', cp.status, 'createdByMe', c.created_by = p.id
    )) from public.concert_participants cp join public.concerts c on c.id = cp.concert_id where cp.user_id = p.id), '[]'::jsonb),
    'friendships', coalesce((select jsonb_agg(to_jsonb(f)) from public.friendships f where f.requester_id = p.id or f.addressee_id = p.id), '[]'::jsonb),
    'spotify', (select jsonb_build_object('userId', sc.spotify_user_id, 'displayName', sc.display_name,
      'syncedAt', sc.synced_at, 'artists', coalesce((select jsonb_agg(jsonb_build_object(
        'spotifyId', ula.spotify_artist_id, 'name', ula.artist_name, 'timeRanges', ula.time_ranges
      ) order by ula.artist_name) from public.user_listened_artists ula where ula.user_id=p.id), '[]'::jsonb))
      from public.spotify_connections sc where sc.user_id=p.id)
  ) from public.profiles p where p.id = auth.uid() and p.account_status = 'active';
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
