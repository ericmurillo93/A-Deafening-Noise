create table public.concert_suggestion_catalog (
  singleton boolean primary key default true check (singleton),
  generated_at timestamptz not null,
  suggestions jsonb not null default '[]'::jsonb check (jsonb_typeof(suggestions) = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.concert_suggestion_catalog enable row level security;
revoke all on public.concert_suggestion_catalog from public, anon, authenticated;
grant select, insert, update on public.concert_suggestion_catalog to service_role;

create or replace function public.get_concert_suggestions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare catalog public.concert_suggestion_catalog;
begin
  if auth.role() <> 'service_role' then perform public.assert_active_user(); end if;
  select * into catalog from public.concert_suggestion_catalog where singleton;
  return jsonb_build_object(
    'generatedAt', case when catalog.singleton then to_char(catalog.generated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
    'suggestions', coalesce(catalog.suggestions, '[]'::jsonb)
  );
end;
$$;

create or replace function public.replace_concert_suggestions(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service access required' using errcode = '42501'; end if;
  if jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(payload->'suggestions') <> 'array'
    or jsonb_array_length(payload->'suggestions') > 10000
    or nullif(payload->>'generatedAt', '') is null then
    raise exception 'Invalid suggestion catalog' using errcode = '22023';
  end if;
  insert into public.concert_suggestion_catalog(singleton, generated_at, suggestions, updated_at)
  values (true, (payload->>'generatedAt')::timestamptz, payload->'suggestions', now())
  on conflict (singleton) do update set generated_at = excluded.generated_at, suggestions = excluded.suggestions, updated_at = now();
end;
$$;

create or replace function public.rotate_spotify_refresh_token(target_user uuid, rotated_refresh_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare secret_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Service access required' using errcode = '42501'; end if;
  if nullif(rotated_refresh_token, '') is null or length(rotated_refresh_token) > 2000 then raise exception 'Invalid refresh token' using errcode = '22023'; end if;
  select refresh_secret_id into secret_id from public.spotify_connections where user_id = target_user;
  if secret_id is null then raise exception 'Spotify connection not found' using errcode = 'P0002'; end if;
  perform vault.update_secret(secret_id, rotated_refresh_token);
end;
$$;

revoke all on function public.get_concert_suggestions() from public, anon;
revoke all on function public.replace_concert_suggestions(jsonb) from public, anon, authenticated;
revoke all on function public.rotate_spotify_refresh_token(uuid,text) from public, anon, authenticated;
grant execute on function public.get_concert_suggestions() to authenticated, service_role;
grant execute on function public.replace_concert_suggestions(jsonb) to service_role;
grant execute on function public.rotate_spotify_refresh_token(uuid,text) to service_role;
