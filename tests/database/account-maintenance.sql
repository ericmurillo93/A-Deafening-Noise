begin;
-- Isolate queue selection inside this rolled-back transaction; no real delivery or deletion.
update public.notification_email_outbox set next_attempt_at=now()+interval '10 days';
update public.account_deletion_requests set next_attempt_at=now()+interval '10 days';
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('00000000-0000-4000-a000-000000000091','maintenance-a@example.invalid',now(),'{"display_name":"Maintenance A"}'),
('00000000-0000-4000-a000-000000000092','maintenance-b@example.invalid',now(),'{"display_name":"Maintenance B"}');
update public.profiles set language='es' where id='00000000-0000-4000-a000-000000000092';
insert into public.notifications(user_id,kind,created_at)
select '00000000-0000-4000-a000-000000000091'::uuid,'friend_request',now()-interval '1 day' from generate_series(1,55);
update public.profiles set notification_preferences=jsonb_set(notification_preferences,'{social,email}','false') where id='00000000-0000-4000-a000-000000000091';
insert into public.notifications(user_id,kind) values('00000000-0000-4000-a000-000000000092','friend_request');
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
do $$declare batch jsonb; delivery jsonb;begin
  batch:=public.get_notification_email_batch(50);
  assert jsonb_array_length(batch)=1,'Disabled recipients starved eligible queue entries';
  assert batch->0->>'language'='es','Missing recipient language';
  perform set_config('test.outbox_id',batch->0->>'outboxId',true);
  delivery:=public.claim_notification_email((batch->0->>'outboxId')::bigint,'{"subject":"Frozen","to":["wrong@example.invalid"]}');
  assert delivery->'message'->'to'='["maintenance-b@example.invalid"]'::jsonb,'Caller substituted recipient';
  perform set_config('test.lease',delivery->>'lease',true);
  assert public.claim_notification_email((delivery->>'id')::bigint,'{}') is null,'Duplicate lease acquired';
  perform public.complete_notification_email((delivery->>'id')::bigint,(delivery->>'lease')::uuid,false,'Test timeout');
end $$;
reset role;
update public.notification_email_outbox set next_attempt_at=now()-interval '1 minute' where id=current_setting('test.outbox_id')::bigint;
set local role service_role;
do $$declare delivery jsonb;begin
  delivery:=public.claim_notification_email(current_setting('test.outbox_id')::bigint,'{"subject":"Changed"}');
  assert delivery->'message'->>'subject'='Frozen','Retry changed the idempotent payload';
  begin
    perform public.complete_notification_email((delivery->>'id')::bigint,current_setting('test.lease')::uuid,true);
    raise exception 'Stale lease accepted';
  exception when serialization_failure then null;end;
  perform public.complete_notification_email((delivery->>'id')::bigint,(delivery->>'lease')::uuid,false,'Test timeout');
end $$;
reset role;
update public.notification_email_outbox set first_attempt_at=now()-interval '24 hours',next_attempt_at=now()-interval '1 minute' where id=current_setting('test.outbox_id')::bigint;
set local role service_role;
do $$begin assert jsonb_array_length(public.get_notification_email_batch())=0,'Expired idempotency window resent';end $$;
reset role;
do $$begin assert (select status='review' from public.notification_email_outbox where id=current_setting('test.outbox_id')::bigint),'Ambiguous delivery was not quarantined';end $$;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000091',true);
set local role authenticated;
do $$begin
  begin perform public.get_notification_email_batch();raise exception 'Recipient data exposed';exception when insufficient_privilege then null;end;
  begin perform public.claim_account_deletions();raise exception 'User claimed deletions';exception when insufficient_privilege then null;end;
  perform public.delete_my_account();
  perform public.delete_my_account();
  begin perform public.get_my_preferences();raise exception 'Deleted account retained access';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
  assert exists(select 1 from auth.users where id='00000000-0000-4000-a000-000000000091'),'Auth removed before storage cleanup';
  assert (select account_status='blocked' from public.profiles where id='00000000-0000-4000-a000-000000000091');
  assert (select account_status='active' from public.profiles where id='00000000-0000-4000-a000-000000000092'),'Unrelated account affected';
end $$;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
do $$declare delivery jsonb;begin
  delivery:=public.claim_account_deletions()->0;
  assert delivery->>'user_id'='00000000-0000-4000-a000-000000000091';
  assert public.claim_account_deletions()='[]'::jsonb,'Deletion claimed twice';
  perform public.complete_account_deletion((delivery->>'user_id')::uuid,(delivery->>'lease')::uuid,false,'Test storage failure');
end $$;
reset role;
update public.account_deletion_requests set next_attempt_at=now()-interval '1 minute' where user_id='00000000-0000-4000-a000-000000000091';
set local role service_role;
do $$declare delivery jsonb;begin
  delivery:=public.claim_account_deletions()->0;
  perform public.complete_account_deletion((delivery->>'user_id')::uuid,(delivery->>'lease')::uuid,true);
end $$;
reset role;
do $$begin
  assert not exists(select 1 from auth.users where id='00000000-0000-4000-a000-000000000091'),'Completed cleanup retained Auth';
  assert not exists(select 1 from public.account_deletion_requests where user_id='00000000-0000-4000-a000-000000000091'),'Completed request retained';
  assert exists(select 1 from auth.users where id='00000000-0000-4000-a000-000000000092'),'Unrelated Auth user deleted';
end $$;
rollback;
