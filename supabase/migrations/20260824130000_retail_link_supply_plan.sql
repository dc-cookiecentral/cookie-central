-- Cookie Central — Retail Link Supply Plan (Walmart's forward order plan)
--
-- The sixth Retail Link feed, added when the upload surface was consolidated to
-- the six exports actually used (Caroline, Aug 24 2026). ADR-053 recorded the
-- Supply Plan as "not ingested" on the grounds that its `Supply Plan` sheet is a
-- monthly pivot. That was right about the pivot and wrong about the file: the
-- **`Data` sheet is date-grain** and is a different dataset entirely — its own
-- `metadata` sheet names it **"Order Forecast"**.
--
-- ── What this is, and what it is NOT ───────────────────────────────────────
--
-- It is Walmart's plan for the POs it intends to PLACE ON US, by order-place
-- date. That is the missing middle of the chain:
--
--   retail_link_forecast   what Walmart expects CONSUMERS to buy (store POS)
--   retail_link_supply_plan  what Walmart plans to ORDER FROM US   ← this
--   purchase_orders        what Walmart actually ordered
--
-- Confusing it with `retail_link_forecast` would double-count demand — they are
-- different quantities at different points in the chain, and the totals do not
-- reconcile (nor should they).
--
-- ── Grain ─────────────────────────────────────────────────────────────────
-- One row per (snapshot_date, item, order_place_date, DC). Verified on the WK28
-- file: 60 rows = 3 items × 20 order-place dates, all unique. `dc_nbr` is empty
-- in the "Total Company" exports seen so far; it is NOT NULL DEFAULT '' rather
-- than nullable so the unique key actually works — a NULL never equals a NULL in
-- Postgres, and the whole point of the key is to make a re-upload an update.
--
-- ── Quantities are in EACHES ──────────────────────────────────────────────
-- `order_each_quantity` is the file's own column and its own unit. Everything
-- observed is a clean multiple of 12 (the vendor pack), so cases = eaches / 12,
-- but the conversion is left to the reader rather than baked in — the same rule
-- the rest of the planner follows, where units→cases happens exactly once.
--
-- Forward-only; applied via the Management API (no Docker locally).

CREATE TABLE IF NOT EXISTS retail_link_supply_plan (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The pull date, from the file's own `sugg_order_dt`. Every row in one export
  -- carries the same value. Like retail_link_forecast.snapshot_week, this is
  -- taken from the FILE — never the upload date — so re-loading an old export
  -- cannot masquerade as a fresh plan.
  snapshot_date       date NOT NULL,
  item_number         text NOT NULL,          -- `wm_item_nbr`
  item_desc           text,
  order_place_date    date NOT NULL,          -- `order_place_dt`
  -- Derived at parse time from the Walmart calendar (week 202605 begins Sat
  -- 2026-02-28), because the engine is weekly and this file is daily. Verified
  -- against all 48 weeks of SEED.weeks — exact. Stored rather than computed on
  -- read so the bucketing rule lives in one place.
  order_place_week    int NOT NULL,
  dc_nbr              text NOT NULL DEFAULT '',
  order_each_quantity numeric,
  upload_id           uuid REFERENCES upload_log(id),
  updated_at          timestamptz DEFAULT now(),
  CONSTRAINT retail_link_supply_plan_key
    UNIQUE (snapshot_date, item_number, order_place_date, dc_nbr)
);
CREATE INDEX IF NOT EXISTS idx_rl_plan_week
  ON retail_link_supply_plan (order_place_week, item_number);

ALTER TABLE retail_link_supply_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON retail_link_supply_plan FOR SELECT USING (true);
CREATE POLICY "Internal write" ON retail_link_supply_plan FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles
                  WHERE id = auth.uid() AND role IN ('admin','finance','ops')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles
                  WHERE id = auth.uid() AND role IN ('admin','finance','ops')));

-- ── upload_log: allow upload_type='retail_link_supply_plan' ────────────────
ALTER TABLE upload_log DROP CONSTRAINT IF EXISTS upload_log_upload_type_check;
ALTER TABLE upload_log ADD CONSTRAINT upload_log_upload_type_check
  CHECK (upload_type IN ('dot','assemblers','production','qbo','netsuite','weekly_report',
                         'cortina_po','ingredient_master','walmart_orders',
                         'retail_link','retail_link_otif','retail_link_supply_plan'));
