-- Make the guest-attendee array type explicit and keep the currently deployed
-- client compatible until the social frontend is published.

create or replace function public.upsert_my_concert(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.profiles;
  target_id bigint;
  existing_match boolean := false;
  friend_id uuid;
  guest_values text[] := array[]::text[];
begin
  select * into caller from public.profiles where id = auth.uid();
  if caller.id is null then raise exception 'Profile not configured' using errcode = '42501'; end if;

  target_id := nullif(payload->>'concertId', '')::bigint;
  if target_id is null then
    select c.id into target_id from public.concerts c
    where c.normalized_artist = public.normalize_concert_value(payload->>'artist')
      and c.normalized_venue = public.normalize_concert_value(payload->>'venue')
      and c.concert_date = trim(payload->>'date')
    order by c.id limit 1;
    existing_match := target_id is not null;
  end if;

  if target_id is null then
    insert into public.concerts (
      artist, venue, concert_date, bought, setlist_id, ticket_url, guest_attendees,
      created_by, normalized_artist, normalized_venue
    ) values (
      trim(payload->>'artist'), coalesce(trim(payload->>'venue'), ''), trim(payload->>'date'),
      coalesce((payload->>'bought')::boolean, true), nullif(trim(payload->>'setlistId'), ''),
      nullif(trim(payload->>'ticketUrl'), ''), array[]::text[], caller.id,
      public.normalize_concert_value(payload->>'artist'), public.normalize_concert_value(payload->>'venue')
    ) returning id into target_id;
  elsif not exists (select 1 from public.concerts where id = target_id) then
    raise exception 'Concert not found' using errcode = 'P0002';
  elsif caller.role = 'admin' or exists (
    select 1 from public.concerts where id = target_id and created_by = caller.id
  ) then
    update public.concerts set
      artist = trim(payload->>'artist'),
      venue = coalesce(trim(payload->>'venue'), ''),
      concert_date = trim(payload->>'date'),
      setlist_id = nullif(trim(payload->>'setlistId'), ''),
      ticket_url = nullif(trim(payload->>'ticketUrl'), ''),
      normalized_artist = public.normalize_concert_value(payload->>'artist'),
      normalized_venue = public.normalize_concert_value(payload->>'venue')
    where id = target_id;
  end if;

  select coalesce(array_agg(value), array[]::text[]) into guest_values
  from jsonb_array_elements_text(coalesce(payload->'guestAttendees', '[]'::jsonb));

  insert into public.concert_participants (concert_id, user_id, bought, status, guest_attendees)
  values (target_id, caller.id, coalesce((payload->>'bought')::boolean, true), 'confirmed', guest_values)
  on conflict (concert_id, user_id) do update set
    bought = excluded.bought,
    status = 'confirmed',
    invited_by = null,
    guest_attendees = excluded.guest_attendees;

  delete from public.concert_participants cp
  where cp.concert_id = target_id
    and cp.status = 'pending'
    and cp.invited_by = caller.id
    and not exists (
      select 1
      from jsonb_array_elements_text(coalesce(payload->'attendeeUserIds', '[]'::jsonb)) selected(value)
      where selected.value::uuid = cp.user_id
    );

  for friend_id in
    select value::uuid from jsonb_array_elements_text(coalesce(payload->'attendeeUserIds', '[]'::jsonb))
  loop
    if friend_id <> caller.id and public.are_friends(caller.id, friend_id) then
      insert into public.concert_participants (concert_id, user_id, bought, status, invited_by)
      values (target_id, friend_id, true, 'pending', caller.id)
      on conflict (concert_id, user_id) do update set
        invited_by = case when public.concert_participants.status = 'pending' then caller.id else public.concert_participants.invited_by end;
    end if;
  end loop;

  return jsonb_build_object('concertId', target_id, 'matchedExisting', existing_match);
end;
$$;

revoke all on function public.upsert_my_concert(jsonb) from public, anon;
grant execute on function public.upsert_my_concert(jsonb) to authenticated;

-- Remove this compatibility grant in the deployment migration that accompanies
-- the social frontend.
grant execute on function public.replace_concert_data(jsonb) to authenticated;
