insert into public.notifications (user_id, actor_id, concert_id, kind, created_at)
select participant.invited_by, participant.user_id, participant.concert_id, 'invitation_accepted', coalesce(participant.confirmed_at, participant.created_at)
from public.concert_participants participant
where participant.status = 'confirmed'
  and participant.invited_by is not null
  and not exists (
    select 1 from public.notifications notification
    where notification.user_id = participant.invited_by
      and notification.actor_id = participant.user_id
      and notification.concert_id = participant.concert_id
      and notification.kind = 'invitation_accepted'
  );
