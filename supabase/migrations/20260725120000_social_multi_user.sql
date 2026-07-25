-- Social multi-user archive: shared canonical concerts, personal attendance,
-- mutual friendships, invitations, and role-based administration.

alter table public.profiles drop constraint if exists profiles_display_name_check;
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists discoverable boolean not null default true;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'user'));

update public.profiles
set username = case lower(email)
  when 'eric.murillo93@gmail.com' then 'eric'
  when 'rpsaray@gmail.com' then 'saray'
  when 'murillodma@gmail.com' then 'papa'
  else lower(regexp_replace(split_part(email, '@', 1), '[^a-z0-9]+', '-', 'g'))
end
where username is null;

update public.profiles set role = case when is_admin then 'admin' else 'user' end;
alter table public.profiles alter column username set not null;
create unique index if not exists profiles_username_lower_uidx on public.profiles (lower(username));

alter table public.concerts add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.concerts add column if not exists normalized_artist text;
alter table public.concerts add column if not exists normalized_venue text;

update public.concerts c
set created_by = coalesce(c.created_by, (
  select cp.user_id from public.concert_participants cp
  join public.profiles p on p.id = cp.user_id
  where cp.concert_id = c.id
  order by p.is_admin desc, cp.user_id
  limit 1
)),
normalized_artist = lower(regexp_replace(trim(c.artist), '[^[:alnum:]]+', ' ', 'g')),
normalized_venue = lower(regexp_replace(trim(c.venue), '[^[:alnum:]]+', ' ', 'g'));

alter table public.concerts alter column normalized_artist set not null;
alter table public.concerts alter column normalized_venue set not null;
create index if not exists concerts_match_idx on public.concerts (normalized_artist, normalized_venue, concert_date);

create or replace function public.set_concert_normalized_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.normalized_artist := lower(regexp_replace(trim(coalesce(new.artist, '')), '[^[:alnum:]]+', ' ', 'g'));
  new.normalized_venue := lower(regexp_replace(trim(coalesce(new.venue, '')), '[^[:alnum:]]+', ' ', 'g'));
  return new;
end;
$$;

drop trigger if exists concerts_normalized_fields on public.concerts;
create trigger concerts_normalized_fields
before insert or update of artist, venue on public.concerts
for each row execute function public.set_concert_normalized_fields();

alter table public.concert_participants add column if not exists bought boolean;
alter table public.concert_participants add column if not exists status text not null default 'confirmed';
alter table public.concert_participants add column if not exists invited_by uuid references public.profiles(id) on delete set null;
alter table public.concert_participants add column if not exists guest_attendees text[] not null default '{}';
alter table public.concert_participants add column if not exists created_at timestamptz not null default now();
alter table public.concert_participants add constraint concert_participants_status_check check (status in ('pending', 'confirmed'));

update public.concert_participants cp
set bought = coalesce(cp.bought, c.bought),
    guest_attendees = case
      when p.is_admin then c.guest_attendees
      else cp.guest_attendees
    end
from public.concerts c, public.profiles p
where cp.concert_id = c.id and cp.user_id = p.id;

alter table public.concert_participants alter column bought set default true;
alter table public.concert_participants alter column bought set not null;

create table public.friendships (
  id bigint generated always as identity primary key,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

create unique index friendships_pair_uidx on public.friendships (
  least(requester_id, addressee_id), greatest(requester_id, addressee_id)
);
create index friendships_addressee_idx on public.friendships(addressee_id, status);
alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;

-- Existing named participants already represent trusted relationships.
insert into public.friendships (requester_id, addressee_id, status)
select admin.id, member.id, 'accepted'
from public.profiles admin
cross join public.profiles member
where admin.role = 'admin' and member.id <> admin.id
on conflict do nothing;

create or replace function public.normalize_concert_value(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(trim(coalesce(value, '')), '[^[:alnum:]]+', ' ', 'g'));
$$;

create or replace function public.are_friends(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = first_user and f.addressee_id = second_user)
        or (f.requester_id = second_user and f.addressee_id = first_user))
  );
$$;

create or replace function public.get_app_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller public.profiles;
begin
  select * into caller from public.profiles where id = auth.uid();
  if caller.id is null then
    raise exception 'Profile not configured' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', caller.id,
      'email', caller.email,
      'displayName', caller.display_name,
      'username', caller.username,
      'role', caller.role,
      'isAdmin', caller.role = 'admin'
    ),
    'concerts', coalesce((
      select jsonb_agg(concert_json order by concert_id)
      from (
        select c.id concert_id,
          jsonb_strip_nulls(jsonb_build_object(
            'concertId', c.id,
            'artist', c.artist,
            'venue', c.venue,
            'date', c.concert_date,
            'bought', own.bought,
            'setlistId', c.setlist_id,
            'ticketUrl', c.ticket_url,
            'createdBy', c.created_by,
            'canEditEvent', caller.role = 'admin' or c.created_by = caller.id,
            'attendees', case when cardinality(attendee_names) > 0 then to_jsonb(attendee_names) end,
            'attendeeUsers', coalesce(attendee_users, '[]'::jsonb),
            'guestAttendees', case when cardinality(own.guest_attendees) > 0 then to_jsonb(own.guest_attendees) end
          )) concert_json
        from public.concerts c
        join public.concert_participants own on own.concert_id = c.id
          and own.user_id = caller.id and own.status = 'confirmed'
        cross join lateral (
          select
            array_cat(
              coalesce(array_agg(p.display_name order by p.display_name)
                filter (where cp.user_id <> caller.id and cp.status = 'confirmed'), '{}'),
              own.guest_attendees
            ) attendee_names,
            coalesce(jsonb_agg(jsonb_build_object(
              'id', p.id, 'displayName', p.display_name, 'status', cp.status
            ) order by p.display_name) filter (
              where cp.user_id <> caller.id
                and (cp.status = 'confirmed' or cp.invited_by = caller.id)
            ), '[]'::jsonb) attendee_users
          from public.concert_participants cp
          join public.profiles p on p.id = cp.user_id
          where cp.concert_id = c.id
        ) attendees
      ) visible
    ), '[]'::jsonb),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'displayName', p.display_name, 'username', p.username
      ) order by p.display_name)
      from public.friendships f
      join public.profiles p on p.id = case when f.requester_id = caller.id then f.addressee_id else f.requester_id end
      where f.status = 'accepted' and (f.requester_id = caller.id or f.addressee_id = caller.id)
    ), '[]'::jsonb),
    'friendRequests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'direction', case when f.addressee_id = caller.id then 'incoming' else 'outgoing' end,
        'userId', p.id,
        'displayName', p.display_name,
        'username', p.username
      ) order by f.created_at desc)
      from public.friendships f
      join public.profiles p on p.id = case when f.requester_id = caller.id then f.addressee_id else f.requester_id end
      where f.status = 'pending' and (f.requester_id = caller.id or f.addressee_id = caller.id)
    ), '[]'::jsonb),
    'concertInvitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'concertId', c.id,
        'artist', c.artist,
        'venue', c.venue,
        'date', c.concert_date,
        'invitedBy', inviter.display_name
      ) order by cp.created_at desc)
      from public.concert_participants cp
      join public.concerts c on c.id = cp.concert_id
      left join public.profiles inviter on inviter.id = cp.invited_by
      where cp.user_id = caller.id and cp.status = 'pending'
    ), '[]'::jsonb),
    'dismissedSuggestions', case when caller.role = 'admin' then coalesce((
      select jsonb_agg(ds.suggestion_key order by ds.suggestion_key) from public.dismissed_suggestions ds
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

create or replace function public.search_profiles(search_query text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'displayName', p.display_name,
    'username', p.username,
    'relationship', coalesce(f.status, 'none'),
    'direction', case when f.requester_id = auth.uid() then 'outgoing' when f.addressee_id = auth.uid() then 'incoming' end
  ) order by p.display_name), '[]'::jsonb)
  from (
    select candidate.*, friendship.id friendship_id, friendship.status friendship_status,
      friendship.requester_id, friendship.addressee_id
    from public.profiles candidate
    left join public.friendships friendship on
      (friendship.requester_id = auth.uid() and friendship.addressee_id = candidate.id)
      or (friendship.addressee_id = auth.uid() and friendship.requester_id = candidate.id)
    where candidate.id <> auth.uid() and candidate.discoverable
      and length(trim(coalesce(search_query, ''))) >= 2
      and (candidate.username ilike '%' || trim(search_query) || '%'
        or candidate.display_name ilike '%' || trim(search_query) || '%')
    order by candidate.display_name
    limit 20
  ) p
  left join public.friendships f on f.id = p.friendship_id;
$$;

create or replace function public.send_friend_request(target_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or target_user = auth.uid() then
    raise exception 'Invalid friend request' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = target_user and discoverable) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  insert into public.friendships (requester_id, addressee_id, status)
  values (auth.uid(), target_user, 'pending')
  on conflict ((least(requester_id, addressee_id)), (greatest(requester_id, addressee_id)))
  do update set
    requester_id = excluded.requester_id,
    addressee_id = excluded.addressee_id,
    status = 'pending',
    updated_at = now()
  where public.friendships.status in ('rejected');
end;
$$;

create or replace function public.respond_friend_request(request_id bigint, accept_request boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.friendships
  set status = case when accept_request then 'accepted' else 'rejected' end,
      updated_at = now()
  where id = request_id and addressee_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Friend request not found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.remove_friend(friend_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.friendships
  where (requester_id = auth.uid() and addressee_id = friend_user)
     or (addressee_id = auth.uid() and requester_id = friend_user);
$$;

create or replace function public.find_concert_matches(match_artist text, match_venue text, match_date text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'concertId', candidate.id, 'artist', candidate.artist, 'venue', candidate.venue, 'date', candidate.concert_date,
    'attendeeCount', candidate.attendee_count
  ) order by candidate.id), '[]'::jsonb)
  from (
    select c.*,
      (select count(*) from public.concert_participants cp
        where cp.concert_id = c.id and cp.status = 'confirmed') attendee_count
    from public.concerts c
    where c.normalized_artist = public.normalize_concert_value(match_artist)
      and c.normalized_venue = public.normalize_concert_value(match_venue)
      and c.concert_date = trim(match_date)
    order by c.id
    limit 5
  ) candidate;
$$;

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
  guest_values text[] := '{}';
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
      nullif(trim(payload->>'ticketUrl'), ''), '{}', caller.id,
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

  select coalesce(array_agg(value), '{}') into guest_values
  from jsonb_array_elements_text(coalesce(payload->'guestAttendees', '[]'::jsonb));

  insert into public.concert_participants (concert_id, user_id, bought, status, guest_attendees)
  values (target_id, caller.id, coalesce((payload->>'bought')::boolean, true), 'confirmed', guest_values)
  on conflict (concert_id, user_id) do update set
    bought = excluded.bought,
    status = 'confirmed',
    invited_by = null,
    guest_attendees = excluded.guest_attendees;

  -- Editing the attendee list also withdraws invitations that this user sent
  -- and that have not yet been accepted. Confirmed attendance is never removed.
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

-- Keep the legacy GitHub backup endpoint accurate while the web app uses the
-- granular social RPCs above. It exports the caller's personal concert state.
create or replace function public.get_concert_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller public.profiles;
begin
  select * into caller from public.profiles where id = auth.uid();
  if caller.id is null then
    raise exception 'Profile not configured' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'concerts', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'artist', c.artist,
        'venue', c.venue,
        'date', c.concert_date,
        'bought', cp.bought,
        'setlistId', c.setlist_id,
        'ticketUrl', c.ticket_url,
        'attendees', case when cardinality(cp.guest_attendees) > 0 then to_jsonb(cp.guest_attendees) end
      )) order by c.id)
      from public.concerts c
      join public.concert_participants cp on cp.concert_id = c.id
        and cp.user_id = caller.id and cp.status = 'confirmed'
    ), '[]'::jsonb),
    'dismissedSuggestions', case when caller.role = 'admin' then coalesce((
      select jsonb_agg(ds.suggestion_key order by ds.suggestion_key)
      from public.dismissed_suggestions ds
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

-- The old full-archive writer is intentionally disabled. A social archive must
-- never be replaced wholesale by one user's browser state.
revoke all on function public.replace_concert_data(jsonb) from public, anon, authenticated;

create or replace function public.delete_my_concert(target_concert bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  was_creator boolean;
begin
  select role into caller_role from public.profiles where id = auth.uid();
  select created_by = auth.uid() into was_creator from public.concerts where id = target_concert;
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

create or replace function public.respond_concert_invitation(target_concert bigint, accept_invitation boolean, response_bought boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if accept_invitation then
    update public.concert_participants
    set status = 'confirmed', invited_by = null, bought = coalesce(response_bought, true)
    where concert_id = target_concert and user_id = auth.uid() and status = 'pending';
  else
    delete from public.concert_participants
    where concert_id = target_concert and user_id = auth.uid() and status = 'pending';
  end if;
  if not found then raise exception 'Invitation not found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.save_setlist_id(target_concert bigint, new_setlist_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.concert_participants
    where concert_id = target_concert and user_id = auth.uid() and status = 'confirmed'
  ) then raise exception 'Concert not available' using errcode = '42501'; end if;
  update public.concerts set setlist_id = nullif(trim(new_setlist_id), '') where id = target_concert;
end;
$$;

create or replace function public.save_dismissed_suggestions(keys text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  insert into public.dismissed_suggestions(suggestion_key)
  select distinct unnest(keys) on conflict do nothing;
end;
$$;

revoke all on function public.normalize_concert_value(text) from public, anon;
revoke all on function public.are_friends(uuid, uuid) from public, anon;
revoke all on function public.get_app_data() from public, anon;
revoke all on function public.search_profiles(text) from public, anon;
revoke all on function public.send_friend_request(uuid) from public, anon;
revoke all on function public.respond_friend_request(bigint, boolean) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.find_concert_matches(text, text, text) from public, anon;
revoke all on function public.upsert_my_concert(jsonb) from public, anon;
revoke all on function public.delete_my_concert(bigint) from public, anon;
revoke all on function public.respond_concert_invitation(bigint, boolean, boolean) from public, anon;
revoke all on function public.save_setlist_id(bigint, text) from public, anon;
revoke all on function public.save_dismissed_suggestions(text[]) from public, anon;
revoke all on function public.get_concert_data() from public, anon;

grant execute on function public.get_app_data() to authenticated;
grant execute on function public.search_profiles(text) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(bigint, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.find_concert_matches(text, text, text) to authenticated;
grant execute on function public.upsert_my_concert(jsonb) to authenticated;
grant execute on function public.delete_my_concert(bigint) to authenticated;
grant execute on function public.respond_concert_invitation(bigint, boolean, boolean) to authenticated;
grant execute on function public.save_setlist_id(bigint, text) to authenticated;
grant execute on function public.save_dismissed_suggestions(text[]) to authenticated;
grant execute on function public.get_concert_data() to authenticated;
