alter table public.notification_email_outbox drop constraint notification_email_outbox_status_check;
alter table public.notification_email_outbox add constraint notification_email_outbox_status_check
  check(status in ('pending','sending','sent','failed','cancelled','review'));
alter table public.notification_email_outbox add column message jsonb,
  add column lease uuid,add column first_attempt_at timestamptz;
-- Older attempts did not persist a safe retry window. Never blindly resend them.
update public.notification_email_outbox set status='review',last_error='Legacy delivery: check provider before retrying'
where status='pending' and attempts>0;

create function public.notification_email_allowed(target_user uuid,notification_kind text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select p.account_status='active' and u.email_confirmed_at is not null and coalesce(u.email,'')<>''
    and coalesce((p.notification_preferences->(case
      when notification_kind in ('friend_request','friend_request_accepted','friend_request_declined','concert_invitation','invitation_accepted','invitation_declined') then 'social'
      when notification_kind='concert_changed' then 'concertUpdates'
      when notification_kind in ('ticket_available','ticket_link_changed','selling_fast') then 'ticketUpdates'
      when notification_kind='spotify_reconnect' then 'spotify' else 'social' end)->>'email')::boolean,false)
    from public.profiles p join auth.users u on u.id=p.id where p.id=target_user),false);
$$;

create or replace function public.get_notification_email_batch(batch_size integer default 50) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501';end if;
  update public.notification_email_outbox set status='review',last_error='Inspect provider before retrying outside the idempotency window'
    where status in ('pending','sending') and next_attempt_at<=now() and (first_attempt_at<now()-interval '23 hours' or attempts>=5);
  return coalesce((select jsonb_agg(to_jsonb(item)) from (
    select o.id as "outboxId",n.id as "notificationId",u.email,p.display_name as "displayName",p.language,
      n.kind,a.display_name as "actorName",c.artist,c.venue,c.concert_date as date,c.id as "concertId"
    from public.notification_email_outbox o join public.notifications n on n.id=o.notification_id
    join public.profiles p on p.id=o.user_id join auth.users u on u.id=o.user_id
    left join public.profiles a on a.id=n.actor_id left join public.concerts c on c.id=n.concert_id
    where o.status in ('pending','sending') and o.next_attempt_at<=now() and o.attempts<5
      and public.notification_email_allowed(o.user_id,n.kind)
    order by o.created_at,o.id limit least(greatest(batch_size,1),100)
  ) item),'[]'::jsonb);
end;
$$;

create function public.claim_notification_email(outbox_id bigint,candidate_message jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.notification_email_outbox; kind text; recipient text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501';end if;
  select * into item from public.notification_email_outbox where id=outbox_id for update;
  if not found or item.status not in ('pending','sending') or item.next_attempt_at>now() then return null;end if;
  select n.kind into kind from public.notifications n where id=item.notification_id;
  if not public.notification_email_allowed(item.user_id,kind) then return null;end if;
  if item.attempts>=5 or item.first_attempt_at<now()-interval '23 hours' then
    update public.notification_email_outbox set status='review' where id=item.id;return null;
  end if;
  select email into recipient from auth.users where id=item.user_id;
  if item.message is not null and item.message->'to'<>jsonb_build_array(recipient) then
    update public.notification_email_outbox set status='review',last_error='Recipient changed during retry' where id=item.id;return null;
  end if;
  update public.notification_email_outbox set message=coalesce(message,candidate_message||jsonb_build_object('to',jsonb_build_array(recipient))),
    status='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),
    next_attempt_at=now()+interval '10 minutes',lease=gen_random_uuid()
    where id=item.id returning * into item;
  return to_jsonb(item);
end;
$$;
drop function public.complete_notification_email(bigint,boolean,text);
create function public.complete_notification_email(outbox_id bigint,claim_lease uuid,succeeded boolean,error_message text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501';end if;
  update public.notification_email_outbox set status=case when succeeded then 'sent' else 'pending' end,
    sent_at=case when succeeded then now() else null end,last_error=left(error_message,300)
    where id=outbox_id and lease=claim_lease and status='sending';
  if not found then raise exception 'Delivery lease expired' using errcode='40001';end if;
end;
$$;
revoke all on function public.notification_email_allowed(uuid,text),public.claim_notification_email(bigint,jsonb),
  public.complete_notification_email(bigint,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.notification_email_allowed(uuid,text),public.claim_notification_email(bigint,jsonb),
  public.complete_notification_email(bigint,uuid,boolean,text) to service_role;

-- Preserve affinity/privacy logic while adding the recipient's display language.
alter function public.get_suggestion_notification_recipients() rename to get_suggestion_notification_recipients_before_language;
create function public.get_suggestion_notification_recipients() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501';end if;
  return coalesce((select jsonb_agg(item||jsonb_build_object('language',p.language))
    from jsonb_array_elements(public.get_suggestion_notification_recipients_before_language()) item
    join public.profiles p on p.id=(item->>'userId')::uuid),'[]'::jsonb);
end;
$$;
revoke all on function public.get_suggestion_notification_recipients_before_language() from public,anon,authenticated,service_role;
revoke all on function public.get_suggestion_notification_recipients() from public,anon,authenticated;
grant execute on function public.get_suggestion_notification_recipients() to service_role;
