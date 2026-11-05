-- The browser requests deletion; a service worker cleans Storage before Auth.
create table public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease uuid,
  last_error text
);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public,anon,authenticated;
grant select on public.account_deletion_requests to service_role;

-- An existing JWT must not upload new avatars after deletion has been requested.
alter policy "Users upload their own avatar" on storage.objects
  with check(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text and public.get_my_preferences() is not null);
alter policy "Users update their own avatar" on storage.objects
  using(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text and public.get_my_preferences() is not null)
  with check(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text and public.get_my_preferences() is not null);

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.account_deletion_requests where user_id=auth.uid()) then return;end if;
  perform public.assert_active_user();
  insert into public.account_deletion_requests(user_id) values(auth.uid()) on conflict do nothing;
  update public.profiles set account_status='blocked' where id=auth.uid();
end;
$$;

create function public.claim_account_deletions() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501';end if;
  with due as (
    select user_id from public.account_deletion_requests where next_attempt_at<=now()
    order by requested_at limit 10 for update skip locked
  ), claimed as (
    update public.account_deletion_requests r set lease=gen_random_uuid(),attempts=attempts+1,next_attempt_at=now()+interval '15 minutes'
    from due where r.user_id=due.user_id returning r.user_id,r.lease
  ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
  return result;
end;
$$;

create function public.complete_account_deletion(target_user uuid,claim_lease uuid,succeeded boolean,error_message text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service access required' using errcode='42501';end if;
  perform 1 from public.account_deletion_requests where user_id=target_user and lease=claim_lease for update;
  if not found then raise exception 'Deletion lease expired' using errcode='40001';end if;
  if succeeded then
    -- Spotify's existing delete trigger also removes its Vault secret.
    delete from auth.users where id=target_user;
  else
    update public.account_deletion_requests set last_error=left(error_message,300),next_attempt_at=now()+interval '1 hour'
      where user_id=target_user;
  end if;
end;
$$;
revoke all on function public.claim_account_deletions(),public.complete_account_deletion(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_account_deletions(),public.complete_account_deletion(uuid,uuid,boolean,text) to service_role;
