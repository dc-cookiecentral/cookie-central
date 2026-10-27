-- Sample Central — "never reached ShipStation" alert + an item quantity floor
--
-- SMP-1213 (Oct 23 2026) was saved with ship-to state "New Jersey". The export
-- skips any order whose State is not a 2-letter code, so ShipStation never saw
-- it, and for four days nothing anywhere said so. The Custom Store is a pull:
-- an order ShipStation does not take produces no error on either side.
--
-- 1. not_imported_alerted_at — the Deliver By sweep emails systems@ once when
--    an open order still has no shipstation_order_id an hour after submission
--    (importAlertDue in _shared/shipstation.ts). This column is the latch that
--    makes it once, not every 15 minutes. Writing it fires
--    set_updated_at_sample_shipments, which re-queues the order for the next
--    export — a free retry, and intended.
--
-- 2. qty >= 1 — the custom-line quantity box accepted 0, negatives and
--    decimals (the column is integer, so a decimal failed the insert AFTER the
--    header was written). The export sent 0 as 1 and passed negatives through.
--    All existing rows are >= 1 (checked Oct 27 2026), so the constraint
--    validates immediately.
--
-- Forward-only; apply via the Management API (no Docker locally), then register
-- with `migration repair --status applied 20261027120000`.

ALTER TABLE sample_shipments
  ADD COLUMN IF NOT EXISTS not_imported_alerted_at timestamptz;

ALTER TABLE sample_shipment_items
  DROP CONSTRAINT IF EXISTS sample_shipment_items_qty_positive;
ALTER TABLE sample_shipment_items
  ADD CONSTRAINT sample_shipment_items_qty_positive CHECK (qty >= 1);
