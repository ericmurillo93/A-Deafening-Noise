create or replace function public.get_active_discovery_countries()
returns text[] language plpgsql stable security definer set search_path='' as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service access required' using errcode='42501'; end if;
  return coalesce(array(
    select distinct selected.code
    from public.profiles profile
    cross join unnest(profile.discovery_countries) as selected(code)
    where profile.account_status='active'
    order by selected.code
  ),'{}');
end $$;
