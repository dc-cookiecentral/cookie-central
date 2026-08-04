-- Sample Central — 15-minute Deliver By sweep (pg_cron → shipstation-deliverby)
--
-- ShipStation pulls orders from the Custom Store on its own schedule; the V2
-- shipment row we write to doesn't exist until after that import. So the
-- deliver-by date is stamped by a separate outbound sweep rather than at submit
-- time. 15 minutes is well inside the co-man's working rhythm, and the sweep is
-- a no-op (one list call) when nothing has changed.
--
-- PREREQUISITES — apply this LAST:
--   1. Deploy the function:  npx supabase functions deploy shipstation-deliverby
--   2. Store the ShipStation V2 API key (single key, NOT the V1 key:secret pair):
--        select public.set_secret('SHIPSTATION_V2_API_KEY', '<v2_api_key>');
--   3. EDGE_CRON_BEARER must already hold the service_role key (set by
--      20260602150000_gmail_poll_cron.sql).
--
-- Requires pg_cron + pg_net (already enabled for the Gmail poll).
--
-- NOT auto-deployed — paste into the SQL editor (RUNBOOK §7).

-- Idempotent: drop a prior definition of the job before (re)creating it.
select cron.unschedule('shipstation-deliverby-15min')
where exists (select 1 from cron.job where jobname = 'shipstation-deliverby-15min');

select cron.schedule(
  'shipstation-deliverby-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://niesswmibmonlbrbcecj.supabase.co/functions/v1/shipstation-deliverby',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || public.get_secret('EDGE_CRON_BEARER')
    ),
    body    := jsonb_build_object('trigger', 'cron')
  );
  $$
);

-- Verify:  select jobname, schedule, active from cron.job where jobname = 'shipstation-deliverby-15min';
-- Manual fire (confirms the scheduled path works end-to-end):
--   select net.http_post(
--     url := 'https://niesswmibmonlbrbcecj.supabase.co/functions/v1/shipstation-deliverby',
--     headers := jsonb_build_object('Content-Type','application/json',
--       'Authorization','Bearer ' || public.get_secret('EDGE_CRON_BEARER')),
--     body := jsonb_build_object('trigger','manual-test'));
--
-- Recent runs:
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'shipstation-deliverby-15min')
--   order by start_time desc limit 10;
