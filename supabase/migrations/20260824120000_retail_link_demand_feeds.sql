-- Cookie Central — Retail Link demand feeds (Walmart Demand Planner)
--
-- The three feeds the demand planner runs on. Until now `/demand-planner` read
-- an embedded SEED constant frozen at 2026-08-13 (see the header comment in
-- src/pages/DemandPlanner.jsx); nothing in the schema held POS, Walmart
-- forecast, or DC service. These are those tables.
--
-- ── Where the data actually comes from ─────────────────────────────────────
--
-- Uploaded CSV/XLSX, not email and not an API (Caroline, Aug 23 2026). Two
-- files, both Retail Link exports that arrive weekly:
--
--   "Dirty Cookie WK##.xlsx"                → retail_link_pos_weekly
--                                           + retail_link_forecast
--   "OTIF STORE Performance PO DETAILS ..." → retail_link_otif
--
-- The WK## workbook has NINE sheets, not the three the earlier handoff
-- assumed. Two of them carry everything the engine's demand side needs:
--
--   "All Item Detail" — a LONG-FORMAT matrix: one row per (item × measure),
--     55 columns of Walmart weeks (202601…202655). Nine measures per item:
--     POS Sales $, POS Qty, POS Qty if Instock, Units per Store per Week
--     (w/zeros), Avg Price, Traited Stores, Instock, Forecast, Variance.
--     A single upload therefore backfills the ENTIRE year, which is why this
--     table is not restricted to "the week the file was issued".
--
--   "Forecast" — one row per (item × walmart_calendar_week), verified as
--     exactly 3 items × 24 weeks = 72 rows in WK28, no duplicates. It is a
--     pure FORWARD view: the WK28 file starts at 202629.
--
-- ── Why POS is upserted, not inserted ──────────────────────────────────────
--
-- ⚠️ Walmart RESTATES POS, and not by trivial amounts. Comparing the WK28
-- export against SEED (frozen 2026-08-13) week by week:
--   • most weeks agree within 2%
--   • week 202622 does NOT: PBG reads 1322 in SEED and 2343 in the file;
--     WC reads 4035 and 4847.
-- 202622 is the week of the PBG in-stock collapse, so the week captured while
-- it was still settling is the week that moved most. The later file is the
-- more correct one. Every load must therefore overwrite the value it already
-- holds for a (week, item) — hence the UNIQUE constraints below, which exist
-- for CORRECTNESS, not merely to make re-uploads idempotent.
--
-- This also means "the live feed reproduces SEED" is the WRONG acceptance
-- test for the cutover. SEED is a stale snapshot; disagreement on restated
-- weeks is the feed working, not failing.
--
-- ── The one field the exports do NOT carry weekly ──────────────────────────
--
-- Weekly STORE ON-HAND. "All Item Detail" has no on-hand measure — only the
-- current position is available, from the "Sales Summary" (Curr Str On Hand)
-- and "Item Data" (store_on_hand_quantity_this_year_eop) sheets. So
-- `store_on_hand` is populated for the file's own week only and is NULL for
-- backfilled history; it accrues one week per upload from here on. The
-- engine's storeOhDoh is blank where it is NULL, which is correct — a missing
-- value is not zero.
--
-- Forward-only; applied via the Management API (no Docker locally).

-- ─────────────────────────── POS by item by week ───────────────────────────
-- Grain: one row per (walmart_week, item_number). Column names track the
-- source measures rather than the engine's internal names, so a reader can
-- line this up against the export without a decoder ring.
--
-- `item_number` is the Walmart Prime Item Nbr and is the durable key. The
-- short codes the planner shows (WC / PBG / CCF) live in WM_ITEM_TO_SKU in
-- src/pages/DemandPlanner.jsx; they are a display concern and deliberately
-- not stored here, so adding an item does not need a migration.
CREATE TABLE IF NOT EXISTS retail_link_pos_weekly (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  walmart_week      int  NOT NULL,          -- e.g. 202628 (Walmart week, Sat–Fri)
  item_number       text NOT NULL,          -- Prime Item Nbr, e.g. '679640563'
  item_desc         text,

  pos_units         numeric,                -- "POS Qty"
  pos_dollars       numeric,                -- "POS Sales $"
  -- Walmart's own un-suppressed demand. The engine derives trueDemand as
  -- pos_units / instock_pct; Walmart supplies this directly and the two do not
  -- agree exactly (WC 202620: 5920/0.9459 = 6258 vs 6240.272 supplied), so
  -- keep both and prefer the supplied column where it is present.
  pos_units_if_instock       numeric,       -- "POS Qty if Instock"
  units_per_store_week       numeric,       -- "Units per Store per Week (w/zeros)"
  avg_price         numeric,                -- "Avg Price"
  traited_stores    int,                    -- "Traited Stores"
  instock_pct       numeric,                -- "Instock" — a FRACTION (0.9875), not a percent
  wmt_forecast_units numeric,               -- "Forecast" as restated in this sheet
  variance          numeric,                -- "Variance"

  -- Current-week only; NULL for backfilled weeks. See the header note.
  store_on_hand     int,
  whse_on_hand      int,

  source_week       int,                    -- the week of the FILE this row came from
  upload_id         uuid REFERENCES upload_log(id),
  updated_at        timestamptz DEFAULT now(),
  CONSTRAINT retail_link_pos_weekly_key UNIQUE (walmart_week, item_number)
);
CREATE INDEX IF NOT EXISTS idx_rl_pos_week ON retail_link_pos_weekly (walmart_week);

-- ──────────────────── Walmart forecast, snapshot × target ──────────────────
-- The engine scores forecast accuracy (mape) using, for each target week, the
-- latest snapshot taken STRICTLY BEFORE that target. That is impossible from a
-- single forward view, so the snapshot week is part of the key: each weekly
-- upload deposits one more snapshot and the history accumulates from the first
-- upload onward. Snapshots before the first upload are not recoverable, so
-- mape stays blank until at least two weeks of files have been loaded — that
-- is expected, not a bug.
--
-- `snapshot_week` is taken from the file (its WK## / the Forecast sheet's
-- earliest target minus one), NOT from the date of upload — re-loading an old
-- file months later must not claim to be a fresh snapshot.
CREATE TABLE IF NOT EXISTS retail_link_forecast (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_week  int  NOT NULL,             -- week the forecast was PULLED
  target_week    int  NOT NULL,             -- "walmart_calendar_week"
  item_number    text NOT NULL,
  item_desc      text,
  vendor_stock_id text,
  forecast_units numeric,                   -- "final_forecast_each_quantity"
  upload_id      uuid REFERENCES upload_log(id),
  updated_at     timestamptz DEFAULT now(),
  CONSTRAINT retail_link_forecast_key UNIQUE (snapshot_week, target_week, item_number),
  CONSTRAINT retail_link_forecast_forward CHECK (target_week > snapshot_week)
);
CREATE INDEX IF NOT EXISTS idx_rl_fcst_target ON retail_link_forecast (target_week, item_number);

-- ───────────────────────── DC service / OTIF by PO ─────────────────────────
-- From the "Receiver" sheet of the OTIF export, which is the only Retail Link
-- sheet carrying a real "Walmart Week" column per record. Feeds the planner's
-- cut-recovery panel: cases ordered vs unfilled, and the PO count per week.
--
-- Grain is per PO, not per week, deliberately — the panel needs the PO count,
-- and per-week totals are a trivial aggregate of these rows while the reverse
-- is not. The export's first data row is a grand-total line with no PO number;
-- parseOtifDetail already separates it out and it is NOT stored here.
--
-- Files overlap on purpose (WK 24-to-27 and WK 27-to-27 arrived together), so
-- the same PO appears in more than one upload — the unique key makes the
-- second load an update.
CREATE TABLE IF NOT EXISTS retail_link_otif (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  walmart_week     int  NOT NULL,
  host_po          text NOT NULL,           -- "Host PO Nbr" — zero-padded, keep as text
  oms_po           text,
  mabd             date,                    -- Must Arrive By Date
  delivery_window  text,
  cases_ordered    numeric,
  cases_early      numeric,
  cases_on_time    numeric,
  cases_late       numeric,
  cases_unfilled   numeric,                 -- the "cut" in the planner's terms
  otif_pct         numeric,                 -- a FRACTION (0.6462), not a percent
  upload_id        uuid REFERENCES upload_log(id),
  updated_at       timestamptz DEFAULT now(),
  CONSTRAINT retail_link_otif_key UNIQUE (walmart_week, host_po)
);
CREATE INDEX IF NOT EXISTS idx_rl_otif_week ON retail_link_otif (walmart_week);

-- ─────────────────────────────── RLS ───────────────────────────────────────
-- Matches the convention used by the EOS tables: everyone authenticated reads,
-- the internal roles write. The Cortina sales role has no business here, but
-- it is gated out of /demand-planner at the router anyway (App.jsx InternalOnly).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['retail_link_pos_weekly','retail_link_forecast','retail_link_otif']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      CREATE POLICY "All can read" ON %I FOR SELECT USING (true)
    $p$, t);
    EXECUTE format($p$
      CREATE POLICY "Internal write" ON %I FOR ALL
        USING (EXISTS (SELECT 1 FROM user_profiles
                        WHERE id = auth.uid() AND role IN ('admin','finance','ops')))
        WITH CHECK (EXISTS (SELECT 1 FROM user_profiles
                        WHERE id = auth.uid() AND role IN ('admin','finance','ops')))
    $p$, t);
  END LOOP;
END $$;

-- ── upload_log: allow the two new upload types ─────────────────────────────
ALTER TABLE upload_log DROP CONSTRAINT IF EXISTS upload_log_upload_type_check;
ALTER TABLE upload_log ADD CONSTRAINT upload_log_upload_type_check
  CHECK (upload_type IN ('dot','assemblers','production','qbo','netsuite','weekly_report',
                         'cortina_po','ingredient_master','walmart_orders',
                         'retail_link','retail_link_otif'));
