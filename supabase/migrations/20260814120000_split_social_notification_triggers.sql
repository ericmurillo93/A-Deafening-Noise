-- Each trigger function is bound to one row type. A shared trigger function
-- cannot safely reference columns that only exist on one of its tables.
drop trigger if exists notify_concert_invitation on public.concert_participants;
drop trigger if exists notify_friend_request on public.friendships;
drop function if exists public.notify_social_activity();

create function public.notify_concert_invitation_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' and new.invited_by is not null then
    insert into public.notifications(user_id, actor_id, concert_id, kind)
    values (new.user_id, new.invited_by, new.concert_id, 'concert_invitation')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create function public.notify_friend_request_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' then
    insert into public.notifications(user_id, actor_id, kind)
    values (new.addressee_id, new.requester_id, 'friend_request');
  end if;
  return new;
end;
$$;

create trigger notify_concert_invitation
after insert or update of status, invited_by on public.concert_participants
for each row when (new.status = 'pending')
execute function public.notify_concert_invitation_activity();

create trigger notify_friend_request
after insert on public.friendships
for each row when (new.status = 'pending')
execute function public.notify_friend_request_activity();
