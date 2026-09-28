-- Replace Eric's two-day Be Prog! 2026 pass with the ten performances he
-- attended. As with his previous Be Prog! history, Papa attended them too.

create temporary table be_prog_2026 (
  concert_date text not null,
  artist text not null,
  setlist_id text not null,
  primary key (concert_date, artist)
) on commit drop;

insert into be_prog_2026(concert_date, artist, setlist_id) values
  ('25/09/2026', 'AFTER LAPSE', 'b4a4932'),
  ('25/09/2026', 'AGENT FRESCO', '34a4933'),
  ('25/09/2026', 'EINAR SOLBERG', 'b4a493e'),
  ('25/09/2026', 'THE DEAR HUNTER', '1b46f150'),
  ('25/09/2026', 'THE OCEAN', '34a493f'),
  ('26/09/2026', 'SERAPIS PROJECT', '134a4935'),
  ('26/09/2026', 'IOTUNN', 'b4a4936'),
  ('26/09/2026', 'RENDEZVOUS POINT', '1b4a4930'),
  ('26/09/2026', 'GREEN CARNATION', '134a4931'),
  ('26/09/2026', 'SOEN', '134a4939');

delete from public.concert_participants cp
using public.concerts c, public.profiles p
where cp.concert_id = c.id
  and cp.user_id = p.id
  and c.normalized_artist = public.normalize_concert_value('BE PROG! MY FRIEND')
  and c.normalized_venue = public.normalize_concert_value('BE PROG! MY FRIEND')
  and c.concert_date = '25/09/2026 - 26/09/2026'
  and lower(p.email) in ('eric.murillo93@gmail.com', 'murillodma@gmail.com');

delete from public.concerts c
where c.normalized_artist = public.normalize_concert_value('BE PROG! MY FRIEND')
  and c.normalized_venue = public.normalize_concert_value('BE PROG! MY FRIEND')
  and c.concert_date = '25/09/2026 - 26/09/2026'
  and not exists (select 1 from public.concert_participants cp where cp.concert_id = c.id);

insert into public.concerts(
  artist, venue, city, country, concert_date, bought, setlist_id, created_by,
  normalized_artist, normalized_venue, start_date, metadata_updated_at
)
select lineup.artist, 'BE PROG! MY FRIEND', 'Barcelona', 'ES', lineup.concert_date,
  true, lineup.setlist_id, eric.id, public.normalize_concert_value(lineup.artist),
  public.normalize_concert_value('BE PROG! MY FRIEND'),
  to_date(lineup.concert_date, 'DD/MM/YYYY'), now()
from be_prog_2026 lineup
join public.profiles eric on lower(eric.email) = 'eric.murillo93@gmail.com'
on conflict (normalized_artist, normalized_venue, concert_date) do update set
  setlist_id = excluded.setlist_id,
  city = excluded.city,
  country = excluded.country,
  start_date = excluded.start_date,
  metadata_updated_at = excluded.metadata_updated_at;

insert into public.concert_artists(concert_id, artist, normalized_artist, billing_order, role)
select c.id, c.artist, c.normalized_artist, 0, 'headliner'
from public.concerts c
join be_prog_2026 lineup
  on c.normalized_artist = public.normalize_concert_value(lineup.artist)
 and c.normalized_venue = public.normalize_concert_value('BE PROG! MY FRIEND')
 and c.concert_date = lineup.concert_date
on conflict (concert_id, normalized_artist) do nothing;

insert into public.concert_participants(
  concert_id, user_id, bought, status, invited_by, guest_attendees, confirmed_at, visible_in_archive
)
select c.id, attendee.id, true, 'confirmed',
  case when attendee.id = eric.id then null else eric.id end,
  '{}', now(), true
from be_prog_2026 lineup
join public.concerts c
  on c.normalized_artist = public.normalize_concert_value(lineup.artist)
 and c.normalized_venue = public.normalize_concert_value('BE PROG! MY FRIEND')
 and c.concert_date = lineup.concert_date
join public.profiles eric on lower(eric.email) = 'eric.murillo93@gmail.com'
join public.profiles attendee on lower(attendee.email) in ('eric.murillo93@gmail.com', 'murillodma@gmail.com')
on conflict (concert_id, user_id) do update set
  bought = true,
  status = 'confirmed',
  invited_by = excluded.invited_by,
  guest_attendees = '{}',
  confirmed_at = coalesce(public.concert_participants.confirmed_at, excluded.confirmed_at),
  visible_in_archive = true;
