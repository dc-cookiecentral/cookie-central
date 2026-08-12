-- Cookie Central — give `delivered` a source
--
-- `delivered` has been a legal status since the pipeline was built, handled
-- correctly by every layer, and written by NOTHING. ADR-034/039 recorded the
-- source as blocked behind a ShipStation billing upgrade. That was wrong: the
-- probe had only ever tested `GET /v2/tracking`, which is ShipEngine's path and
-- is not part of ShipStation V2 (its release notes list only
-- `POST /v2/tracking/stop` there). The per-LABEL endpoint works on this account
-- today, verified live Aug 11 2026:
--
--   GET /v2/labels?tracking_number=…  → 200, label_id se-649431539
--   GET /v2/labels/{label_id}/track   → 200, status_code / actual_delivery_date
--
-- Two columns, both nullable, no backfill.
--
-- `delivered_at` — when the carrier says it arrived, taken from the track log's
-- `actual_delivery_date`. NOT the sweep's own clock: an invented timestamp is
-- indistinguishable from a real one, so the column stays null rather than lying
-- when the carrier does not supply the date.
--
-- `shipstation_label_id` — cached so the steady-state sweep is ONE call per
-- shipped order instead of two. This is the same trick that took the Deliver By
-- sweep from ~17s to 3.9s (ADR-034 amendment): resolve once, then go direct.
-- Nullable because it is learned on first sight, exactly like
-- `shipstation_order_id`.
--
-- ⚠️ Writing `delivered` bumps `updated_at`, and the export windows on
-- `updated_at` alone — so every delivery lands the row in the next export.
-- That is safe and already proven: `ssStatus` maps `delivered` → `shipped`,
-- which is what ShipStation already believes, and `syncedStatus` refuses to
-- overwrite `delivered` coming back. The Aug 6 forced-delivered experiment on
-- SMP-TEST-1053 walked this exact path end to end. See ADR-041 for why any
-- status write must be assumed to be a message to ShipStation.
--
-- Forward-only; applied via the Management API (no Docker locally).

ALTER TABLE sample_shipments
  ADD COLUMN IF NOT EXISTS delivered_at         timestamptz,
  ADD COLUMN IF NOT EXISTS shipstation_label_id text;

COMMENT ON COLUMN sample_shipments.delivered_at IS
  'Carrier delivery time from GET /v2/labels/{label_id}/track (actual_delivery_date). Null when delivered but the carrier gave no timestamp — never the sweep clock.';

COMMENT ON COLUMN sample_shipments.shipstation_label_id IS
  'V2 label id, cached on first sight so the delivery poll skips the tracking-number lookup. Learned, not authoritative — safe to null out to force re-resolution.';

-- Partial index: the delivery poll asks exactly one question every 15 minutes —
-- "which shipped orders have a tracking number?" — and that set is tiny next to
-- the table's eventual size.
CREATE INDEX IF NOT EXISTS idx_sample_shipments_delivery_poll
  ON sample_shipments (status)
  WHERE status = 'shipped' AND tracking_number IS NOT NULL;

-- Verify:
--   select shipment_no, status, tracking_number, shipstation_label_id, delivered_at
--     from sample_shipments order by shipment_no;
