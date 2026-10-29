-- Cookie Central — DOT on-hand, from DOT's "Inventory Snapshot" export
--
-- KNOWN_ISSUES §3 said this report did not exist (Aug 24 2026). It does: the
-- first copy arrived 2026-10-27. Three tabs — Inventory Summary (per lot, with
-- RG / EX product status and Loaded / Picked), WH Summary (per location) and
-- Aggregated Orders (in transit). Parsed by src/parsers/dotInventorySnapshot.js.
--
-- ⚠️ Not `dot_inventory`. That table (initial schema) was built for a DOT file
-- that had not been seen: incoming / in-transit / allocated / velocity buckets,
-- insert-only, no key. It is still empty, and useAlerts / useEomSnapshot read
-- it, so filling it would change those pages without anyone deciding to.
--
-- ── One row per SKU per Walmart week ─────────────────────────────────────
-- A reading is the CLOSING stock of the Walmart week that contains its
-- snapshot date (Caroline, Oct 28 2026). The sheets carry no date, so
-- snapshot_date is the workbook's created date, read in US Central time.
-- Re-uploading within a week replaces that week's row, unless the stored
-- reading is newer — the importer refuses to go backwards.
--
-- ── The numbers (cases) ──────────────────────────────────────────────────
--   good_cases       RG lots, Total Inventory. INCLUDES committed.
--   committed_cases  RG lots, Loaded + Picked. Available = good − committed.
--   expired_cases    EX lots, Total Inventory. Not in good.
--   expiring_60d     RG cases expiring within 60 days of snapshot_date.
-- First file: good WC 1,531 / PBG 743 / CCF 1,544 / BC 1,257; expired 1,086;
-- committed 1,005.
--
-- Forward-only.

CREATE TABLE IF NOT EXISTS dot_on_hand (
  sku                   text NOT NULL,          -- WC | PBG | CCF | BC
  wm_week               int  NOT NULL,          -- Walmart week holding snapshot_date
  snapshot_date         date NOT NULL,
  gtin                  text NOT NULL,          -- case GTIN = master_cases.gtin14
  dot_item_number       text,
  cases_per_pallet      numeric,

  good_cases            numeric NOT NULL DEFAULT 0,
  committed_cases       numeric NOT NULL DEFAULT 0,
  expired_cases         numeric NOT NULL DEFAULT 0,
  expiring_60d_cases    numeric NOT NULL DEFAULT 0,
  earliest_good_expiry  date,
  lot_count             int,

  upload_id             uuid REFERENCES upload_log(id),
  updated_at            timestamptz DEFAULT now(),
  PRIMARY KEY (sku, wm_week)
);
CREATE INDEX IF NOT EXISTS idx_doh_on_hand_week ON dot_on_hand (wm_week);

ALTER TABLE dot_on_hand ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON dot_on_hand FOR SELECT USING (true);
CREATE POLICY "Internal write" ON dot_on_hand FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles
                  WHERE id = auth.uid() AND role IN ('admin','finance','ops')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles
                  WHERE id = auth.uid() AND role IN ('admin','finance','ops')));

-- ── upload_log: allow upload_type='dot_inventory_snapshot' ─────────────────
ALTER TABLE upload_log DROP CONSTRAINT IF EXISTS upload_log_upload_type_check;
ALTER TABLE upload_log ADD CONSTRAINT upload_log_upload_type_check
  CHECK (upload_type IN ('dot','assemblers','production','qbo','netsuite','weekly_report',
                         'cortina_po','ingredient_master','walmart_orders',
                         'retail_link','retail_link_otif','retail_link_supply_plan',
                         'dot_order_history','dot_inventory_snapshot'));
