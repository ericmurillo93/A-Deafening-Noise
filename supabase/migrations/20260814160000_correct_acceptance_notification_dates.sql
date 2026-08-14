update public.notifications notification
set created_at = coalesce(participant.confirmed_at, participant.created_at)
from public.concert_participants participant
where notification.kind = 'invitation_accepted'
  and notification.user_id = participant.invited_by
  and notification.actor_id = participant.user_id
  and notification.concert_id = participant.concert_id
  and notification.created_at > coalesce(participant.confirmed_at, participant.created_at);
