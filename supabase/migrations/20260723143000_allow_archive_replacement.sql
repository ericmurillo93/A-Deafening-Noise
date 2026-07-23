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

  delete from public.concert_participants where true;
  delete from public.concerts where true;
  delete from public.dismissed_suggestions where true;

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

revoke all on function public.replace_concert_data(jsonb) from public, anon;
grant execute on function public.replace_concert_data(jsonb) to authenticated;
