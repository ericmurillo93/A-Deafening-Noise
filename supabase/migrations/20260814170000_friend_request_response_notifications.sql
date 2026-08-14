alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'concert_invitation',
  'friend_request',
  'friend_request_accepted',
  'friend_request_declined',
  'invitation_accepted'
));

create or replace function public.respond_friend_request(request_id bigint, accept_request boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare requester uuid;
begin
  perform public.assert_active_user();

  update public.friendships
  set status = case when accept_request then 'accepted' else 'rejected' end,
      updated_at = now()
  where id = request_id and addressee_id = auth.uid() and status = 'pending'
  returning requester_id into requester;

  if requester is null then
    raise exception 'Friend request not found' using errcode = 'P0002';
  end if;

  insert into public.notifications(user_id, actor_id, kind)
  values (
    requester,
    auth.uid(),
    case when accept_request then 'friend_request_accepted' else 'friend_request_declined' end
  );
end;
$$;

revoke all on function public.respond_friend_request(bigint, boolean) from public, anon;
grant execute on function public.respond_friend_request(bigint, boolean) to authenticated;

-- Preserve responses made before this notification type existed.
insert into public.notifications(user_id, actor_id, kind, created_at)
select
  friendship.requester_id,
  friendship.addressee_id,
  case when friendship.status = 'accepted' then 'friend_request_accepted' else 'friend_request_declined' end,
  friendship.updated_at
from public.friendships friendship
where friendship.status in ('accepted', 'rejected')
  and not exists (
    select 1
    from public.notifications notification
    where notification.user_id = friendship.requester_id
      and notification.actor_id = friendship.addressee_id
      and notification.kind = case when friendship.status = 'accepted' then 'friend_request_accepted' else 'friend_request_declined' end
  );
