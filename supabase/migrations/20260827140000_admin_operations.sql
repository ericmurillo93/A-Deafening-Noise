-- Operational telemetry for the private admin panel. Workflow writers use the
-- service role; authenticated clients can only read the aggregated admin RPC.

create table public.discovery_runs (
  github_run_id bigint primary key,
  trigger text not null default 'schedule',
  status text not null check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  suggestion_count integer not null default 0 check (suggestion_count >= 0),
  new_suggestion_count integer not null default 0 check (new_suggestion_count >= 0),
  emails_sent integer not null default 0 check (emails_sent >= 0),
  error text
);

create table public.discovery_source_runs (
  github_run_id bigint not null references public.discovery_runs(github_run_id) on delete cascade,
  source text not null,
  status text not null check (status in ('success', 'preserved', 'failed')),
  events_found integer not null default 0 check (events_found >= 0),
  suggestions_found integer not null default 0 check (suggestions_found >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  error text,
  primary key (github_run_id, source)
);

alter table public.discovery_runs enable row level security;
alter table public.discovery_source_runs enable row level security;
revoke all on public.discovery_runs, public.discovery_source_runs from public, anon, authenticated;
grant select, insert, update, delete on public.discovery_runs, public.discovery_source_runs to service_role;

create or replace function public.record_discovery_run(payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare source_item jsonb; run_id bigint := (payload->>'githubRunId')::bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  if run_id is null or coalesce(payload->>'status', '') not in ('running', 'success', 'failed') then
    raise exception 'Invalid discovery run payload' using errcode = '22023';
  end if;
  insert into public.discovery_runs(github_run_id, trigger, status, started_at, completed_at, suggestion_count, new_suggestion_count, emails_sent, error)
  values (run_id, coalesce(nullif(payload->>'trigger', ''), 'schedule'), payload->>'status',
    coalesce((payload->>'startedAt')::timestamptz, now()), (payload->>'completedAt')::timestamptz,
    coalesce((payload->>'suggestionCount')::integer, 0), coalesce((payload->>'newSuggestionCount')::integer, 0),
    coalesce((payload->>'emailsSent')::integer, 0), left(nullif(payload->>'error', ''), 1000))
  on conflict (github_run_id) do update set trigger=excluded.trigger, status=excluded.status,
    completed_at=excluded.completed_at, suggestion_count=excluded.suggestion_count,
    new_suggestion_count=excluded.new_suggestion_count, emails_sent=excluded.emails_sent, error=excluded.error;

  if jsonb_typeof(payload->'sources') = 'array' then
    delete from public.discovery_source_runs where github_run_id = run_id;
    for source_item in select value from jsonb_array_elements(payload->'sources') loop
      insert into public.discovery_source_runs(github_run_id, source, status, events_found, suggestions_found, duration_ms, error)
      values (run_id, left(source_item->>'source', 200), source_item->>'status',
        coalesce((source_item->>'eventsFound')::integer, 0), coalesce((source_item->>'suggestionsFound')::integer, 0),
        coalesce((source_item->>'durationMs')::integer, 0), left(nullif(source_item->>'error', ''), 1000));
    end loop;
  end if;
  delete from public.discovery_runs where started_at < now() - interval '90 days';
end;
$$;

create or replace function public.get_admin_operations()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare catalog jsonb; latest public.discovery_runs;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and account_status = 'active') then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select suggestions into catalog from public.concert_suggestion_catalog where singleton;
  select * into latest from public.discovery_runs order by started_at desc limit 1;
  return jsonb_build_object(
    'latestRun', case when latest.github_run_id is null then null else jsonb_build_object(
      'githubRunId', latest.github_run_id, 'trigger', latest.trigger, 'status', latest.status,
      'startedAt', latest.started_at, 'completedAt', latest.completed_at,
      'suggestionCount', latest.suggestion_count, 'newSuggestionCount', latest.new_suggestion_count,
      'emailsSent', latest.emails_sent, 'error', latest.error,
      'sources', coalesce((select jsonb_agg(jsonb_build_object('source', s.source, 'status', s.status,
        'eventsFound', s.events_found, 'suggestionsFound', s.suggestions_found, 'durationMs', s.duration_ms,
        'error', s.error) order by s.source) from public.discovery_source_runs s where s.github_run_id=latest.github_run_id), '[]'::jsonb)
    ) end,
    'suggestionsBySource', coalesce((select jsonb_agg(jsonb_build_object('source', grouped.source, 'count', grouped.amount) order by grouped.amount desc, grouped.source)
      from (select coalesce(item->>'source', 'Unknown') source, count(*) amount from jsonb_array_elements(coalesce(catalog, '[]'::jsonb)) item group by 1) grouped), '[]'::jsonb),
    'accounts', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'active30Days', (select count(*) from auth.users where last_sign_in_at >= now() - interval '30 days'),
      'blocked', (select count(*) from public.profiles where account_status='blocked'),
      'spotifyConnected', (select count(*) from public.spotify_connections),
      'spotifyReconnect', (select count(*) from public.spotify_connections where reauthorization_required)
    ),
    'duplicates', jsonb_build_object(
      'count', (select count(*) from (select 1 from public.concerts group by upper(trim(artist)), upper(trim(venue)), concert_date having count(*) > 1) duplicate_groups),
      'items', coalesce((select jsonb_agg(jsonb_build_object('artist', artist, 'venue', venue, 'date', concert_date, 'count', amount) order by amount desc, artist)
        from (select min(artist) artist, min(venue) venue, concert_date, count(*) amount from public.concerts group by upper(trim(artist)), upper(trim(venue)), concert_date having count(*) > 1 order by count(*) desc, min(artist) limit 10) duplicate_rows), '[]'::jsonb)
    ),
    'usage', jsonb_build_object(
      'supabaseBytes', pg_database_size(current_database()),
      'githubMinutes30Days', coalesce((select ceil(sum(extract(epoch from (completed_at-started_at))) / 60.0) from public.discovery_runs where completed_at is not null and started_at >= now() - interval '30 days'), 0),
      'resendAccepted30Days', coalesce((select sum(emails_sent) from public.discovery_runs where started_at >= now() - interval '30 days'), 0)
    )
  );
end;
$$;

revoke all on function public.record_discovery_run(jsonb), public.get_admin_operations() from public, anon, authenticated;
grant execute on function public.record_discovery_run(jsonb) to service_role;
grant execute on function public.get_admin_operations() to authenticated;
