begin;
insert into auth.users(id,email,raw_user_meta_data) values
('00000000-0000-4000-a000-000000000094','writes-a@example.invalid','{"display_name":"Writes A"}'),
('00000000-0000-4000-a000-000000000095','writes-b@example.invalid','{"display_name":"Writes B"}');
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000094',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.save_my_concert('{"artist":"WRITE AUDIT","venue":"AUDIT VENUE","city":"Barcelona","country":"ES","date":"01/01/2030","bought":false,"festival":"AUDIT FESTIVAL","promoter":"AUDIT PROMOTER","setlistId":"audit-id"}');
reset role;
insert into public.notifications(user_id,kind,metadata)
select '00000000-0000-4000-a000-000000000094','concert_changed','{}'::jsonb from generate_series(1,65);
do $$declare event_id bigint; result jsonb;begin
 select id into event_id from public.concerts where artist='WRITE AUDIT' and venue='AUDIT VENUE';
 result:=public.save_my_concert(jsonb_build_object('concertId',event_id,'artist','WRITE AUDIT','venue','AUDIT VENUE','city','Barcelona','country','ES','date','01/01/2030','bought',true));
 assert exists(select 1 from public.concerts where id=event_id and festival='AUDIT FESTIVAL' and promoter='AUDIT PROMOTER' and setlist_id='audit-id'),'Editing attendance erased event metadata';
 assert result->'concerts' is not null,'Write did not return archive';
 assert jsonb_array_length(result->'notifications')=50,'Snapshot notifications are not bounded';
 begin perform public.save_my_concert('{"artist":"INVALID DATE","venue":"AUDIT VENUE","city":"Barcelona","country":"ES","date":"31/02/2030"}');raise exception 'Invalid date accepted';exception when sqlstate '22023' or datetime_field_overflow then null;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000095',true);
select public.review_my_suggestion('{"artist":"WRITE AUDIT","venue":"AUDIT VENUE","date":"01/01/2030","city":"Barcelona","country":"ES","reviewKey":"v2|write-audit","legacyKey":"legacy-audit"}',false);
do $$begin
 assert exists(select 1 from public.user_dismissed_suggestions where user_id=auth.uid() and suggestion_key='v2|write-audit'),'Dismissal failed for event owned by another user';
end $$;
select public.review_my_suggestion('{"artist":"WRITE AUDIT","venue":"AUDIT VENUE","date":"01/01/2030","city":"Barcelona","country":"ES","reviewKey":"v2|write-audit","legacyKey":"legacy-audit"}',true);
do $$begin
 assert not exists(select 1 from public.user_dismissed_suggestions where user_id=auth.uid() and suggestion_key='v2|write-audit'),'Interested did not clear dismissal';
 assert exists(select 1 from public.concert_participants where user_id=auth.uid() and status='confirmed' and not bought),'Interested did not add unpurchased attendance';
end $$;
select public.review_my_suggestion('{"artist":"WRITE AUDIT","venue":"AUDIT VENUE","date":"01/01/2030","city":"Barcelona","country":"ES","reviewKey":"v2|write-audit","legacyKey":"legacy-audit"}',false);
do $$begin
 assert not exists(select 1 from public.concert_participants where user_id=auth.uid() and visible_in_archive and status='confirmed'),'Not Interested left concert in calendar';
 assert exists(select 1 from public.concert_participants where user_id='00000000-0000-4000-a000-000000000094' and status='confirmed'),'Decision changed another user';
end $$;
rollback;
