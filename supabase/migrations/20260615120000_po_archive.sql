-- Cookie Central — archive purchase orders
--
-- Adds a soft-archive flag to purchase_orders so completed/cancelled POs can be
-- hidden from the active Product Orders list without deleting them (lots,
-- invoices, and email history stay intact). The list filters archived=false by
-- default and offers a "Show archived" toggle; restoring clears the flag.
--
-- archived_at records when it happened (set by the UI; null when restored).
-- `archived` is NOT in the track_po_changes trigger's watched-column array, so
-- archiving/restoring does not spam po_changes / audit_log.
--
-- The existing "Ops/admin update" RLS policy (migration 20260602170000) already
-- covers this UPDATE — no new policy needed.
--
-- NOT auto-deployed — paste into the SQL editor (RUNBOOK §7).

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Partial index: the active list always filters archived=false, so index just
-- the (small, growing) archived set isn't useful — index the common predicate.
CREATE INDEX IF NOT EXISTS idx_po_active ON purchase_orders(archived) WHERE archived = false;

-- Verify:
--   select column_name from information_schema.columns
--     where table_name='purchase_orders' and column_name in ('archived','archived_at');
