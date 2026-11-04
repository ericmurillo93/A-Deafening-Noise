-- Public Spotify artist metadata, independent of personal suggestion decisions.
create table public.spotify_artist_artwork (
  normalized_artist text primary key,
  artist_name text not null,
  image_url text not null check (length(image_url)<=2000 and image_url ~ '^https://(i\.scdn\.co/image/|image-cdn-ak\.spotifycdn\.com/)'),
  updated_at timestamptz not null default now()
);
alter table public.spotify_artist_artwork enable row level security;
revoke all on public.spotify_artist_artwork from public,anon,authenticated;
grant select on public.spotify_artist_artwork to service_role;

create function public.cache_spotify_artwork() returns trigger
language plpgsql security definer set search_path='' as $$
declare items jsonb;
begin
  if tg_table_name='concert_suggestion_catalog' then items:=new.suggestions;
  else items:=jsonb_build_array(jsonb_build_object('artist',new.artist_name,'imageUrl',new.image_url)); end if;
  insert into public.spotify_artist_artwork(normalized_artist,artist_name,image_url)
  select distinct on (public.normalize_concert_value(item->>'artist'))
    public.normalize_concert_value(item->>'artist'),item->>'artist',item->>'imageUrl'
  from jsonb_array_elements(items) item
  where nullif(trim(item->>'artist'),'') is not null and length(item->>'imageUrl')<=2000
    and item->>'imageUrl' ~ '^https://(i\.scdn\.co/image/|image-cdn-ak\.spotifycdn\.com/)'
  on conflict(normalized_artist) do update set artist_name=excluded.artist_name,image_url=excluded.image_url,updated_at=now();
  return new;
end;
$$;

create or replace function public.get_my_archive_snapshot()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_set(data,'{profile}',coalesce(data->'profile','{}'::jsonb)||public.get_my_preferences())
    ||jsonb_build_object('dismissedSuggestions',public.get_my_dismissed_suggestions(),'artistImages',public.get_my_artist_images())
  from (select public.get_app_data() data) archive;
$$;
revoke all on function public.cache_spotify_artwork() from public,anon,authenticated;
create trigger cache_suggestion_spotify_artwork after insert or update of suggestions on public.concert_suggestion_catalog
for each row execute function public.cache_spotify_artwork();
create trigger cache_saved_spotify_artwork after insert or update of image_url on public.artist_images
for each row execute function public.cache_spotify_artwork();
create trigger cache_listened_spotify_artwork after insert or update of image_url on public.user_listened_artists
for each row execute function public.cache_spotify_artwork();

insert into public.spotify_artist_artwork(normalized_artist,artist_name,image_url)
select distinct on (public.normalize_concert_value(artist)) public.normalize_concert_value(artist),artist,image_url
from (
  select artist_name artist,image_url from public.artist_images
  union all select artist_name,image_url from public.user_listened_artists
  union all select item->>'artist',item->>'imageUrl' from public.concert_suggestion_catalog cross join lateral jsonb_array_elements(suggestions) item
) images
where nullif(trim(artist),'') is not null and length(image_url)<=2000
  and image_url ~ '^https://(i\.scdn\.co/image/|image-cdn-ak\.spotifycdn\.com/)'
on conflict do nothing;

create or replace function public.get_my_artist_images() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform public.assert_active_user();
  return coalesce((select jsonb_agg(jsonb_build_object('artist',a.artist_name,'imageUrl',a.image_url) order by a.artist_name)
    from public.spotify_artist_artwork a where a.normalized_artist in (
      select c.normalized_artist from public.concert_participants cp join public.concerts c on c.id=cp.concert_id
        where cp.user_id=auth.uid() and cp.status='confirmed'
      union select public.normalize_concert_value(l.artist_name) from public.user_listened_artists l where l.user_id=auth.uid()
      union select public.normalize_concert_value(b.artist) from public.bucket_list_artists b where b.user_id=auth.uid()
    )
  ),'[]'::jsonb);
end;
$$;
