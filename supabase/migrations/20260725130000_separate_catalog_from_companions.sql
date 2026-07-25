-- Reusing a canonical concert must not imply that users attended together.
-- Only an explicit accepted invitation creates a companion relationship.

update public.concert_participants cp
set invited_by = c.created_by
from public.concerts c
where cp.concert_id = c.id
  and cp.status = 'confirmed'
  and cp.user_id <> c.created_by
  and cp.invited_by is null;

create or replace function public.search_concert_catalog(search_field text, search_value text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'concertId', candidate.id,
    'artist', candidate.artist,
    'venue', candidate.venue,
    'date', candidate.concert_date,
    'ticketUrl', candidate.ticket_url
  )) order by candidate.concert_date desc, candidate.artist), '[]'::jsonb)
  from (
    select c.*
    from public.concerts c
    where length(trim(coalesce(search_value, ''))) >= 2
      and case search_field
        when 'artist' then c.artist ilike '%' || trim(search_value) || '%'
        when 'venue' then c.venue ilike '%' || trim(search_value) || '%'
        when 'date' then c.concert_date ilike '%' || trim(search_value) || '%'
        else false
      end
    order by
      case search_field
        when 'artist' then position(lower(trim(search_value)) in lower(c.artist))
        when 'venue' then position(lower(trim(search_value)) in lower(c.venue))
        when 'date' then position(lower(trim(search_value)) in lower(c.concert_date))
        else 999
      end,
      c.concert_date desc,
      c.artist
    limit 8
  ) candidate;
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
              coalesce(array_agg(p.display_name order by p.display_name) filter (
                where cp.user_id <> caller.id
                  and cp.status = 'confirmed'
                  and (cp.invited_by = caller.id or own.invited_by = cp.user_id)
              ), array[]::text[]),
              own.guest_attendees
            ) attendee_names,
            coalesce(jsonb_agg(jsonb_build_object(
              'id', p.id, 'displayName', p.display_name, 'status', cp.status
            ) order by p.display_name) filter (
              where cp.user_id <> caller.id
                and (
                  (cp.status = 'confirmed' and (cp.invited_by = caller.id or own.invited_by = cp.user_id))
                  or (cp.status = 'pending' and cp.invited_by = caller.id)
                )
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
      select jsonb_agg(ds.suggestion_key order by ds.suggestion_key)
      from public.dismissed_suggestions ds
    ), '[]'::jsonb) else '[]'::jsonb end
  );
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
    set status = 'confirmed', bought = coalesce(response_bought, true)
    where concert_id = target_concert and user_id = auth.uid() and status = 'pending';
  else
    delete from public.concert_participants
    where concert_id = target_concert and user_id = auth.uid() and status = 'pending';
  end if;
  if not found then raise exception 'Invitation not found' using errcode = 'P0002'; end if;
end;
$$;

-- Personal edits must preserve who explicitly invited this participant.
create or replace function public.preserve_concert_inviter()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.invited_by is not null and new.invited_by is null and old.status = 'confirmed' then
    new.invited_by := old.invited_by;
  end if;
  return new;
end;
$$;

drop trigger if exists concert_participants_preserve_inviter on public.concert_participants;
create trigger concert_participants_preserve_inviter
before update on public.concert_participants
for each row execute function public.preserve_concert_inviter();

revoke all on function public.search_concert_catalog(text, text) from public, anon;
grant execute on function public.search_concert_catalog(text, text) to authenticated;
