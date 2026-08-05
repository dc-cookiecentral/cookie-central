-- Sample Central — raise the Deliver By sweep's HTTP timeout (fixes 20260804120000)
--
-- `net.http_post` defaults to a **5000 ms** timeout. Every scheduled run of the
-- sweep hit it:
--
--   00:15:00  Timeout of 5000 ms reached. Total time: 5001.953 ms
--
-- The work genuinely takes longer than 5s from cold: the Edge Function cold-starts,
-- then makes a ShipStation list call plus a GET+PUT per order needing a change.
-- A manual invocation returned 200 only because repeated calls had warmed the
-- function — which is exactly why this was invisible until a *scheduled* run was
-- watched.
--
-- 30s is generous headroom; the sweep is a no-op (one list call) when nothing has
-- changed, so the long ceiling costs nothing on a normal tick.
--
-- ⚠️ A timeout here abandons the HTTP response, not necessarily the work — the
-- function may still complete server-side. But it leaves `net._http_response`
-- with no status code, so there is no way to tell a slow success from a real
-- failure. Observability is the point as much as reliability.
--
-- NOT auto-deployed — paste into the SQL editor (RUNBOOK §7).

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
    body    := jsonb_build_object('trigger', 'cron'),
    timeout_milliseconds := 30000
  );
  $$
);

-- Verify the NEXT scheduled tick returns a real status code, not a timeout:
--   select id, status_code, left(coalesce(content, error_msg, ''), 200), created
--   from net._http_response order by created desc limit 5;
--
-- Reminder: cron.job_run_details.status = 'succeeded' only means the statement
-- queued the request. It is NOT evidence the function ran.
