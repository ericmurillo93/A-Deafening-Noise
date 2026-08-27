alter function public.upsert_my_concert(jsonb) rename to upsert_my_concert_base_20260827_locked;
create or replace function public.upsert_my_concert(payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; target_id bigint; friend_id uuid;
begin
  perform public.assert_active_user();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    public.normalize_concert_value(payload->>'artist')||'|'||public.normalize_concert_value(payload->>'venue')||'|'||trim(payload->>'date'),0));
  result:=public.upsert_my_concert_base_20260827_locked(payload);
  target_id:=(result->>'concertId')::bigint;
  for friend_id in select value::uuid from jsonb_array_elements_text(coalesce(payload->'attendeeUserIds','[]'::jsonb)) loop
    if public.are_friends(auth.uid(),friend_id) then
      update public.concert_participants set status='pending',invited_by=auth.uid(),responded_at=null
      where concert_id=target_id and user_id=friend_id and status in ('interested','declined');
    end if;
  end loop;
  return result;
end;
$$;
revoke all on function public.upsert_my_concert_base_20260827_locked(jsonb) from public,anon,authenticated;
revoke all on function public.upsert_my_concert(jsonb) from public,anon;
grant execute on function public.upsert_my_concert(jsonb) to authenticated;
