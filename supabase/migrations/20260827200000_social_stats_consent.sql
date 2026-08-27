create table public.stats_shares (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(owner_id,viewer_id),
  check(owner_id<>viewer_id)
);
alter table public.stats_shares enable row level security;
revoke all on public.stats_shares from public,anon,authenticated;

create or replace function public.set_stats_sharing(friend_user uuid,enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.assert_active_user();
  if not public.are_friends(auth.uid(),friend_user) then raise exception 'Stats can only be shared with a friend' using errcode='42501'; end if;
  insert into public.stats_shares(owner_id,viewer_id,enabled,updated_at) values(auth.uid(),friend_user,enabled,now())
  on conflict(owner_id,viewer_id) do update set enabled=excluded.enabled,updated_at=now();
end;
$$;

create or replace function public.get_my_stats_shares()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform public.assert_active_user();
  return coalesce((select jsonb_agg(jsonb_build_object('userId',friend.id,'sharedByMe',coalesce(outgoing.enabled,false),'sharedWithMe',coalesce(incoming.enabled,false)) order by friend.display_name)
    from public.friendships f join public.profiles friend on friend.id=case when f.requester_id=auth.uid() then f.addressee_id else f.requester_id end
    left join public.stats_shares outgoing on outgoing.owner_id=auth.uid() and outgoing.viewer_id=friend.id
    left join public.stats_shares incoming on incoming.owner_id=friend.id and incoming.viewer_id=auth.uid()
    where f.status='accepted' and auth.uid() in (f.requester_id,f.addressee_id)),'[]'::jsonb);
end;
$$;

create or replace function public.get_social_comparison(friend_user uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare mine integer; theirs integer; shared integer;
begin
  perform public.assert_active_user();
  if not public.are_friends(auth.uid(),friend_user) or not exists(select 1 from public.stats_shares where owner_id=friend_user and viewer_id=auth.uid() and enabled) then
    raise exception 'This friend has not shared archive statistics with you' using errcode='42501';
  end if;
  select count(*) into mine from public.concert_participants where user_id=auth.uid() and status='confirmed' and visible_in_archive;
  select count(*) into theirs from public.concert_participants where user_id=friend_user and status='confirmed' and visible_in_archive;
  select count(*) into shared from public.concert_participants mine_cp join public.concert_participants their_cp on their_cp.concert_id=mine_cp.concert_id and their_cp.user_id=friend_user and their_cp.status='confirmed' and their_cp.visible_in_archive
    where mine_cp.user_id=auth.uid() and mine_cp.status='confirmed' and mine_cp.visible_in_archive;
  return jsonb_build_object('myConcerts',mine,'friendConcerts',theirs,'sameEvents',shared,
    'sharedArtists',coalesce((select jsonb_agg(row_to_json(item)) from (select c.artist,count(*) count from public.concert_participants mine_cp join public.concerts c on c.id=mine_cp.concert_id
      where mine_cp.user_id=auth.uid() and mine_cp.status='confirmed' and exists(select 1 from public.concert_participants their_cp join public.concerts their_c on their_c.id=their_cp.concert_id where their_cp.user_id=friend_user and their_cp.status='confirmed' and their_c.normalized_artist=c.normalized_artist) group by c.artist order by count(*) desc limit 10)item),'[]'::jsonb));
end;
$$;

revoke all on function public.set_stats_sharing(uuid,boolean),public.get_my_stats_shares(),public.get_social_comparison(uuid) from public,anon;
grant execute on function public.set_stats_sharing(uuid,boolean),public.get_my_stats_shares(),public.get_social_comparison(uuid) to authenticated;
