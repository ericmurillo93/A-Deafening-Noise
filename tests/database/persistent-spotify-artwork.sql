begin;
insert into auth.users(id,email,raw_user_meta_data) values
('00000000-0000-4000-a000-000000000094','artwork-a@example.invalid','{"display_name":"Artwork A"}'),
('00000000-0000-4000-a000-000000000095','artwork-b@example.invalid','{"display_name":"Artwork B"}');
insert into public.concerts(artist,venue,city,country,concert_date,created_by)
values('ARTWORK AUDIT BAND','ARTWORK VENUE','Barcelona','ES','01/01/2030','00000000-0000-4000-a000-000000000094');
insert into public.concert_participants(concert_id,user_id,bought,status)
select id,'00000000-0000-4000-a000-000000000094',true,'confirmed' from public.concerts where artist='ARTWORK AUDIT BAND';
insert into public.concert_suggestion_catalog(singleton,generated_at,suggestions)
values(true,now(),'[{"artist":"ARTWORK AUDIT BAND","imageUrl":"https://i.scdn.co/image/artwork-audit"},{"artist":"ARTWORK WRONG SOURCE","imageUrl":"https://example.invalid/poster.jpg"}]')
on conflict(singleton) do update set suggestions=excluded.suggestions;
update public.concert_suggestion_catalog set suggestions='[]';
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000094',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$begin
  assert public.get_my_artist_images() @> '[{"artist":"ARTWORK AUDIT BAND","imageUrl":"https://i.scdn.co/image/artwork-audit"}]','Artwork disappeared with catalog removal';
  assert public.get_my_archive_snapshot()->'artistImages' @> '[{"artist":"ARTWORK AUDIT BAND"}]','Save response omits retained artwork';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000095',true);
do $$begin
  assert not (public.get_my_artist_images() @> '[{"artist":"ARTWORK AUDIT BAND"}]'),'Unrelated archive artist exposed';
  begin perform count(*) from public.spotify_artist_artwork;raise exception 'Direct cache access allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
  assert not exists(select 1 from public.spotify_artist_artwork where normalized_artist='artwork wrong source'),'Promoter poster cached as Spotify artwork';
end $$;
rollback;
