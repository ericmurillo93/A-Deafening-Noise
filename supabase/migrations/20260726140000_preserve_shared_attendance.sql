-- Hiding a historical concert from one account must not rewrite another
-- participant's record of who attended. Future departures still mean the
-- invitation/attendance is withdrawn.

alter table public.concert_participants
  add column if not exists visible_in_archive boolean not null default true;

alter function public.get_app_data() rename to get_app_data_with_hidden;

create or replace function public.get_app_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  visible_concerts jsonb;
begin
  result := public.get_app_data_with_hidden();
  select coalesce(jsonb_agg(item.value order by item.ordinality), '[]'::jsonb)
  into visible_concerts
  from jsonb_array_elements(result->'concerts') with ordinality item(value, ordinality)
  where exists (
    select 1
    from public.concert_participants cp
    where cp.concert_id = (item.value->>'concertId')::bigint
      and cp.user_id = auth.uid()
      and cp.status = 'confirmed'
      and cp.visible_in_archive
  );
  return jsonb_set(result, '{concerts}', visible_concerts);
end;
$$;

revoke all on function public.get_app_data_with_hidden() from public, anon, authenticated;
revoke all on function public.get_app_data() from public, anon;
grant execute on function public.get_app_data() to authenticated;

create or replace function public.restore_participant_visibility()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'confirmed' then new.visible_in_archive := true; end if;
  return new;
end;
$$;

drop trigger if exists restore_participant_visibility on public.concert_participants;
create trigger restore_participant_visibility
before update of bought, status, invited_by, guest_attendees on public.concert_participants
for each row execute function public.restore_participant_visibility();

create or replace function public.leave_shared_concert(target_concert bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_date date;
begin
  perform public.assert_active_user();
  if exists (select 1 from public.concerts where id = target_concert and created_by = auth.uid()) then
    raise exception 'The creator cannot leave; transfer or delete the concert instead' using errcode = '42501';
  end if;

  select to_date(split_part(c.concert_date, ' - ', 1), 'DD/MM/YYYY')
  into target_date from public.concerts c where c.id = target_concert;

  if target_date < current_date then
    update public.concert_participants set visible_in_archive = false
    where concert_id = target_concert and user_id = auth.uid() and status = 'confirmed';
  else
    delete from public.concert_participants
    where concert_id = target_concert and user_id = auth.uid() and status = 'confirmed';
  end if;
  if not found then raise exception 'Attendance not found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.delete_my_concert(target_concert bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  was_creator boolean;
  target_date date;
begin
  perform public.assert_active_user();
  select role into caller_role from public.profiles where id = auth.uid();
  select created_by = auth.uid(), to_date(split_part(concert_date, ' - ', 1), 'DD/MM/YYYY')
  into was_creator, target_date from public.concerts where id = target_concert;

  if not coalesce(was_creator, false) and target_date < current_date then
    update public.concert_participants set visible_in_archive = false
    where concert_id = target_concert and user_id = auth.uid() and status = 'confirmed';
    if not found then raise exception 'Attendance not found' using errcode = 'P0002'; end if;
    return;
  end if;

  delete from public.concert_participants where concert_id = target_concert and user_id = auth.uid();
  if not found and caller_role <> 'admin' then raise exception 'Attendance not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.concert_participants where concert_id = target_concert) then
    delete from public.concerts where id = target_concert;
  elsif was_creator then
    update public.concerts set created_by = (
      select user_id from public.concert_participants
      where concert_id = target_concert and status = 'confirmed'
      order by created_at limit 1
    ) where id = target_concert;
  end if;
end;
$$;

revoke all on function public.restore_participant_visibility() from public, anon;
revoke all on function public.leave_shared_concert(bigint) from public, anon;
revoke all on function public.delete_my_concert(bigint) from public, anon;
grant execute on function public.leave_shared_concert(bigint) to authenticated;
grant execute on function public.delete_my_concert(bigint) to authenticated;
