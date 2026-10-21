-- Cookie Central — hide test orders without destroying them
--
-- Five test orders (SMP-1206, -1207, -1210, -1211, -1212) were placed against
-- the production store after launch. All five are already `cancelled` here and
-- in ShipStation; none shipped, none carries a cost or an issue. They still
-- clutter the Shipments tab and the Reports tab.
--
-- A flag, not a DELETE, for the same reason addresses got `active`:
--
--   1. Shipment numbers are minted from the max existing `shipment_no`. If
--      SMP-1212 were deleted, the next order would be minted as SMP-1212 again —
--      a number ShipStation already holds (cancelled) for a different order.
--      The row has to stay so the number stays taken.
--   2. A DELETE would also need the items gone first
--      (`sample_shipment_items_shipment_id_fkey`), and is not reversible.
--
-- The UPDATE below fires `set_updated_at_sample_shipments`, which puts these
-- rows in the next export window — harmless, because the export excludes
-- `cancelled` (NO_EXPORT_STATUSES) and all five are cancelled.
--
-- The site filters `excluded` rows out of every list and report total. The
-- export and the Deliver By sweep do not need to read it: both already skip
-- cancelled orders.
--
-- Forward-only; apply via the Management API (no Docker locally), then register
-- with `migration repair --status applied 20261021120000`.

ALTER TABLE sample_shipments
  ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN sample_shipments.excluded IS
  'Hidden from the site (lists and report totals). For test orders; the row is kept so its shipment_no stays taken.';

UPDATE sample_shipments
   SET excluded = true
 WHERE shipment_no IN ('SMP-1206', 'SMP-1207', 'SMP-1210', 'SMP-1211', 'SMP-1212')
   AND status = 'cancelled';
