-- Preserve optional metadata from the removed event without overwriting the
-- administrator's chosen event. Applied migrations above remain immutable.
do $$
declare definition text; original text;
begin
 definition:=pg_get_functiondef('public.admin_merge_concerts(bigint,bigint)'::regprocedure);
 original:='update public.concerts set ticket_url=coalesce(a.ticket_url,b.ticket_url),setlist_id=coalesce(a.setlist_id,b.setlist_id),festival=coalesce(nullif(a.festival,''''),b.festival) where id=keep_id;';
 if strpos(definition,original)=0 then raise exception 'Unexpected merge definition';end if;
 definition:=replace(definition,original,$replacement$
 update public.concerts set
  ticket_url=coalesce(nullif(a.ticket_url,''),b.ticket_url),
  setlist_id=coalesce(nullif(a.setlist_id,''),b.setlist_id),
  festival=coalesce(nullif(a.festival,''),b.festival),
  tour=coalesce(nullif(a.tour,''),b.tour),
  doors_at=coalesce(a.doors_at,b.doors_at),
  starts_at=coalesce(a.starts_at,b.starts_at),
  address=coalesce(nullif(a.address,''),b.address),
  latitude=coalesce(a.latitude,b.latitude),
  longitude=coalesce(a.longitude,b.longitude),
  promoter=coalesce(nullif(a.promoter,''),b.promoter),
  metadata_updated_at=greatest(a.metadata_updated_at,b.metadata_updated_at)
 where id=keep_id;
 $replacement$);
 execute definition;
end $$;
