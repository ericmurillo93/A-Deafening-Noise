-- A single row per user/action, shared by every serverless instance.
create table public.provider_request_quotas (
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('setlist', 'catalog')),
  minute_start timestamptz not null default now(),
  minute_count integer not null default 0,
  day_start date not null default current_date,
  day_count integer not null default 0,
  primary key (user_id, action)
);
alter table public.provider_request_quotas enable row level security;
revoke all on public.provider_request_quotas from anon, authenticated;

create or replace function public.consume_provider_quota(requested_action text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare caller public.profiles; minute_limit integer; consumed integer;
begin
  caller := public.assert_active_user();
  if requested_action not in ('setlist','catalog') then raise exception 'Unknown action'; end if;
  minute_limit := case when requested_action='setlist' then 60 else 30 end;
  insert into public.provider_request_quotas(user_id,action) values(caller.id,requested_action)
    on conflict do nothing;
  update public.provider_request_quotas set
    minute_count=case when minute_start <= now()-interval '1 minute' then 1 else minute_count+1 end,
    minute_start=case when minute_start <= now()-interval '1 minute' then now() else minute_start end,
    day_count=case when day_start < current_date then 1 else day_count+1 end,
    day_start=current_date
  where user_id=caller.id and action=requested_action
    and (minute_start <= now()-interval '1 minute' or minute_count < minute_limit)
    and (day_start < current_date or day_count < 300);
  get diagnostics consumed = row_count;
  return consumed=1;
end;
$$;
revoke all on function public.consume_provider_quota(text) from public,anon;
grant execute on function public.consume_provider_quota(text) to authenticated;
