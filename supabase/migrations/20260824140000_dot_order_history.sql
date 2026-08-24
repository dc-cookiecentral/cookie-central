-- Cookie Central — DOT outbound Order History
--
-- The real "DOT Report" (Caroline, Aug 24 2026): the `Order History (N).xlsx`
-- export, one sheet "Outbound Orders", one row per DOT order shipped toward a
-- Walmart GDC. This is card 5 of the six weekly uploads.
--
-- ⚠️ It is NOT `dot_inventory`. That table is a pallet-level ON-HAND snapshot
-- (on_hand / incoming / in_transit / allocated) and its parser, `src/parsers/
-- dot.js`, is still FORMAT UNCONFIRMED and still has no sample. This is an
-- ORDER/CUT feed: what Walmart ordered through DOT and what DOT failed to
-- deliver. Different question, different table, both legitimately named "DOT".
--
-- ── Why this matters more than it looks ───────────────────────────────────
--
-- It is the source of the planner's cut-recovery panel. Parsing this file and
-- bucketing by Delivery Date into Walmart weeks reproduces `SEED.dotService`
-- EXACTLY — all six weeks, on ordered, cut and order count:
--
--   202620  252/208/2     202623  3906/2587/63
--   202621  798/630/23    202624  2373/2006/47
--   202622  5334/5283/84  202625    84/  42/ 2
--
-- Unlike POS (which Walmart restates, so SEED is stale — ADR-054), this export
-- is a fixed historical slice, so exact reproduction IS the right acceptance
-- test here and it passes.
--
-- ── The quantity identity ─────────────────────────────────────────────────
--
--   ordered_cases = expected_cases + cut_cases + reconciled_cases
--
-- Verified on all 221 rows. Note it is NOT `ordered = expected + cut`, which
-- holds on only 148 of 221 — `reconciled` (settled/delivered) is the third
-- term and omitting it makes two thirds of the file look inconsistent.
-- Quantities are CASES; every value observed is a multiple of 21, the pallet
-- layer.
--
-- ── The join nobody should miss ───────────────────────────────────────────
--
-- `customer_po` is the Walmart PO and matches `retail_link_otif.host_po` — 62
-- of 169 DOT POs in the sample file matched an OTIF PO (partial only because
-- the two exports covered different date windows). That join is how a cut seen
-- from DOT's side lines up with the same shortfall seen from Walmart's side.
--
-- Forward-only; applied via the Management API (no Docker locally).

CREATE TABLE IF NOT EXISTS dot_order_history (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The natural key: unique on all 221 rows of the sample. Text, not a number
  -- — an identifier is never arithmetic.
  dot_order_number        text NOT NULL,
  customer_po             text,          -- Walmart PO → retail_link_otif.host_po
  corporate_account       text,          -- 'Walmart' throughout the sample
  temperature             text,          -- 'Refrigerated Goods'
  order_status            text,          -- Open | Picked | Loaded | Delivered

  ordered_cases           numeric,
  expected_cases          numeric,
  reconciled_cases        numeric,
  shipped_cases           numeric,
  cut_cases               numeric,

  order_date              date,
  delivery_date           date,
  -- Derived at parse time from the Walmart calendar (week 202605 begins Sat
  -- 2026-02-28), the same helper the Supply Plan uses. Delivery Date is the
  -- bucketing date — it is what reproduces SEED.dotService.
  delivery_week           int,
  requested_delivery_date date,
  -- Verbatim: the source reads '07/22/2026, 04:00 PM' with no timezone, and
  -- turning that into a timestamptz would invent one.
  appointment_at          text,
  customer_arrival_date   date,
  reconciled_date         date,

  originating_dc          text,
  fulfilling_dc           text,
  destination             text,          -- 'Walmart/Gdc #6042'
  load_numbers            text,

  upload_id               uuid REFERENCES upload_log(id),
  updated_at              timestamptz DEFAULT now(),
  CONSTRAINT dot_order_history_key UNIQUE (dot_order_number)
);
CREATE INDEX IF NOT EXISTS idx_doh_week ON dot_order_history (delivery_week);
CREATE INDEX IF NOT EXISTS idx_doh_customer_po ON dot_order_history (customer_po);

ALTER TABLE dot_order_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON dot_order_history FOR SELECT USING (true);
CREATE POLICY "Internal write" ON dot_order_history FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles
                  WHERE id = auth.uid() AND role IN ('admin','finance','ops')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles
                  WHERE id = auth.uid() AND role IN ('admin','finance','ops')));

-- ── upload_log: allow upload_type='dot_order_history' ──────────────────────
-- 'dot' stays in the list: dot.js still exists for the pallet-level on-hand
-- export, which is a different file that has simply never arrived.
ALTER TABLE upload_log DROP CONSTRAINT IF EXISTS upload_log_upload_type_check;
ALTER TABLE upload_log ADD CONSTRAINT upload_log_upload_type_check
  CHECK (upload_type IN ('dot','assemblers','production','qbo','netsuite','weekly_report',
                         'cortina_po','ingredient_master','walmart_orders',
                         'retail_link','retail_link_otif','retail_link_supply_plan',
                         'dot_order_history'));
