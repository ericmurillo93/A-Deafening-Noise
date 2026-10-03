-- Personal memories and an attendance-scoped history; no public archive access.
create table public.concert_memories (
  concert_id bigint not null references public.concerts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  note text not null default '' check(length(note)<=5000),
  rating integer check(rating between 1 and 5),
  photo_path text,
  updated_at timestamptz not null default now(),
  primary key(concert_id,user_id)
);
create table public.concert_changes (
  id bigint generated always as identity primary key,
  concert_id bigint not null references public.concerts(id) on delete cascade,
  field text not null,
  before_value text,
  after_value text,
  changed_at timestamptz not null default now()
);
create index concert_changes_event_idx on public.concert_changes(concert_id,changed_at desc);
create table public.concert_merge_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  kept_id bigint not null,
  removed_id bigint not null,
  changed_at timestamptz not null default now()
);
alter table public.concert_memories enable row level security;
alter table public.concert_changes enable row level security;
alter table public.concert_merge_audit enable row level security;
revoke all on public.concert_memories,public.concert_changes,public.concert_merge_audit from public,anon,authenticated;

create function public.record_concert_changes() returns trigger language plpgsql security definer set search_path='' as $$
declare field_name text;
begin
 foreach field_name in array array['concert_date','venue','city','country','event_status','ticket_url','festival'] loop
  if (to_jsonb(old)->field_name) is distinct from (to_jsonb(new)->field_name) then
   insert into public.concert_changes(concert_id,field,before_value,after_value)
   values(new.id,field_name,to_jsonb(old)->>field_name,to_jsonb(new)->>field_name);
  end if;
 end loop;
 return new;
end $$;
create trigger concert_changes_record after update on public.concerts for each row execute function public.record_concert_changes();

create function public.get_my_concert_journal(target_concert bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare participation public.concert_participants;
begin
 perform public.assert_active_user();
 select * into participation from public.concert_participants where concert_id=target_concert and user_id=auth.uid() and status='confirmed' and visible_in_archive;
 if not found then raise exception 'Concert unavailable' using errcode='42501';end if;
 return jsonb_build_object('addedAt',participation.created_at,
  'memory',(select jsonb_build_object('note',note,'rating',rating,'photoPath',photo_path) from public.concert_memories where concert_id=target_concert and user_id=auth.uid()),
  'changes',coalesce((select jsonb_agg(to_jsonb(c)-'concert_id' order by changed_at desc,id desc) from public.concert_changes c where concert_id=target_concert),'[]'::jsonb));
end $$;
create function public.save_my_concert_memory(target_concert bigint,payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare photo text:=nullif(payload->>'photoPath','');
begin
 perform public.get_my_concert_journal(target_concert);
 if jsonb_typeof(payload)<>'object' or length(coalesce(payload->>'note',''))>5000
  or (photo is not null and photo<>auth.uid()::text||'/'||target_concert::text||'/photo') then raise exception 'Invalid memory' using errcode='22023';end if;
 insert into public.concert_memories(concert_id,user_id,note,rating,photo_path)
 values(target_concert,auth.uid(),coalesce(payload->>'note',''),nullif(payload->>'rating','')::integer,photo)
 on conflict(concert_id,user_id) do update set note=excluded.note,rating=excluded.rating,photo_path=excluded.photo_path,updated_at=now();
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('concert-memories','concert-memories',false,2097152,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy concert_memory_files on storage.objects for all to authenticated
using(bucket_id='concert-memories' and (storage.foldername(name))[1]=auth.uid()::text and public.get_my_preferences() is not null)
with check(bucket_id='concert-memories' and (storage.foldername(name))[1]=auth.uid()::text and public.get_my_preferences() is not null);

create function public.admin_concert_duplicates() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if (public.assert_active_user()).role<>'admin' then raise exception 'Admin required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(g) from(select a.artist,a.concert_date as date,a.city,a.country,
 jsonb_agg(jsonb_build_object('id',a.id,'venue',a.venue,'participants',(select count(*) from public.concert_participants where concert_id=a.id)) order by a.id) events
 from public.concerts a group by a.normalized_artist,a.artist,a.concert_date,a.city,a.country having count(*)>1 order by min(a.id) limit 100)g),'[]'::jsonb);
end $$;
create function public.admin_merge_concerts(keep_id bigint,remove_id bigint) returns void language plpgsql security definer set search_path='' as $$
declare a public.concerts;b public.concerts;
begin
 if (public.assert_active_user()).role<>'admin' then raise exception 'Admin required' using errcode='42501';end if;
 if keep_id=remove_id then raise exception 'Choose two different concerts';end if;
 -- Ordered row locks prevent two administrators merging the same pair concurrently.
 perform 1 from public.concerts where id in(keep_id,remove_id) order by id for update;
 select * into a from public.concerts where id=keep_id;select * into b from public.concerts where id=remove_id;
 if a.id is null or b.id is null or a.normalized_artist<>b.normalized_artist or a.concert_date<>b.concert_date
  or a.city is distinct from b.city or a.country is distinct from b.country then raise exception 'Concert identity differs';end if;
 if exists(select 1 from public.concert_participants x join public.concert_participants y on y.user_id=x.user_id where x.concert_id=keep_id and y.concert_id=remove_id and (x.status<>y.status or x.visible_in_archive<>y.visible_in_archive)) then raise exception 'Attendance conflict needs review';end if;
 if exists(select 1 from public.concert_participants where concert_id in(keep_id,remove_id) and not visible_in_archive) then raise exception 'Hidden attendance needs review';end if;
 if exists(select 1 from public.concert_memories x join public.concert_memories y on y.user_id=x.user_id where x.concert_id=keep_id and y.concert_id=remove_id and (x.note<>y.note or x.rating is distinct from y.rating or x.photo_path is not null or y.photo_path is not null))
 or exists(select 1 from public.concert_memories where concert_id=remove_id and photo_path is not null) then raise exception 'Personal memories need review before merging';end if;
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
revoke all on function public.record_concert_changes(),public.get_my_concert_journal(bigint),public.save_my_concert_memory(bigint,jsonb),public.admin_concert_duplicates(),public.admin_merge_concerts(bigint,bigint) from public,anon;
grant execute on function public.get_my_concert_journal(bigint),public.save_my_concert_memory(bigint,jsonb),public.admin_concert_duplicates(),public.admin_merge_concerts(bigint,bigint) to authenticated;

-- Memories remain portable without exposing them to friends or the catalog.
alter function public.export_my_data() rename to export_my_data_without_memories;
revoke all on function public.export_my_data_without_memories() from public,anon,authenticated;
create function public.export_my_data() returns jsonb language sql stable security definer set search_path='' as $$
 select public.export_my_data_without_memories() || jsonb_build_object('memories',coalesce((select jsonb_agg(jsonb_build_object('concertId',concert_id,'note',note,'rating',rating,'photoPath',photo_path,'updatedAt',updated_at)) from public.concert_memories where user_id=auth.uid()),'[]'::jsonb));
$$;
revoke all on function public.export_my_data() from public,anon;
grant execute on function public.export_my_data() to authenticated;
