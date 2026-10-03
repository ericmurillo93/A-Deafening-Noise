-- Multiple private photos; preserve the previous single-photo links.
alter table public.concert_memories add column photo_paths text[] not null default '{}';
update public.concert_memories set photo_paths=array[photo_path] where photo_path is not null;

create or replace function public.get_my_concert_journal(target_concert bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare participation public.concert_participants;
begin
 perform public.assert_active_user();
 select * into participation from public.concert_participants where concert_id=target_concert and user_id=auth.uid() and status='confirmed' and visible_in_archive;
 if not found then raise exception 'Concert unavailable' using errcode='42501';end if;
 return jsonb_build_object('addedAt',participation.created_at,
  'firstObservedAt',(select min(observed_at) from public.concert_sources where concert_id=target_concert),
  'memory',(select jsonb_build_object('note',note,'rating',rating,'photoPath',photo_path,'photoPaths',to_jsonb(photo_paths)) from public.concert_memories where concert_id=target_concert and user_id=auth.uid()),
  'changes',coalesce((select jsonb_agg(to_jsonb(c)-'concert_id' order by changed_at desc,id desc) from public.concert_changes c where concert_id=target_concert),'[]'::jsonb));
end $$;

create or replace function public.save_my_concert_memory(target_concert bigint,payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare photo text:=nullif(payload->>'photoPath','');
begin
 perform public.get_my_concert_journal(target_concert);
 if jsonb_typeof(payload)<>'object' or length(coalesce(payload->>'note',''))>5000
  or (photo is not null and photo !~ ('^'||auth.uid()::text||'/[0-9]+/photo$')) then raise exception 'Invalid memory' using errcode='22023';end if;
 insert into public.concert_memories(concert_id,user_id,note,rating,photo_path,photo_paths)
 values(target_concert,auth.uid(),coalesce(payload->>'note',''),nullif(payload->>'rating','')::integer,photo,case when photo is null then '{}'::text[] else array[photo] end)
 on conflict(concert_id,user_id) do update set note=excluded.note,rating=excluded.rating,
  photo_path=case when payload ? 'photoPath' then excluded.photo_path else public.concert_memories.photo_path end,
  photo_paths=case when payload ? 'photoPath' then excluded.photo_paths else public.concert_memories.photo_paths end,updated_at=now();
end $$;

create function public.set_my_concert_photo(target_concert bigint,photo text,keep_photo boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.get_my_concert_journal(target_concert);
 if photo is null or photo !~ ('^'||auth.uid()::text||'/[0-9]+/(photo|[a-f0-9-]{36}\.jpg)$') or keep_photo is null then raise exception 'Invalid photo' using errcode='22023';end if;
 if keep_photo then
  if not exists(select 1 from storage.objects where bucket_id='concert-memories' and name=photo) then raise exception 'Photo unavailable';end if;
  insert into public.concert_memories(concert_id,user_id,photo_path,photo_paths) values(target_concert,auth.uid(),photo,array[photo])
  on conflict(concert_id,user_id) do update set photo_paths=case when photo=any(public.concert_memories.photo_paths) then public.concert_memories.photo_paths else array_append(public.concert_memories.photo_paths,photo) end,
   photo_path=coalesce(public.concert_memories.photo_path,photo),updated_at=now();
 else
  update public.concert_memories set photo_paths=array_remove(photo_paths,photo),photo_path=(array_remove(photo_paths,photo))[1],updated_at=now() where concert_id=target_concert and user_id=auth.uid();
 end if;
end $$;
revoke all on function public.set_my_concert_photo(bigint,text,boolean) from public,anon;
grant execute on function public.set_my_concert_photo(bigint,text,boolean) to authenticated;

-- Extend the existing merger without editing previously applied migrations.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.admin_merge_concerts(bigint,bigint)'::regprocedure);
 definition:=replace(definition,'x.photo_path is distinct from y.photo_path','x.photo_path is distinct from y.photo_path or x.photo_paths is distinct from y.photo_paths');
 definition:=replace(definition,'insert into public.concert_memories select keep_id,user_id,note,rating,photo_path,updated_at','insert into public.concert_memories(concert_id,user_id,note,rating,photo_path,updated_at,photo_paths) select keep_id,user_id,note,rating,photo_path,updated_at,photo_paths');
 execute definition;
end $$;
create or replace function public.export_my_data() returns jsonb language sql stable security definer set search_path='' as $$
 select public.export_my_data_without_memories() || jsonb_build_object('memories',coalesce((select jsonb_agg(jsonb_build_object('concertId',concert_id,'note',note,'rating',rating,'photoPath',photo_path,'photoPaths',to_jsonb(photo_paths),'updatedAt',updated_at)) from public.concert_memories where user_id=auth.uid()),'[]'::jsonb));
$$;
