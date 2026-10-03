-- Follow-up to the staged collection migration; never replay applied versions.
create or replace function public.get_my_concert_journal(target_concert bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare participation public.concert_participants;
begin
 perform public.assert_active_user();
 select * into participation from public.concert_participants where concert_id=target_concert and user_id=auth.uid() and status='confirmed' and visible_in_archive;
 if not found then raise exception 'Concert unavailable' using errcode='42501';end if;
 return jsonb_build_object('addedAt',participation.created_at,
  'firstObservedAt',(select min(observed_at) from public.concert_sources where concert_id=target_concert),
  'memory',(select jsonb_build_object('note',note,'rating',rating,'photoPath',photo_path) from public.concert_memories where concert_id=target_concert and user_id=auth.uid()),
  'changes',coalesce((select jsonb_agg(to_jsonb(c)-'concert_id' order by changed_at desc,id desc) from public.concert_changes c where concert_id=target_concert),'[]'::jsonb));
end $$;
create or replace function public.save_my_concert_memory(target_concert bigint,payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare photo text:=nullif(payload->>'photoPath','');
begin
 perform public.get_my_concert_journal(target_concert);
 if jsonb_typeof(payload)<>'object' or length(coalesce(payload->>'note',''))>5000
  or (photo is not null and photo !~ ('^'||auth.uid()::text||'/[0-9]+/photo$')) then raise exception 'Invalid memory' using errcode='22023';end if;
 insert into public.concert_memories(concert_id,user_id,note,rating,photo_path)
 values(target_concert,auth.uid(),coalesce(payload->>'note',''),nullif(payload->>'rating','')::integer,photo)
 on conflict(concert_id,user_id) do update set note=excluded.note,rating=excluded.rating,photo_path=excluded.photo_path,updated_at=now();
end $$;
create or replace function public.admin_merge_concerts(keep_id bigint,remove_id bigint) returns void language plpgsql security definer set search_path='' as $$
declare a public.concerts;b public.concerts;
begin
 if (public.assert_active_user()).role<>'admin' then raise exception 'Admin required' using errcode='42501';end if;
 if keep_id=remove_id then raise exception 'Choose two different concerts';end if;
 perform 1 from public.concerts where id in(keep_id,remove_id) order by id for update;
 select * into a from public.concerts where id=keep_id;select * into b from public.concerts where id=remove_id;
 if a.id is null or b.id is null or a.normalized_artist<>b.normalized_artist or a.concert_date<>b.concert_date
  or a.city is distinct from b.city or a.country is distinct from b.country then raise exception 'Concert identity differs';end if;
 if exists(select 1 from public.concert_participants x join public.concert_participants y on y.user_id=x.user_id where x.concert_id=keep_id and y.concert_id=remove_id and (x.status<>y.status or x.visible_in_archive<>y.visible_in_archive)) then raise exception 'Attendance conflict needs review';end if;
 if exists(select 1 from public.concert_participants where concert_id in(keep_id,remove_id) and not visible_in_archive) then raise exception 'Hidden attendance needs review';end if;
 if exists(select 1 from public.concert_memories x join public.concert_memories y on y.user_id=x.user_id where x.concert_id=keep_id and y.concert_id=remove_id and (x.note<>y.note or x.rating is distinct from y.rating or x.photo_path is distinct from y.photo_path)) then raise exception 'Personal memories need review before merging';end if;
 insert into public.concert_participants select (jsonb_populate_record(null::public.concert_participants,to_jsonb(cp)||jsonb_build_object('concert_id',keep_id))).* from public.concert_participants cp where concert_id=remove_id
 on conflict(concert_id,user_id) do update set bought=public.concert_participants.bought or excluded.bought,
 guest_attendees=array(select distinct v from unnest(public.concert_participants.guest_attendees||excluded.guest_attendees)v),
 confirmed_at=coalesce(public.concert_participants.confirmed_at,excluded.confirmed_at),invited_by=coalesce(public.concert_participants.invited_by,excluded.invited_by);
 insert into public.concert_artists select keep_id,artist,normalized_artist,billing_order,role from public.concert_artists where concert_id=remove_id on conflict do nothing;
 insert into public.concert_memories select keep_id,user_id,note,rating,photo_path,updated_at from public.concert_memories where concert_id=remove_id on conflict do nothing;
 update public.concert_sources set concert_id=keep_id where concert_id=remove_id;
 update public.concert_changes set concert_id=keep_id where concert_id=remove_id;
 update public.notifications n set read_at=coalesce(n.read_at,now()) where n.concert_id=remove_id and n.kind='concert_invitation' and n.read_at is null and exists(select 1 from public.notifications k where k.concert_id=keep_id and k.user_id=n.user_id and k.kind=n.kind and k.read_at is null);
 update public.notifications set concert_id=keep_id where concert_id=remove_id;
 update public.concerts set ticket_url=coalesce(a.ticket_url,b.ticket_url),setlist_id=coalesce(a.setlist_id,b.setlist_id),festival=coalesce(nullif(a.festival,''),b.festival) where id=keep_id;
 insert into public.concert_merge_audit(actor_id,kept_id,removed_id) values(auth.uid(),keep_id,remove_id);
 delete from public.concerts where id=remove_id;
end $$;
revoke all on function public.get_my_concert_journal(bigint),public.save_my_concert_memory(bigint,jsonb),public.admin_merge_concerts(bigint,bigint) from public,anon;
grant execute on function public.get_my_concert_journal(bigint),public.save_my_concert_memory(bigint,jsonb),public.admin_merge_concerts(bigint,bigint) to authenticated;
