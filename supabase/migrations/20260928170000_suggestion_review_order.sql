-- Preserve the original decision dates when saving unrelated dismissals.
create or replace function public.save_dismissed_suggestions(keys text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_active_user();
  delete from public.user_dismissed_suggestions
    where user_id=auth.uid() and not(suggestion_key=any(coalesce(keys,'{}'::text[])));
  insert into public.user_dismissed_suggestions(user_id,suggestion_key)
    select auth.uid(),key from (select distinct unnest(coalesce(keys,'{}'::text[])) as key) requested
    where nullif(trim(key),'') is not null
    on conflict(user_id,suggestion_key) do nothing;
end;
$$;

create or replace function public.get_my_archive_snapshot()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_set(data,'{profile}',coalesce(data->'profile','{}'::jsonb)||public.get_my_preferences())
    ||jsonb_build_object('dismissedSuggestions',public.get_my_dismissed_suggestions(),
      'suggestionReviewDates',jsonb_build_object(
        'dismissed',coalesce((select jsonb_object_agg(suggestion_key,created_at)
          from public.user_dismissed_suggestions where user_id=auth.uid()),'{}'::jsonb),
        'concerts',coalesce((select jsonb_object_agg(concert_id::text,created_at)
          from public.concert_participants where user_id=auth.uid() and status='confirmed' and visible_in_archive),'{}'::jsonb)))
  from (select public.get_app_data() data) archive;
$$;
revoke all on function public.save_dismissed_suggestions(text[]),public.get_my_archive_snapshot() from public,anon;
grant execute on function public.save_dismissed_suggestions(text[]),public.get_my_archive_snapshot() to authenticated;
