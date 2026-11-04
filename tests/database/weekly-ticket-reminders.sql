begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values('00000000-0000-4000-a000-000000000096','weekly-a@example.invalid',now(),'{"display_name":"Weekly A"}');
update public.profiles set notification_preferences=jsonb_set(notification_preferences,'{ticketUpdates,email}','false')||'{"ticketReminders":{"web":false,"email":true}}'::jsonb
where id='00000000-0000-4000-a000-000000000096';
insert into public.concerts(artist,venue,city,country,concert_date,start_date,event_status,created_by)
values('WEEKLY AUDIT OPEN','WEEKLY VENUE','Barcelona','ES',to_char(current_date+10,'DD/MM/YYYY'),current_date+10,'announced','00000000-0000-4000-a000-000000000096'),
('WEEKLY AUDIT BOUGHT','WEEKLY VENUE','Barcelona','ES',to_char(current_date+11,'DD/MM/YYYY'),current_date+11,'announced','00000000-0000-4000-a000-000000000096'),
('WEEKLY AUDIT PAST','WEEKLY VENUE','Barcelona','ES',to_char(current_date-10,'DD/MM/YYYY'),current_date-10,'announced','00000000-0000-4000-a000-000000000096'),
('WEEKLY AUDIT CANCELLED','WEEKLY VENUE','Barcelona','ES',to_char(current_date+12,'DD/MM/YYYY'),current_date+12,'cancelled','00000000-0000-4000-a000-000000000096');
insert into public.concert_participants(concert_id,user_id,bought,status)
select id,'00000000-0000-4000-a000-000000000096',artist='WEEKLY AUDIT BOUGHT','confirmed' from public.concerts where artist like 'WEEKLY AUDIT%';
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
do $$declare recipient jsonb; delivery jsonb;begin
  select value into recipient from jsonb_array_elements(public.get_weekly_ticket_reminder_recipients())
    where value->>'userId'='00000000-0000-4000-a000-000000000096';
  assert jsonb_array_length(recipient->'concerts')=1,'Included bought, past or cancelled concerts';
  assert recipient->'concerts'->0->>'artist'='WEEKLY AUDIT OPEN','Missing unbought concert';
  delivery:=public.claim_weekly_ticket_reminder('00000000-0000-4000-a000-000000000096','{"subject":"Audit","to":["weekly-a@example.invalid"]}');
  assert delivery is not null,'First claim missing';
  assert public.claim_weekly_ticket_reminder('00000000-0000-4000-a000-000000000096','{}') is null,'Concurrent duplicate claim';
  perform public.complete_weekly_ticket_reminder((delivery->>'id')::bigint,(delivery->>'lease')::uuid,true,null);
  assert public.claim_weekly_ticket_reminder('00000000-0000-4000-a000-000000000096','{}') is null,'Weekly email repeated after success';
end $$;
reset role;
update public.profiles set notification_preferences=jsonb_set(jsonb_set(notification_preferences,'{ticketReminders,email}','false'),'{ticketUpdates,email}','true')
where id='00000000-0000-4000-a000-000000000096';
set local role service_role;
do $$begin
  assert not exists(select 1 from jsonb_array_elements(public.get_weekly_ticket_reminder_recipients()) item
    where item->>'userId'='00000000-0000-4000-a000-000000000096'),'Opt-out ignored';
end $$;
reset role;
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$begin
  begin perform public.get_weekly_ticket_reminder_recipients();raise exception 'Recipient emails exposed';exception when insufficient_privilege then null;end;
end $$;
rollback;
