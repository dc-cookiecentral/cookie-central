-- Cookie Central — daily Gmail poll (pg_cron → gmail-poll Edge Function)
--
-- Runs the inbox poll once a day in addition to the on-demand "Check for new"
-- button on /uploads. The job POSTs to the gmail-poll function with a service-
-- role bearer so it satisfies the function's verify_jwt; gmail-poll then fetches
-- new mail, classifies it, and tail-calls gmail-extract.
--
-- APPLY THIS LAST — only after the Edge Functions are deployed, and after you've
-- stored the bearer secret (the project's service_role key):
--
--   select public.set_secret('EDGE_CRON_BEARER', '<service_role_key>');
--
-- Requires the pg_cron + pg_net extensions (enable once in
--   Dashboard → Database → Extensions, or:):
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
-- NOT auto-deployed — paste into the SQL editor (RUNBOOK §7).

-- Idempotent: drop a prior definition of the job before (re)creating it.
select cron.unschedule('gmail-poll-daily')
where exists (select 1 from cron.job where jobname = 'gmail-poll-daily');

-- 11:00 UTC ≈ 06:00 America/Chicago (CDT) / 05:00 (CST). Adjust to taste.
select cron.schedule(
  'gmail-poll-daily',
  '0 11 * * *',
  $$
  select net.http_post(
    url     := 'https://niesswmibmonlbrbcecj.supabase.co/functions/v1/gmail-poll',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || public.get_secret('EDGE_CRON_BEARER')
    ),
    body    := jsonb_build_object('trigger', 'cron')
  );
  $$
);

-- Verify:  select jobname, schedule, active from cron.job where jobname = 'gmail-poll-daily';
-- Manual fire (confirms the scheduled path works):
--   select net.http_post(
--     url := 'https://niesswmibmonlbrbcecj.supabase.co/functions/v1/gmail-poll',
--     headers := jsonb_build_object('Content-Type','application/json',
--       'Authorization','Bearer ' || public.get_secret('EDGE_CRON_BEARER')),
--     body := jsonb_build_object('trigger','manual-test'));
