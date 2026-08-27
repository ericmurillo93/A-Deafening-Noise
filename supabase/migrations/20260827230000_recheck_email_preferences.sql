create or replace function public.get_notification_email_batch(batch_size integer default 50)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('outboxId',o.id,'notificationId',n.id,'email',u.email,'displayName',p.display_name,
    'kind',n.kind,'actorName',a.display_name,'artist',c.artist,'venue',c.venue,'date',c.concert_date,'concertId',c.id) order by o.created_at)
    from (select * from public.notification_email_outbox where status='pending' and next_attempt_at<=now() and attempts<5 order by created_at limit least(greatest(batch_size,1),100)) o
    join public.notifications n on n.id=o.notification_id join public.profiles p on p.id=o.user_id join auth.users u on u.id=o.user_id
    left join public.profiles a on a.id=n.actor_id left join public.concerts c on c.id=n.concert_id
    where p.account_status='active' and coalesce(u.email,'')<>'' and coalesce((p.notification_preferences->(case
      when n.kind in ('friend_request','friend_request_accepted','friend_request_declined','concert_invitation','invitation_accepted','invitation_declined') then 'social'
      when n.kind='concert_changed' then 'concertUpdates'
      when n.kind in ('ticket_available','ticket_link_changed','selling_fast') then 'ticketUpdates'
      when n.kind='spotify_reconnect' then 'spotify' else 'social' end)->>'email')::boolean,false)),'[]'::jsonb);
end;
$$;
revoke all on function public.get_notification_email_batch(integer) from public,anon,authenticated;
grant execute on function public.get_notification_email_batch(integer) to service_role;
