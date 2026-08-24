-- Cookie Central — expose Cut Reason and per-line actual delivery on PO lines
--
-- The Cortina/NetSuite "Walmart Orders" export carries a **Cut Reason** column
-- that has never been ingested. It is the field that explains WHY Walmart's
-- order book and our deliveries diverge, and without it the demand planner's
-- `orders` series cannot compute its `cuts` count from live data at all.
--
-- On the 2026-08-22 export, 194 of 1,155 lines carry one:
--   170  Restricted Supply - Supplier
--    10  Restricted Supply - Supplier | Dot Out Of Stock-Contact Csr
--     5  Order Entry Cut
--     4  Refused By Receiving
--     2  Dot Out Of Stock-Contact Csr
--     2  Restricted Supply - Supplier; Refused By Receiving
--     1  Damage Found At Delivery
--
-- Stored verbatim as text, not normalised to an enum: the values are already
-- compound (`|` and `;` separated) and Walmart/Cortina evidently add to them,
-- so a CHECK constraint would start rejecting real rows.
--
-- `actual_delivery_date` is promoted from `metadata->>'actual_delivery_date'`,
-- where the parser has been putting it all along, to a real typed column. It
-- was already per-line — different DCs on one SO deliver on different days —
-- and the demand planner needs to bucket by it: `dlv` and `rev` bucket by
-- ACTUAL delivery week while `req` and `cuts` bucket by the PO's scheduled
-- delivery week. Verified against SEED.orders (see ADR-059). Querying that
-- through jsonb on every page load is the wrong shape for something so central.
--
-- Both are additive and nullable; the existing importer's delete-then-insert
-- refresh backfills them on the next upload of the full history.
--
-- Forward-only; applied via the Management API (no Docker locally).

ALTER TABLE po_line_items ADD COLUMN IF NOT EXISTS cut_reason text;
ALTER TABLE po_line_items ADD COLUMN IF NOT EXISTS actual_delivery_date date;

-- The demand planner reads lines by delivery week; both dates are on the hot path.
CREATE INDEX IF NOT EXISTS idx_po_line_actual_delivery
  ON po_line_items (actual_delivery_date);
-- Partial: only ~17% of lines carry a reason, and the questions asked of this
-- column are always "which lines were cut", never "which were not".
CREATE INDEX IF NOT EXISTS idx_po_line_cut_reason
  ON po_line_items (cut_reason) WHERE cut_reason IS NOT NULL;
