-- Server-side maintenance uses a Supabase secret key, which authenticates as
-- service_role and bypasses RLS but still requires PostgreSQL object grants.
-- Browser roles remain revoked and continue to access data only through RPCs.

grant select, insert, update, delete on table
  public.profiles,
  public.concerts,
  public.concert_participants,
  public.dismissed_suggestions,
  public.friendships,
  public.notifications
to service_role;

grant usage, select on all sequences in schema public to service_role;
