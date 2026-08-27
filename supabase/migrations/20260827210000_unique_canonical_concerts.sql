-- Staging contains no duplicate canonical triples. Enforce that invariant so
-- concurrent users cannot create the same event twice.
create unique index concerts_canonical_uidx
  on public.concerts(normalized_artist,normalized_venue,concert_date);
