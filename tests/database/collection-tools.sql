begin;
insert into auth.users(id,email,raw_user_meta_data) values
('00000000-0000-4000-a000-000000000092','collection-a@example.invalid','{"display_name":"Collection A"}'),
('00000000-0000-4000-a000-000000000093','collection-b@example.invalid','{"display_name":"Collection B"}');
update public.profiles set role='admin' where id='00000000-0000-4000-a000-000000000092';
insert into public.concerts(artist,venue,city,country,concert_date,created_by)
values('COLLECTION AUDIT','KEEP VENUE','Barcelona','ES','01/01/2030','00000000-0000-4000-a000-000000000092'),
('COLLECTION AUDIT','DROP VENUE','Barcelona','ES','01/01/2030','00000000-0000-4000-a000-000000000092');
select set_config('audit.keep',(select id::text from public.concerts where artist='COLLECTION AUDIT' and venue='KEEP VENUE'),true);
select set_config('audit.drop',(select id::text from public.concerts where artist='COLLECTION AUDIT' and venue='DROP VENUE'),true);
insert into public.concert_participants(concert_id,user_id,bought,status,guest_attendees)
values(current_setting('audit.keep')::bigint,'00000000-0000-4000-a000-000000000092',false,'confirmed',array['Guest A']),
(current_setting('audit.drop')::bigint,'00000000-0000-4000-a000-000000000092',true,'confirmed',array['Guest B']);
insert into public.concert_sources(concert_id,source,source_event_id) values(current_setting('audit.drop')::bigint,'AUDIT','collection-audit');
update public.concerts set promoter='AUDIT PROMOTER',address='AUDIT ADDRESS' where id=current_setting('audit.drop')::bigint;
insert into storage.objects(bucket_id,name) values('concert-memories','00000000-0000-4000-a000-000000000092/'||current_setting('audit.drop')||'/00000000-0000-4000-a000-000000000001.jpg');
update public.concerts set venue='UPDATED VENUE' where id=current_setting('audit.keep')::bigint;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000092',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.save_my_concert_memory(current_setting('audit.drop')::bigint,jsonb_build_object('note','Private note','rating',5,'photoPath','00000000-0000-4000-a000-000000000092/'||current_setting('audit.drop')||'/photo'));
select public.set_my_concert_photo(current_setting('audit.drop')::bigint,'00000000-0000-4000-a000-000000000092/'||current_setting('audit.drop')||'/00000000-0000-4000-a000-000000000001.jpg',true);
select public.set_my_concert_photo(current_setting('audit.drop')::bigint,'00000000-0000-4000-a000-000000000092/'||current_setting('audit.drop')||'/00000000-0000-4000-a000-000000000001.jpg',true);
do $$begin
 assert jsonb_array_length(public.get_my_concert_journal(current_setting('audit.drop')::bigint)->'memory'->'photoPaths')=2,'Gallery duplicated or lost photo';
end $$;
do $$begin
 assert jsonb_array_length(public.get_my_concert_journal(current_setting('audit.keep')::bigint)->'changes')=1,'History not recorded';
 assert public.export_my_data()->'memories' is not null,'Memories absent from export';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000093',true);
do $$begin
 begin perform public.get_my_concert_journal(current_setting('audit.drop')::bigint);raise exception 'Private memory exposed';exception when insufficient_privilege then null;end;
 begin perform public.set_my_concert_photo(current_setting('audit.drop')::bigint,'anything',false);raise exception 'Another user deleted a photo';exception when insufficient_privilege then null;end;
 begin perform public.admin_merge_concerts(current_setting('audit.keep')::bigint,current_setting('audit.drop')::bigint);raise exception 'Non-admin merged events';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000092',true);
select public.admin_merge_concerts(current_setting('audit.keep')::bigint,current_setting('audit.drop')::bigint);
do $$declare memory jsonb;begin
 memory:=public.get_my_concert_journal(current_setting('audit.keep')::bigint)->'memory';
 assert memory->>'note'='Private note','Memory lost in merge';
 perform public.save_my_concert_memory(current_setting('audit.keep')::bigint,'{"note":"Still private","rating":4}');
 assert jsonb_array_length(public.get_my_concert_journal(current_setting('audit.keep')::bigint)->'memory'->'photoPaths')=2,'Note save erased gallery';
 perform public.set_my_concert_photo(current_setting('audit.keep')::bigint,'00000000-0000-4000-a000-000000000092/'||current_setting('audit.drop')||'/00000000-0000-4000-a000-000000000001.jpg',false);
 assert jsonb_array_length(public.get_my_concert_journal(current_setting('audit.keep')::bigint)->'memory'->'photoPaths')=1,'Photo deletion failed';
 assert public.get_my_concert_journal(current_setting('audit.keep')::bigint)->'memory'->>'note'='Still private','Photo deletion overwrote note';
end $$;
reset role;
do $$begin
 assert not exists(select 1 from public.concerts where id=current_setting('audit.drop')::bigint),'Duplicate not removed';
 assert (select bought from public.concert_participants where concert_id=current_setting('audit.keep')::bigint),'Bought status lost';
 assert (select cardinality(guest_attendees)=2 from public.concert_participants where concert_id=current_setting('audit.keep')::bigint),'Guests lost';
 assert exists(select 1 from public.concert_sources where concert_id=current_setting('audit.keep')::bigint),'Source lost';
 assert (select promoter='AUDIT PROMOTER' and address='AUDIT ADDRESS' from public.concerts where id=current_setting('audit.keep')::bigint),'Optional metadata lost';
end $$;
rollback;
