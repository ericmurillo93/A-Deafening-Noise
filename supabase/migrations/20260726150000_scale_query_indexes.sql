-- Query shapes used by the authenticated archive, social graph and discovery.
-- These indexes keep work proportional to one user's data as the global tables grow.

create extension if not exists pg_trgm with schema extensions;

create index if not exists concert_participants_user_visible_idx
  on public.concert_participants(user_id, status, visible_in_archive, concert_id);

create index if not exists concert_participants_concert_status_idx
  on public.concert_participants(concert_id, status, user_id);

create index if not exists friendships_requester_status_idx
  on public.friendships(requester_id, status, updated_at desc);

create index if not exists friendships_addressee_status_updated_idx
  on public.friendships(addressee_id, status, updated_at desc);

create index if not exists profiles_username_search_idx
  on public.profiles using gin (lower(username) extensions.gin_trgm_ops)
  where discoverable and account_status = 'active';

create index if not exists profiles_display_name_search_idx
  on public.profiles using gin (lower(display_name) extensions.gin_trgm_ops)
  where discoverable and account_status = 'active';
