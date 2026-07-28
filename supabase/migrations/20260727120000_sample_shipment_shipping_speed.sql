-- Cookie Central — Sample shipment shipping speed (3-tier)
--
-- Phase 3 follow-up to ADR-028/029. Replaces the curated six-service
-- `requested_service` column with an explicit 3-tier **speed** selector:
--
--     ground | 2day | overnight
--
-- WHY the change. `requested_service` stored a raw ShipStation serviceCode and
-- exposed six carrier-branded services in the checkout UI, which made the
-- salesperson pick a *carrier* as a side effect of picking a *speed*. Carrier
-- choice belongs to fulfilment (and to app config — one connected carrier), not
-- to the salesperson. The tier is the only thing the salesperson actually knows,
-- so that is what we store. The export resolves tier -> serviceCode at the
-- boundary (see SHIPPING_SPEEDS in src/utils/sampleCentral.js and the same map
-- in supabase/functions/_shared/shipstation.ts):
--
--     ground     -> ups_ground
--     2day       -> ups_2nd_day_air
--     overnight  -> ups_next_day_air
--
-- The CHECK guards the tier set for the same reason the old one guarded
-- serviceCodes: a bad value silently breaks the ShipStation ShippingMethod
-- mapping and the pull model surfaces no error, so we reject at write time.
-- Extend this CHECK, the app dropdown, and the export map together.
--
-- The `rush` boolean this lineage started from was already dropped by
-- 20260726120000; the DROP below is a no-op safety net for any database that
-- somehow skipped that migration.
--
-- Forward-only; applied manually via the Supabase SQL editor.

ALTER TABLE sample_shipments
  ADD COLUMN IF NOT EXISTS shipping_speed text NOT NULL DEFAULT 'ground'
    CHECK (shipping_speed IN ('ground', '2day', 'overnight'));

-- Backfill from the retiring serviceCode column, if it is still present.
-- Anything next-day/overnight/express-flavoured becomes 'overnight'; 2nd-day
-- becomes '2day'; everything else falls to the 'ground' default. Guarded so the
-- migration is safe to re-run after requested_service is gone.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'sample_shipments' AND column_name = 'requested_service'
  ) THEN
    UPDATE sample_shipments
       SET shipping_speed = CASE
             WHEN requested_service ~ 'next_day|overnight|express' THEN 'overnight'
             WHEN requested_service ~ '2nd_day|second_day|2_day'   THEN '2day'
             ELSE 'ground'
           END;
  END IF;
END $$;

ALTER TABLE sample_shipments
  DROP COLUMN IF EXISTS requested_service,
  DROP COLUMN IF EXISTS rush;               -- already dropped by 20260726120000; no-op safety net

-- Verify:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'sample_shipments'
--      and column_name in ('shipping_speed','requested_service','rush')
--    order by column_name;
--   -- expect 1 row: shipping_speed, text, NO, 'ground'::text.
--
--   select shipping_speed, count(*) from sample_shipments group by 1;
--   -- expect only ground/2day/overnight.
