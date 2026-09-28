begin;
-- Disposable accounts, transactions and outbox claims; no emails or lasting rows.
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-4000-a000-000000000001','audit-a@example.invalid','{"display_name":"Audit A"}'),
 ('00000000-0000-4000-a000-000000000002','audit-b@example.invalid','{"display_name":"Audit B"}'),
 ('00000000-0000-4000-a000-000000000003','audit-c@example.invalid','{"display_name":"Audit C"}');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$ declare result jsonb; exported jsonb; n integer; denied boolean:=false;
begin
  result:=public.upsert_my_concert('{"artist":"AUDIT PRIVATE ARTIST","venue":"AUDIT VENUE","city":"Barcelona","country":"ES","date":"01/02/2020","bought":true,"guestAttendees":["Synthetic guest"]}');
  perform set_config('test.concert_id',result->>'concertId',true);
  exported:=public.export_my_data();
  assert exported->>'schemaVersion'='2';
  assert exported->'concerts'->0->>'city'='Barcelona';
  assert exported->'concerts'->0->>'country'='ES';
  assert exported->'concerts'->0->'guestAttendees' @> '["Synthetic guest"]'::jsonb;
  perform public.import_my_concerts(exported->'concerts');
  assert jsonb_array_length(public.get_my_archive_snapshot()->'concerts')=1, 'Reimport duplicated attendance';
  begin
    perform public.import_my_concerts(jsonb_build_array(exported->'concerts'->0||'{"artist":"MUST ROLL BACK"}'::jsonb,exported->'concerts'->0||'{"date":"31/02/2020"}'::jsonb));
  exception when data_exception then denied:=true; end;
  assert denied,'An invalid import was accepted';
  assert jsonb_array_length(public.get_my_archive_snapshot()->'concerts')=1,'A failed import partially saved';
  denied:=false;
  for n in 1..30 loop assert public.consume_provider_quota('catalog'); end loop;
  assert not public.consume_provider_quota('catalog'), 'Quota did not stop request 31';
  begin perform public.admin_data_quality(); exception when insufficient_privilege then denied:=true; end;
  assert denied,'A normal user accessed administration';
  perform public.send_friend_request('00000000-0000-4000-a000-000000000002');
end $$;

reset role;
select set_config('test.friendship_id',(select id::text from public.friendships where requester_id='00000000-0000-4000-a000-000000000001' and addressee_id='00000000-0000-4000-a000-000000000002'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000002',true);
do $$ declare denied boolean:=false;
begin
  assert jsonb_array_length(public.get_my_archive_snapshot()->'concerts')=0,'Unrelated archive leaked';
  begin perform public.get_friend_profile('00000000-0000-4000-a000-000000000001'); exception when insufficient_privilege then denied:=true; end;
  assert denied,'Pending friendship exposed a profile';
  perform public.respond_friend_request(current_setting('test.friendship_id')::bigint,true);
  denied:=false;
  begin perform public.get_social_comparison('00000000-0000-4000-a000-000000000001'); exception when insufficient_privilege then denied:=true; end;
  assert denied,'Friendship bypassed archive-sharing consent';
  assert public.consume_provider_quota('catalog'),'A different user inherited another quota';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000001',true);
select public.set_stats_sharing('00000000-0000-4000-a000-000000000002',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000002',true);
select public.get_social_comparison('00000000-0000-4000-a000-000000000001');
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000001',true);
select public.set_stats_sharing('00000000-0000-4000-a000-000000000002',false);
select public.upsert_my_concert(jsonb_build_object('concertId',current_setting('test.concert_id')::bigint,'artist','AUDIT PRIVATE ARTIST','venue','AUDIT VENUE','city','Barcelona','country','ES','date','01/02/2020','bought',true,'attendeeUserIds',jsonb_build_array('00000000-0000-4000-a000-000000000002')));
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000002',true);
do $$ declare denied boolean:=false;
begin
  begin perform public.get_social_comparison('00000000-0000-4000-a000-000000000001'); exception when insufficient_privilege then denied:=true; end;
  assert denied,'Revoked consent remained usable';
  assert jsonb_array_length(public.get_my_archive_snapshot()->'concerts')=0,'An invitation became attendance without acceptance';
  perform public.set_concert_invitation_status(current_setting('test.concert_id')::bigint,'confirmed',true);
  assert jsonb_array_length(public.get_my_archive_snapshot()->'concerts')=1,'Accepted invitation is missing';
  perform public.leave_shared_concert(current_setting('test.concert_id')::bigint);
  assert jsonb_array_length(public.get_my_archive_snapshot()->'concerts')=0,'Leaving kept the concert visible';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000001',true);
do $$ begin assert jsonb_array_length(public.get_my_archive_snapshot()->'concerts')=1,'A friend leaving removed the creator archive'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000003',true);
do $$ begin assert jsonb_array_length(public.get_my_archive_snapshot()->'concerts')=0,'An unrelated user inherited shared attendance'; end $$;

reset role;
update public.profiles set suggestion_email_enabled=true where id='00000000-0000-4000-a000-000000000001';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$ declare item jsonb; again jsonb;
begin
  assert public.get_discovery_artist_catalog() @> '["AUDIT PRIVATE ARTIST"]'::jsonb,'Archive-only affinity was omitted';
  item:=public.claim_suggestion_digest('00000000-0000-4000-a000-000000000001',array['test-event'],array['test-event'],'{"to":["audit-a@example.invalid"],"subject":"test"}');
  assert item is not null;
  again:=public.claim_suggestion_digest('00000000-0000-4000-a000-000000000001',array['test-event'],array['test-event'],'{"subject":"changed"}');
  assert again is null,'Concurrent claim acquired the same delivery';
  perform public.complete_suggestion_digest((item->>'id')::bigint,(item->>'lease')::uuid,true);
  assert public.claim_suggestion_digest('00000000-0000-4000-a000-000000000001',array['another-event'],array['another-event'],'{}') is null,'More than one digest per day';
end $$;
reset role;
update public.profiles set suggestion_email_enabled=true where id='00000000-0000-4000-a000-000000000002';
set local role service_role;
do $$ declare item jsonb;
begin
  item:=public.claim_suggestion_digest('00000000-0000-4000-a000-000000000002',array['retry-event'],array['retry-event'],'{"subject":"frozen"}');
  perform set_config('test.delivery_id',item->>'id',true);
  perform public.complete_suggestion_digest((item->>'id')::bigint,(item->>'lease')::uuid,false,false,'Synthetic timeout');
end $$;
reset role;
update public.suggestion_email_outbox set next_attempt_at=now()-interval '1 minute' where id=current_setting('test.delivery_id')::bigint;
set local role service_role;
do $$ declare item jsonb;
begin
  item:=public.claim_suggestion_digest('00000000-0000-4000-a000-000000000002',array['new-event'],array['retry-event','new-event'],'{"subject":"must not replace"}');
  assert item->>'id'=current_setting('test.delivery_id'),'Retry changed the idempotency identity';
  assert item->'message'->>'subject'='frozen','Retry changed the message';
  perform public.complete_suggestion_digest((item->>'id')::bigint,gen_random_uuid(),true);
  assert (select status='sending' from public.suggestion_email_outbox where id=(item->>'id')::bigint),'Stale lease acknowledged delivery';
  perform public.complete_suggestion_digest((item->>'id')::bigint,(item->>'lease')::uuid,true);
end $$;
reset role;
do $$ begin
  assert not has_table_privilege('authenticated','public.suggestion_email_outbox','select');
  assert not has_function_privilege('anon','public.get_my_archive_snapshot()','execute');
  assert not has_function_privilege('authenticated','public.get_discovery_artist_catalog()','execute');
end $$;
rollback;
