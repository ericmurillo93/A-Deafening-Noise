-- Artist and venue names are canonical uppercase labels across every client.

update public.concerts
set artist = upper(trim(artist)),
    venue = upper(trim(venue));

create or replace function public.set_concert_normalized_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.artist := upper(trim(coalesce(new.artist, '')));
  new.venue := upper(trim(coalesce(new.venue, '')));
  new.normalized_artist := lower(regexp_replace(new.artist, '[^[:alnum:]]+', ' ', 'g'));
  new.normalized_venue := lower(regexp_replace(new.venue, '[^[:alnum:]]+', ' ', 'g'));
  return new;
end;
$$;
