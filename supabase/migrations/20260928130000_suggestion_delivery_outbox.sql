-- Daily digests survive process failures and catalog replacement.
create table public.suggestion_email_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivery_day date not null default (now() at time zone 'Europe/Berlin')::date,
  event_keys text[] not null,
  message jsonb not null,
  status text not null default 'pending' check(status in ('pending','sending','sent','cancelled','review')),
  attempts integer not null default 0,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  lease uuid,
  sent_at timestamptz,
  last_error text,
  unique(user_id,delivery_day)
);
alter table public.suggestion_email_outbox enable row level security;
revoke all on public.suggestion_email_outbox from public,anon,authenticated;
grant select on public.suggestion_email_outbox to service_role;

create or replace function public.claim_suggestion_digest(target_user uuid, candidate_keys text[], eligible_keys text[], candidate_message jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.suggestion_email_outbox; today date := (now() at time zone 'Europe/Berlin')::date;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_user::text,0));
  if not exists(select 1 from public.profiles where id=target_user and account_status='active' and suggestion_email_enabled) then return null; end if;
  if exists(select 1 from public.suggestion_email_outbox where user_id=target_user and (sent_at at time zone 'Europe/Berlin')::date=today) then return null; end if;
  -- Beyond Resend's 24-hour idempotency window an ambiguous result needs review.
  update public.suggestion_email_outbox set status='review',last_error='Delivery outcome uncertain; inspect provider before retrying'
    where user_id=target_user and status in ('pending','sending') and first_attempt_at < now()-interval '23 hours';
  update public.suggestion_email_outbox set status='cancelled'
    where user_id=target_user and status='pending' and first_attempt_at is null and not(event_keys <@ eligible_keys);
  select * into item from public.suggestion_email_outbox where user_id=target_user and status in ('pending','sending') order by id limit 1 for update;
  if not found then
    if cardinality(candidate_keys)=0 then return null; end if;
    insert into public.suggestion_email_outbox(user_id,event_keys,message) values(target_user,candidate_keys,candidate_message)
      on conflict(user_id,delivery_day) do nothing returning * into item;
    if not found then return null; end if;
  end if;
  if item.next_attempt_at>now() or item.attempts>=5 then return null; end if;
  update public.suggestion_email_outbox set status='sending',attempts=attempts+1,
    first_attempt_at=coalesce(first_attempt_at,now()),next_attempt_at=now()+interval '10 minutes',lease=gen_random_uuid()
    where id=item.id returning * into item;
  return to_jsonb(item);
end;
$$;

create or replace function public.complete_suggestion_digest(delivery_id bigint, claim_lease uuid, succeeded boolean, definite_failure boolean default false, error_message text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
  update public.suggestion_email_outbox set
    status=case when succeeded then 'sent' when attempts>=5 then 'review' else 'pending' end,
    sent_at=case when succeeded then now() else null end,
    first_attempt_at=case when definite_failure and not succeeded then null else first_attempt_at end,
    next_attempt_at=now()+interval '5 minutes',last_error=left(error_message,300)
    where id=delivery_id and lease=claim_lease and status='sending';
end;
$$;
revoke all on function public.claim_suggestion_digest(uuid,text[],text[],jsonb), public.complete_suggestion_digest(bigint,uuid,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_suggestion_digest(uuid,text[],text[],jsonb), public.complete_suggestion_digest(bigint,uuid,boolean,boolean,text) to service_role;
