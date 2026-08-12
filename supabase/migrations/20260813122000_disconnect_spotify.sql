create or replace function public.disconnect_my_spotify()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_active_user();
  delete from public.user_listened_artists where user_id = auth.uid();
  delete from public.spotify_connections where user_id = auth.uid();
end;
$$;

revoke all on function public.disconnect_my_spotify() from public, anon;
grant execute on function public.disconnect_my_spotify() to authenticated;
