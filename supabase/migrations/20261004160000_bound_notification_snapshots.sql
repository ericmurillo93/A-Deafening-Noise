-- Bound rows before aggregation, rather than limiting the single aggregate row.
create or replace function public.get_app_data_with_hidden()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare caller public.profiles; result jsonb;
begin
  caller := public.assert_active_user();
  -- Use the previous implementation's result during migration replacement.
  select jsonb_build_object(
    'profile', jsonb_build_object('id', caller.id, 'email', caller.email, 'displayName', caller.display_name,
      'username', caller.username, 'role', caller.role, 'isAdmin', caller.role = 'admin',
      'avatarUrl', caller.avatar_url, 'city', caller.city, 'country', caller.country,
      'discoverable', caller.discoverable, 'status', caller.account_status),
    'concerts', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'concertId', c.id, 'artist', c.artist, 'venue', c.venue, 'date', c.concert_date,
      'bought', own.bought, 'setlistId', c.setlist_id, 'ticketUrl', c.ticket_url,
      'createdBy', c.created_by, 'creator', jsonb_build_object('id', creator.id, 'displayName', creator.display_name),
      'canEditEvent', caller.role = 'admin' or c.created_by = caller.id,
      'attendees', nullif((coalesce((select jsonb_agg(p.display_name order by p.display_name)
        from public.concert_participants cp join public.profiles p on p.id=cp.user_id
        where cp.concert_id=c.id and cp.user_id<>caller.id and cp.status='confirmed'
          and (cp.invited_by=caller.id or own.invited_by=cp.user_id)), '[]'::jsonb) || to_jsonb(own.guest_attendees)), '[]'::jsonb),
      'guestAttendees', case when cardinality(own.guest_attendees) > 0 then to_jsonb(own.guest_attendees) end,
      'attendeeUsers', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'displayName', p.display_name,
        'status', cp.status, 'confirmedAt', cp.confirmed_at) order by p.display_name)
        from public.concert_participants cp join public.profiles p on p.id = cp.user_id
        where cp.concert_id = c.id and cp.user_id <> caller.id and
          ((cp.status='confirmed' and (cp.invited_by=caller.id or own.invited_by=cp.user_id)) or (cp.status='pending' and cp.invited_by=caller.id))), '[]'::jsonb)
    )) order by c.id) from public.concerts c
      join public.concert_participants own on own.concert_id=c.id and own.user_id=caller.id and own.status='confirmed'
      left join public.profiles creator on creator.id=c.created_by), '[]'::jsonb),
    'friends', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'displayName', p.display_name,
      'username', p.username, 'avatarUrl', p.avatar_url, 'city', p.city, 'country', p.country) order by p.display_name)
      from public.friendships f join public.profiles p on p.id=case when f.requester_id=caller.id then f.addressee_id else f.requester_id end
      where f.status='accepted' and (f.requester_id=caller.id or f.addressee_id=caller.id)), '[]'::jsonb),
    'friendRequests', coalesce((select jsonb_agg(jsonb_build_object('id',f.id,
      'direction',case when f.addressee_id=caller.id then 'incoming' else 'outgoing' end,
      'userId',p.id,'displayName',p.display_name,'username',p.username,'createdAt',f.created_at) order by f.created_at desc)
      from public.friendships f join public.profiles p on p.id=case when f.requester_id=caller.id then f.addressee_id else f.requester_id end
      where f.status='pending' and (f.requester_id=caller.id or f.addressee_id=caller.id)), '[]'::jsonb),
    'concertInvitations', coalesce((select jsonb_agg(jsonb_build_object('concertId',c.id,'artist',c.artist,
      'venue',c.venue,'date',c.concert_date,'invitedBy',inviter.display_name) order by cp.created_at desc)
      from public.concert_participants cp join public.concerts c on c.id=cp.concert_id
      left join public.profiles inviter on inviter.id=cp.invited_by where cp.user_id=caller.id and cp.status='pending'), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'kind',n.kind,'readAt',n.read_at,
      'createdAt',n.created_at,'actorName',a.display_name,'concertId',n.concert_id,'artist',c.artist,'date',c.concert_date) order by n.created_at desc)
      from (select * from public.notifications where user_id=caller.id order by created_at desc,id desc limit 50) n left join public.profiles a on a.id=n.actor_id left join public.concerts c on c.id=n.concert_id
      ), '[]'::jsonb),
    'dismissedSuggestions', case when caller.role='admin' then coalesce((select jsonb_agg(suggestion_key order by suggestion_key) from public.dismissed_suggestions),'[]'::jsonb) else '[]'::jsonb end
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_app_data_with_hidden() from public,anon,authenticated;
