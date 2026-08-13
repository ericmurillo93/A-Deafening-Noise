create table public.user_dismissed_suggestions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  suggestion_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, suggestion_key)
);

alter table public.user_dismissed_suggestions enable row level security;
revoke all on public.user_dismissed_suggestions from anon, authenticated;

insert into public.user_dismissed_suggestions(user_id, suggestion_key)
select p.id, d.suggestion_key from public.profiles p cross join public.dismissed_suggestions d
where p.role = 'admin'
on conflict do nothing;

create or replace function public.get_my_dismissed_suggestions()
returns text[] language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_active_user();
  return coalesce(array(select suggestion_key from public.user_dismissed_suggestions where user_id = auth.uid() order by suggestion_key), '{}'::text[]);
end;
$$;

create or replace function public.save_dismissed_suggestions(keys text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_active_user();
  delete from public.user_dismissed_suggestions where user_id = auth.uid();
  insert into public.user_dismissed_suggestions(user_id, suggestion_key)
  select auth.uid(), key from (select distinct unnest(coalesce(keys, '{}'::text[])) as key) values_to_save
  where nullif(trim(key), '') is not null;
end;
$$;

revoke all on function public.get_my_dismissed_suggestions() from public, anon;
revoke all on function public.save_dismissed_suggestions(text[]) from public, anon;
grant execute on function public.get_my_dismissed_suggestions() to authenticated;
grant execute on function public.save_dismissed_suggestions(text[]) to authenticated;
