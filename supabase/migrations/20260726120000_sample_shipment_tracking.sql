-- Cookie Central — Sample shipment tracking + requested service
--
-- Phase 3, Task 3.2 (ADR-028, Custom Store pattern). Two changes to
-- sample_shipments:
--
-- 1. shipnotify landing columns. ShipStation POSTs `shipnotify` with carrier +
--    tracking when the co-man ships; these nullable columns receive it. Orders
--    key on OrderNumber = shipment_no, so the superseded `shipstation_order_id`
--    stays unused (left in place, harmless).
--
-- 2. requested_service replaces the retired `rush` boolean. The Sample Site now
--    offers a curated dropdown of real ShipStation serviceCodes; the export sends
--    the chosen code as <ShippingMethod>, mapped 1:1 in the Custom Store service
--    mapping. Speed is the picked service (or the cold-chain automation), so the
--    old rush flag is dropped. Existing rows fall to the 'ups_ground' default.
--    The CHECK guards the curated set — a bad code would silently break the
--    ShipStation mapping (the pull model surfaces no error), so we reject it at
--    write time (same discipline as the status CHECK). Extend both this CHECK
--    and the app dropdown together when a new service is offered.
--
-- Forward-only; applied manually via the Supabase SQL editor.

ALTER TABLE sample_shipments
  ADD COLUMN IF NOT EXISTS tracking_number text,   -- from shipnotify
  ADD COLUMN IF NOT EXISTS carrier         text,   -- ShipStation carrierCode, e.g. 'ups'
  ADD COLUMN IF NOT EXISTS service         text,   -- ShipStation serviceCode shipped under, e.g. 'ups_ground'
  ADD COLUMN IF NOT EXISTS shipped_at      timestamptz,
  ADD COLUMN IF NOT EXISTS requested_service text NOT NULL DEFAULT 'ups_ground'
    CHECK (requested_service IN (
      'ups_ground',
      'ups_next_day_air',
      'fedex_ground',
      'fedex_priority_overnight',
      'usps_priority_mail',
      'usps_priority_mail_express'
    )),
  DROP COLUMN IF EXISTS rush;

-- Verify:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'sample_shipments'
--      and column_name in ('tracking_number','carrier','service','shipped_at','requested_service','rush')
--    order by column_name;
--   -- expect 5 rows (rush absent); requested_service NOT NULL default 'ups_ground'.
