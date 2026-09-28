-- Validate the shared write boundary, not only the import preview in React.
alter function public.upsert_my_concert(jsonb) rename to upsert_my_concert_base_20260928;
create or replace function public.upsert_my_concert(payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare raw_date text:=payload->>'date'; part text; parsed date; first_date date;
begin
  perform public.assert_active_user();
  if raw_date is null or raw_date !~ '^\d{2}/\d{2}/\d{4}( - \d{2}/\d{2}/\d{4})?$' then
    raise exception 'Use DD/MM/YYYY' using errcode='22023';
  end if;
  foreach part in array string_to_array(raw_date,' - ') loop
    parsed:=to_date(part,'DD/MM/YYYY');
    if to_char(parsed,'DD/MM/YYYY')<>part or parsed<first_date then
      raise exception 'Invalid concert date or date range' using errcode='22023';
    end if;
    first_date:=parsed;
  end loop;
  return public.upsert_my_concert_base_20260928(payload);
end;
$$;
revoke all on function public.upsert_my_concert_base_20260928(jsonb) from public,anon,authenticated;
revoke all on function public.upsert_my_concert(jsonb) from public,anon;
grant execute on function public.upsert_my_concert(jsonb) to authenticated;
