-- Catalog autocomplete exposes event metadata only. The superseded exact-match
-- endpoint included an attendance count and is no longer available to clients.
revoke all on function public.find_concert_matches(text, text, text) from authenticated;
