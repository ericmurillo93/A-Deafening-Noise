create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null check (display_name in ('Eric', 'Saray', 'Papa')),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.concerts (
  id bigint generated always as identity primary key,
  artist text not null,
  venue text not null default '',
  concert_date text not null,
  bought boolean not null default true,
  setlist_id text,
  ticket_url text,
  guest_attendees text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.concert_participants (
  concert_id bigint not null references public.concerts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (concert_id, user_id)
);

create table public.dismissed_suggestions (
  suggestion_key text primary key,
  created_at timestamptz not null default now()
);

create index concert_participants_user_id_idx on public.concert_participants(user_id);
create index concerts_concert_date_idx on public.concerts(concert_date);

alter table public.profiles enable row level security;
alter table public.concerts enable row level security;
alter table public.concert_participants enable row level security;
alter table public.dismissed_suggestions enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.concerts from anon, authenticated;
revoke all on public.concert_participants from anon, authenticated;
revoke all on public.dismissed_suggestions from anon, authenticated;

insert into public.profiles (id, email, display_name, is_admin)
select id, lower(email),
  case lower(email)
    when 'eric.murillo93@gmail.com' then 'Eric'
    when 'rpsaray@gmail.com' then 'Saray'
    when 'murillodma@gmail.com' then 'Papa'
  end,
  lower(email) = 'eric.murillo93@gmail.com'
from auth.users
where lower(email) in (
  'eric.murillo93@gmail.com',
  'rpsaray@gmail.com',
  'murillodma@gmail.com'
)
on conflict (id) do update set
  email = excluded.email,
  display_name = excluded.display_name,
  is_admin = excluded.is_admin;

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select p from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.get_concert_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller public.profiles;
  result jsonb;
begin
  select * into caller from public.profiles where id = auth.uid();
  if caller.id is null then
    raise exception 'Archive profile not configured' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'concerts', coalesce(jsonb_agg(concert_json order by concert_id), '[]'::jsonb),
    'dismissedSuggestions', case
      when caller.is_admin then coalesce(
        (select jsonb_agg(ds.suggestion_key order by ds.suggestion_key) from public.dismissed_suggestions ds),
        '[]'::jsonb
      )
      else '[]'::jsonb
    end
  ) into result
  from (
    select c.id as concert_id,
      jsonb_strip_nulls(jsonb_build_object(
        'artist', c.artist,
        'venue', c.venue,
        'date', c.concert_date,
        'bought', c.bought,
        'setlistId', c.setlist_id,
        'ticketUrl', c.ticket_url,
        'attendees', case when cardinality(all_attendees) > 0 then to_jsonb(all_attendees) end
      )) as concert_json
    from public.concerts c
    cross join lateral (
      select array_cat(
        coalesce(array_agg(p.display_name order by p.display_name)
          filter (where p.id <> caller.id), '{}'),
        c.guest_attendees
      ) as all_attendees
      from public.concert_participants cp
      join public.profiles p on p.id = cp.user_id
      where cp.concert_id = c.id
    ) attendees
    where exists (
      select 1 from public.concert_participants own
      where own.concert_id = c.id and own.user_id = caller.id
    )
  ) visible;

  return result;
end;
$$;

create or replace function public.replace_concert_data(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.profiles;
  concert jsonb;
  attendee text;
  inserted_id bigint;
  matched_user uuid;
  guests text[];
begin
  select * into caller from public.profiles where id = auth.uid();
  if caller.id is null or not caller.is_admin then
    raise exception 'Only Eric can update the archive' using errcode = '42501';
  end if;
  if jsonb_typeof(payload->'concerts') <> 'array' then
    raise exception 'Invalid concerts payload' using errcode = '22023';
  end if;

  delete from public.concert_participants;
  delete from public.concerts;
  delete from public.dismissed_suggestions;

  for concert in select value from jsonb_array_elements(payload->'concerts') loop
    guests := '{}';
    insert into public.concerts (
      artist, venue, concert_date, bought, setlist_id, ticket_url, guest_attendees
    ) values (
      trim(concert->>'artist'),
      coalesce(trim(concert->>'venue'), ''),
      trim(concert->>'date'),
      coalesce((concert->>'bought')::boolean, true),
      nullif(trim(concert->>'setlistId'), ''),
      nullif(trim(concert->>'ticketUrl'), ''),
      '{}'
    ) returning id into inserted_id;

    insert into public.concert_participants (concert_id, user_id)
    values (inserted_id, caller.id);

    for attendee in
      select value from jsonb_array_elements_text(coalesce(concert->'attendees', '[]'::jsonb))
    loop
      select id into matched_user
      from public.profiles
      where lower(display_name) = lower(trim(attendee));

      if matched_user is not null then
        insert into public.concert_participants (concert_id, user_id)
        values (inserted_id, matched_user)
        on conflict do nothing;
      elsif trim(attendee) <> '' then
        guests := array_append(guests, trim(attendee));
      end if;
      matched_user := null;
    end loop;

    if cardinality(guests) > 0 then
      update public.concerts set guest_attendees = guests where id = inserted_id;
    end if;
  end loop;

  insert into public.dismissed_suggestions (suggestion_key)
  select distinct value
  from jsonb_array_elements_text(coalesce(payload->'dismissedSuggestions', '[]'::jsonb));
end;
$$;

revoke all on function public.current_profile() from public, anon;
revoke all on function public.get_concert_data() from public, anon;
revoke all on function public.replace_concert_data(jsonb) from public, anon;
grant execute on function public.current_profile() to authenticated;
grant execute on function public.get_concert_data() to authenticated;
grant execute on function public.replace_concert_data(jsonb) to authenticated;
