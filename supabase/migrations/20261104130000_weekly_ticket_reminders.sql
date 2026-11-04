-- Missing preference means opted out; normal ticket-availability emails are independent.
alter table public.profiles add constraint profiles_ticket_reminder_preference_check check (
  not (notification_preferences ? 'ticketReminders') or coalesce(
    jsonb_typeof(notification_preferences->'ticketReminders')='object'
    and jsonb_typeof(notification_preferences->'ticketReminders'->'web')='boolean'
    and jsonb_typeof(notification_preferences->'ticketReminders'->'email')='boolean',false)
);

create table public.weekly_ticket_reminders (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  message jsonb not null,
  status text not null default 'pending' check(status in ('pending','sending','sent','review')),
  attempts integer not null default 0,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  lease uuid,
  sent_at timestamptz,
  last_error text,
  unique(user_id,week_start)
);
alter table public.weekly_ticket_reminders enable row level security;
revoke all on public.weekly_ticket_reminders from public,anon,authenticated;
grant select on public.weekly_ticket_reminders to service_role;

create function public.get_weekly_ticket_reminder_recipients() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('userId',p.id,'email',u.email,'displayName',p.display_name,'language',p.language,'concerts',shows.items))
    from public.profiles p join auth.users u on u.id=p.id
    cross join lateral (
      select jsonb_agg(jsonb_build_object('artist',c.artist,'venue',c.venue,'city',c.city,'country',c.country,
        'date',c.concert_date,'ticketUrl',c.ticket_url) order by c.start_date,c.artist,c.id) items
      from public.concert_participants cp join public.concerts c on c.id=cp.concert_id
      where cp.user_id=p.id and cp.status='confirmed' and cp.visible_in_archive and not cp.bought
        and coalesce(c.end_date,c.start_date)>=((now() at time zone 'Europe/Madrid')::date)
        and c.event_status<>'cancelled'
    ) shows
    where p.account_status='active' and coalesce(u.email,'')<>'' and u.email_confirmed_at is not null
      and coalesce((p.notification_preferences->'ticketReminders'->>'email')::boolean,false)
      and shows.items is not null),'[]'::jsonb);
end;
$$;

create function public.claim_weekly_ticket_reminder(target_user uuid,candidate_message jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.weekly_ticket_reminders; week date:=date_trunc('week',now() at time zone 'Europe/Madrid')::date;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended('weekly-ticket-reminder:'||target_user::text,0));
  if not exists(select 1 from public.profiles where id=target_user and account_status='active'
    and coalesce((notification_preferences->'ticketReminders'->>'email')::boolean,false)) then return null;end if;
  insert into public.weekly_ticket_reminders(user_id,week_start,message) values(target_user,week,candidate_message)
    on conflict(user_id,week_start) do nothing;
  select * into item from public.weekly_ticket_reminders where user_id=target_user and week_start=week for update;
  if item.status in ('sent','review') or item.next_attempt_at>now() then return null;end if;
  if item.attempts>=5 or item.first_attempt_at<now()-interval '23 hours' then
    update public.weekly_ticket_reminders set status='review',last_error='Inspect Resend before retrying outside the idempotency window' where id=item.id;
    return null;
  end if;
  update public.weekly_ticket_reminders set status='sending',attempts=attempts+1,
    first_attempt_at=coalesce(first_attempt_at,now()),next_attempt_at=now()+interval '10 minutes',lease=gen_random_uuid()
    where id=item.id returning * into item;
  return to_jsonb(item);
end;
$$;

create function public.complete_weekly_ticket_reminder(delivery_id bigint,claim_lease uuid,succeeded boolean,error_message text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501';end if;
  update public.weekly_ticket_reminders set status=case when succeeded then 'sent' else 'pending' end,
    sent_at=case when succeeded then now() else null end,last_error=left(error_message,300)
    where id=delivery_id and lease=claim_lease and status='sending';
end;
$$;
revoke all on function public.get_weekly_ticket_reminder_recipients(),public.claim_weekly_ticket_reminder(uuid,jsonb),
  public.complete_weekly_ticket_reminder(bigint,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.get_weekly_ticket_reminder_recipients(),public.claim_weekly_ticket_reminder(uuid,jsonb),
  public.complete_weekly_ticket_reminder(bigint,uuid,boolean,text) to service_role;
