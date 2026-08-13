-- Harden the RPC-only browser boundary and remove obsolete compatibility access.

revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon;
revoke usage, select on all sequences in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public revoke usage, select on sequences from anon, authenticated;

-- These pre-social RPCs are no longer used by any client. In particular,
-- replace_concert_data could replace an entire archive and must not remain
-- available to ordinary authenticated accounts.
revoke execute on function public.current_profile() from authenticated;
revoke execute on function public.replace_concert_data(jsonb) from authenticated;
revoke execute on function public.find_concert_matches(text, text, text) from authenticated;

-- The admin-only Netlify backup flow still uses this personal JSON export.
create or replace function public.get_concert_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller public.profiles;
begin
  caller := public.assert_active_user();
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

create or replace function public.search_profiles(search_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform public.assert_active_user();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', candidate.id,
    'displayName', candidate.display_name,
    'username', candidate.username,
    'relationship', coalesce(friendship.status, 'none'),
    'direction', case when friendship.requester_id = auth.uid() then 'outgoing'
      when friendship.addressee_id = auth.uid() then 'incoming' end
  ) order by candidate.display_name), '[]'::jsonb)
  into result
  from (
    select p.*
    from public.profiles p
    where p.id <> auth.uid()
      and p.discoverable
      and p.account_status = 'active'
      and length(trim(coalesce(search_query, ''))) between 2 and 80
      and (p.username ilike '%' || trim(search_query) || '%'
        or p.display_name ilike '%' || trim(search_query) || '%')
    order by p.display_name
    limit 20
  ) candidate
  left join public.friendships friendship on
    (friendship.requester_id = auth.uid() and friendship.addressee_id = candidate.id)
    or (friendship.addressee_id = auth.uid() and friendship.requester_id = candidate.id);
  return result;
end;
$$;

create or replace function public.search_concert_catalog(search_field text, search_value text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform public.assert_active_user();
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'concertId', candidate.id,
    'artist', candidate.artist,
    'venue', candidate.venue,
    'date', candidate.concert_date,
    'ticketUrl', candidate.ticket_url
  )) order by candidate.concert_date desc, candidate.artist), '[]'::jsonb)
  into result
  from (
    select c.*
    from public.concerts c
    where length(trim(coalesce(search_value, ''))) between 2 and 100
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
  return result;
end;
$$;

create or replace function public.get_my_spotify_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform public.assert_active_user();
  select case when sc.user_id is null then jsonb_build_object('connected', false)
    else jsonb_build_object(
      'connected', true,
      'displayName', sc.display_name,
      'syncedAt', sc.synced_at,
      'artistCount', (select count(*) from public.user_listened_artists ula where ula.user_id = auth.uid()),
      'needsReauthorization', sc.reauthorization_required
    ) end
  into result
  from (select auth.uid() as user_id) caller
  left join public.spotify_connections sc on sc.user_id = caller.user_id;
  return result;
end;
$$;

grant execute on function public.search_profiles(text) to authenticated;
grant execute on function public.search_concert_catalog(text, text) to authenticated;
grant execute on function public.get_my_spotify_status() to authenticated;
grant execute on function public.get_concert_data() to authenticated;
