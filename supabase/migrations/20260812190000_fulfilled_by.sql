-- Cookie Central — who actually ships the box
--
-- Cortina sometimes ships samples from their own warehouse. Those orders must
-- NOT reach the co-manufacturer's ShipStation queue: nobody there is going to
-- pack them, and an order sitting in Awaiting Shipment that no one will action
-- is worse than no order at all — it ages, it clutters the queue, and the
-- Deliver By sweep chases it every fifteen minutes forever.
--
-- One column, not a second table. The monthly report has to see both kinds in
-- one query ("what shipped, on what accounts, what did it cost"), and a
-- separate table would mean duplicating the schema, the RLS, the items
-- relation and every report join to reunite them. The separation Caroline asked
-- for is presentational — a "Cortina orders" section in the Shipments tab —
-- and that costs nothing here.
--
-- ⚠️ The export filters on an ALLOWLIST, not a denylist: it sends only rows
-- equal to the default value. A typo, a renamed fulfiller or a third party
-- added later therefore fails by NOT reaching the co-man, which is the safe
-- direction. `!= 'Cortina'` would fail the other way, and silently.
--
-- No CHECK constraint for the same reason the issue vocabulary has none: the
-- list of fulfillers will change, and the allowlist already makes an unknown
-- value harmless. The UI offers exactly two options.
--
-- Forward-only; applied via the Management API (no Docker locally).

ALTER TABLE sample_shipments
  ADD COLUMN IF NOT EXISTS fulfilled_by text NOT NULL DEFAULT 'Dirty Cookie | Kukibell';

COMMENT ON COLUMN sample_shipments.fulfilled_by IS
  'Who ships the box. Only ''Dirty Cookie | Kukibell'' is exported to ShipStation — the export allowlists this exact value, so anything else stays off the co-man''s queue.';

-- The export asks this on every pull, and the sweep asks it every 15 minutes.
CREATE INDEX IF NOT EXISTS idx_sample_shipments_fulfilled_by
  ON sample_shipments (fulfilled_by);

-- Existing rows keep the default, which is correct: everything placed so far
-- went through ShipStation.
--
-- Verify:
--   select fulfilled_by, count(*) from sample_shipments group by 1;
