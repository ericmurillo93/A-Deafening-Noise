create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text := trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  username_base text := trim(both '-' from lower(regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[^a-z0-9]+', '-', 'g')));
begin
  insert into public.profiles (id, email, display_name, username)
  values (
    new.id,
    lower(new.email),
    left(coalesce(nullif(requested_name, ''), 'Concert fan'), 80),
    coalesce(nullif(username_base, ''), 'user') || '-' || left(replace(new.id::text, '-', ''), 12)
  );
  return new;
end;
$$;

revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;
