-- Complete the social account layer: richer profiles, activity, attendance
-- provenance, account controls and admin moderation.

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists account_status text not null default 'active';
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check check (account_status in ('active', 'blocked'));

alter table public.concert_participants add column if not exists confirmed_at timestamptz;
update public.concert_participants set confirmed_at = created_at where status = 'confirmed' and confirmed_at is null;

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  concert_id bigint references public.concerts(id) on delete cascade,
  kind text not null check (kind in ('concert_invitation', 'friend_request', 'invitation_accepted')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, read_at, created_at desc);
create unique index if not exists notifications_open_concert_invite_uidx
  on public.notifications(user_id, concert_id, kind) where kind = 'concert_invitation' and read_at is null;
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;

create or replace function public.assert_active_user()
returns public.profiles
language plpgsql stable security definer set search_path = ''
as $$
declare caller public.profiles;
begin
  select * into caller from public.profiles where id = auth.uid();
  if caller.id is null then raise exception 'Profile not configured' using errcode = '42501'; end if;
  if caller.account_status <> 'active' then raise exception 'Account blocked' using errcode = '42501'; end if;
  return caller;
end;
$$;

create or replace function public.enforce_active_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and exists (select 1 from public.profiles where id=auth.uid() and account_status<>'active') then
    raise exception 'Account blocked' using errcode = '42501';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
drop trigger if exists profiles_active_mutation on public.profiles;
create trigger profiles_active_mutation before insert or update or delete on public.profiles for each row execute function public.enforce_active_mutation();
drop trigger if exists concerts_active_mutation on public.concerts;
create trigger concerts_active_mutation before insert or update or delete on public.concerts for each row execute function public.enforce_active_mutation();
drop trigger if exists participants_active_mutation on public.concert_participants;
create trigger participants_active_mutation before insert or update or delete on public.concert_participants for each row execute function public.enforce_active_mutation();
drop trigger if exists friendships_active_mutation on public.friendships;
create trigger friendships_active_mutation before insert or update or delete on public.friendships for each row execute function public.enforce_active_mutation();

create or replace function public.notify_social_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'concert_participants' and new.status = 'pending' and new.invited_by is not null then
    insert into public.notifications(user_id, actor_id, concert_id, kind)
    values (new.user_id, new.invited_by, new.concert_id, 'concert_invitation') on conflict do nothing;
  elsif tg_table_name = 'friendships' and new.status = 'pending' then
    insert into public.notifications(user_id, actor_id, kind)
    values (new.addressee_id, new.requester_id, 'friend_request');
  end if;
  return new;
end;
$$;
drop trigger if exists notify_concert_invitation on public.concert_participants;
create trigger notify_concert_invitation after insert or update of status, invited_by on public.concert_participants
for each row when (new.status = 'pending') execute function public.notify_social_activity();
drop trigger if exists notify_friend_request on public.friendships;
create trigger notify_friend_request after insert on public.friendships
for each row when (new.status = 'pending') execute function public.notify_social_activity();

create or replace function public.update_my_profile(payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller public.profiles;
begin
  caller := public.assert_active_user();
  update public.profiles set
    display_name = left(trim(coalesce(payload->>'displayName', display_name)), 80),
    avatar_url = nullif(left(trim(payload->>'avatarUrl'), 500), ''),
    city = nullif(left(trim(payload->>'city'), 80), ''),
    country = nullif(left(trim(payload->>'country'), 80), ''),
    discoverable = coalesce((payload->>'discoverable')::boolean, discoverable),
    updated_at = now()
  where id = caller.id;
  return public.get_app_data()->'profile';
end;
$$;

create or replace function public.mark_notifications_read(notification_ids bigint[] default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_active_user();
  update public.notifications set read_at = coalesce(read_at, now())
  where user_id = auth.uid() and (notification_ids is null or id = any(notification_ids));
end;
$$;

create or replace function public.leave_shared_concert(target_concert bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_active_user();
  if exists (select 1 from public.concerts where id = target_concert and created_by = auth.uid()) then
    raise exception 'The creator cannot leave; transfer or delete the concert instead' using errcode = '42501';
  end if;
  delete from public.concert_participants where concert_id = target_concert and user_id = auth.uid() and status = 'confirmed';
  if not found then raise exception 'Attendance not found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.respond_concert_invitation(target_concert bigint, accept_invitation boolean, response_bought boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare inviter uuid;
begin
  perform public.assert_active_user();
  select invited_by into inviter from public.concert_participants
  where concert_id=target_concert and user_id=auth.uid() and status='pending';
  if inviter is null then raise exception 'Invitation not found' using errcode = 'P0002'; end if;
  if accept_invitation then
    update public.concert_participants set status='confirmed', bought=coalesce(response_bought,true),
      invited_by=inviter, confirmed_at=now()
    where concert_id=target_concert and user_id=auth.uid() and status='pending';
    insert into public.notifications(user_id,actor_id,concert_id,kind)
    values(inviter,auth.uid(),target_concert,'invitation_accepted');
  else
    delete from public.concert_participants where concert_id=target_concert and user_id=auth.uid() and status='pending';
  end if;
end;
$$;

create or replace function public.export_my_data()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'exportedAt', now(),
    'profile', to_jsonb(p) - 'is_admin',
    'concerts', coalesce((select jsonb_agg(jsonb_build_object(
      'artist', c.artist, 'venue', c.venue, 'date', c.concert_date,
      'bought', cp.bought, 'status', cp.status, 'createdByMe', c.created_by = p.id
    )) from public.concert_participants cp join public.concerts c on c.id = cp.concert_id where cp.user_id = p.id), '[]'::jsonb),
    'friendships', coalesce((select jsonb_agg(to_jsonb(f)) from public.friendships f where f.requester_id = p.id or f.addressee_id = p.id), '[]'::jsonb)
  ) from public.profiles p where p.id = auth.uid() and p.account_status = 'active';
$$;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := auth.uid();
begin
  perform public.assert_active_user();
  delete from auth.users where id = caller_id;
  delete from public.concerts c where not exists (select 1 from public.concert_participants cp where cp.concert_id = c.id);
end;
$$;

create or replace function public.admin_list_users()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and account_status = 'active') then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', p.id, 'email', p.email, 'displayName', p.display_name, 'username', p.username,
    'role', p.role, 'status', p.account_status, 'discoverable', p.discoverable,
    'createdAt', u.created_at, 'lastSignInAt', u.last_sign_in_at,
    'concertCount', (select count(*) from public.concert_participants cp where cp.user_id = p.id and cp.status = 'confirmed')
  ) order by p.display_name) from public.profiles p left join auth.users u on u.id = p.id), '[]'::jsonb);
end;
$$;

create or replace function public.admin_update_user(target_user uuid, new_role text, new_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and account_status = 'active') then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if target_user = auth.uid() and (new_role <> 'admin' or new_status <> 'active') then
    raise exception 'You cannot remove your own admin access' using errcode = '42501';
  end if;
  update public.profiles set role = new_role, account_status = new_status, updated_at = now()
  where id = target_user and new_role in ('admin','user') and new_status in ('active','blocked');
end;
$$;

-- Return the richer social state while preserving the established archive shape.
create or replace function public.get_app_data()
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
      from public.notifications n left join public.profiles a on a.id=n.actor_id left join public.concerts c on c.id=n.concert_id
      where n.user_id=caller.id limit 50), '[]'::jsonb),
    'dismissedSuggestions', case when caller.role='admin' then coalesce((select jsonb_agg(suggestion_key order by suggestion_key) from public.dismissed_suggestions),'[]'::jsonb) else '[]'::jsonb end
  ) into result;
  return result;
end;
$$;

revoke all on function public.assert_active_user() from public, anon;
revoke all on function public.enforce_active_mutation() from public, anon;
revoke all on function public.update_my_profile(jsonb) from public, anon;
revoke all on function public.mark_notifications_read(bigint[]) from public, anon;
revoke all on function public.leave_shared_concert(bigint) from public, anon;
revoke all on function public.export_my_data() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_update_user(uuid,text,text) from public, anon;
grant execute on function public.update_my_profile(jsonb) to authenticated;
grant execute on function public.mark_notifications_read(bigint[]) to authenticated;
grant execute on function public.leave_shared_concert(bigint) to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_update_user(uuid,text,text) to authenticated;
