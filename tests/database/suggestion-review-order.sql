begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-4000-a000-000000000091','review-order@example.invalid','{"display_name":"Review Audit"}');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000091',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.save_dismissed_suggestions(array['first']);
reset role;
update public.user_dismissed_suggestions set created_at='2025-01-01T00:00:00Z' where user_id='00000000-0000-4000-a000-000000000091';
set local role authenticated;
do $$ declare snapshot jsonb; concert jsonb;
begin
  perform public.save_dismissed_suggestions(array['first','second']);
  snapshot:=public.get_my_archive_snapshot();
  assert (snapshot#>>'{suggestionReviewDates,dismissed,first}')::timestamptz='2025-01-01T00:00:00Z'::timestamptz, 'Existing review date changed';
  assert (snapshot#>>'{suggestionReviewDates,dismissed,second}')::timestamptz > '2025-01-01T00:00:00Z'::timestamptz;
  perform public.save_dismissed_suggestions(array['second']);
  perform public.save_dismissed_suggestions(array['first','second']);
  snapshot:=public.get_my_archive_snapshot();
  assert (snapshot#>>'{suggestionReviewDates,dismissed,first}')::timestamptz > '2025-01-01T00:00:00Z'::timestamptz, 'Re-review date not updated';
  concert:=public.upsert_my_concert('{"artist":"REVIEW AUDIT","venue":"AUDIT VENUE","city":"Barcelona","country":"ES","date":"01/01/2030","bought":false}');
  assert public.get_my_archive_snapshot()->'suggestionReviewDates'->'concerts' ? (concert->>'concertId'), 'Interested review date missing';
end $$;
rollback;
