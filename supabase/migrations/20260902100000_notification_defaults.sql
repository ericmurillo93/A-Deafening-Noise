alter table public.profiles alter column suggestion_email_enabled set default true;
alter table public.profiles alter column notification_preferences set default
  '{"social":{"web":true,"email":true},"concertUpdates":{"web":true,"email":true},"ticketUpdates":{"web":true,"email":true},"suggestions":{"web":true,"email":true},"spotify":{"web":true,"email":true}}'::jsonb;
