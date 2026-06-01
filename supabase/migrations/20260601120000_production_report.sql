-- Cookie Central — Assemblers Production report (the second of three lot-coded
-- Assemblers feeds; inventory is the first, outbound the third).
--
-- The Production workbook bundles four sheet types that together capture the
-- raw lot → FG batch lot → outbound shipment chain:
--   • Production  — pallet-level FG output (one row per pallet, multiple per job)
--   • Reject      — per-event waste/loss with reason taxonomy (sometimes for
--                   jobs not yet in Production — that report is forward-only)
--   • Inventory   — same shape as the standalone Assemblers Inventory snapshot
--                   (already handled by parsers/assemblers.js; ignored here)
--   • Job <id>    — vertical key-value header + per-subcomponent consumption
--                   (the cost-rollup backbone: raw lots → FG lot)
--   • Shipment    — pallet/lot-level outbound from the facility (DOT FOODS,
--                   COMPACTOR for waste disposal, freight handlers, etc.)
--
-- Tables below mirror that breakdown. job_id is the Assemblers Job number
-- (UNIQUE) — the join key from pallets/subcomponents/rejects back to a run.
-- The Assemblers PO ("PO 017-2026") is their internal manufacturing PO, NOT
-- the retailer purchase_orders.po_number; stored as text and not FK'd until a
-- mapping is confirmed.
--
-- INTENTIONALLY NOT PUSHED — consistent with the prior schema hold.

-- One Assemblers production job → one finished-good lot.
CREATE TABLE production_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text UNIQUE NOT NULL,            -- "9375706"
  produced_date date,
  work_order text,                        -- "6538048/ PO 017-2026"
  assemblers_po text,                     -- "PO 017-2026" (Assemblers-internal)
  fg_item_code text,                      -- "123006" or "WMT CCF- Batch"
  fg_item_description text,
  fg_lot_code text,                       -- "6147AM"
  fg_expiry_date date,
  quantity_produced numeric,              -- summed from pallets
  quantity_unit text,                     -- "cs" / "ea"
  job_start_at timestamptz,
  job_end_at timestamptz,
  reference_1 text,                       -- usually echoes assemblers_po
  reference_2 text,                       -- "$8.16 per case" / "MASTER BATCH"
  source_upload_id uuid REFERENCES upload_log(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE production_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON production_runs FOR SELECT USING (true);
CREATE POLICY "Ops/admin write" ON production_runs FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
CREATE INDEX idx_production_runs_assemblers_po ON production_runs(assemblers_po);
CREATE INDEX idx_production_runs_fg_lot ON production_runs(fg_lot_code);

-- Pallet-level FG output rows from the Production sheet (one job → N pallets).
CREATE TABLE production_pallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES production_runs(id) ON DELETE CASCADE,
  produced_date date,
  pallet_number text,                     -- "M2593256"
  fg_item_code text,
  fg_lot_code text,
  fg_expiry_date date,
  units_produced numeric,
  unit_of_measure text,                   -- "cs" / "ea"
  source_upload_id uuid REFERENCES upload_log(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE production_pallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON production_pallets FOR SELECT USING (true);
CREATE POLICY "Ops/admin write" ON production_pallets FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
CREATE INDEX idx_production_pallets_run ON production_pallets(run_id);
CREATE INDEX idx_production_pallets_lot ON production_pallets(fg_lot_code);

-- Per-run raw lot consumption — drawn from each Job <id> sheet's subcomponent
-- table. This is the cost-rollup + traceability backbone: which raw lots fed
-- which FG lot. quantity_used = consumed + rejected.
CREATE TABLE production_subcomponents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES production_runs(id) ON DELETE CASCADE,
  subcomponent_code text,                 -- "111006" / "120001" / "WMT CCF- Batch"
  subcomponent_description text,
  raw_lot_code text,                      -- "26071-83" (raw lot or sub-batch lot)
  raw_lot_expiry date,
  quantity_consumed numeric,              -- went into the product
  quantity_rejected numeric,              -- waste
  quantity_used numeric,                  -- total drawn (consumed + rejected)
  unit_of_measure text,                   -- "lb" / "ea"
  reject_pct numeric,                     -- 56.87 (percent, not 0.5687)
  source_upload_id uuid REFERENCES upload_log(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE production_subcomponents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON production_subcomponents FOR SELECT USING (true);
CREATE POLICY "Ops/admin write" ON production_subcomponents FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
CREATE INDEX idx_production_subcomponents_run ON production_subcomponents(run_id);
CREATE INDEX idx_production_subcomponents_raw_lot ON production_subcomponents(raw_lot_code);
CREATE INDEX idx_production_subcomponents_code ON production_subcomponents(subcomponent_code);

-- Per-event reject rows from the Reject sheet — adds timestamp + reason
-- taxonomy that the Job-sheet subcomponent rollup drops. Reasons observed:
-- Waste Product, Yield Loss, QA Test, Damage By Machine, Floor contact,
-- Formulation Trial, Inventory Variance - Systematically vs Physical,
-- Crushed Corrugate, Rework Scrap. Left as free text (taxonomy is evolving).
CREATE TABLE production_rejects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES production_runs(id) ON DELETE CASCADE,
  work_order text,
  item_code text,
  item_description text,
  base_quantity numeric,
  rejected_at timestamptz,
  reject_reason text,
  lot_code text,
  expiry_date date,
  source_upload_id uuid REFERENCES upload_log(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE production_rejects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON production_rejects FOR SELECT USING (true);
CREATE POLICY "Ops/admin write" ON production_rejects FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
CREATE INDEX idx_production_rejects_run ON production_rejects(run_id);
CREATE INDEX idx_production_rejects_reason ON production_rejects(reject_reason);

-- Outbound from the Assemblers facility (Shipment sheet). DISTINCT from the
-- existing PO-level `shipments` table — these are pallet/lot-level rows tagged
-- with a facility shipment#, and ship_to includes non-retailer destinations
-- (COMPACTOR for waste disposal, freight handlers). Ship Order ID is the
-- linkable key into NetSuite/PO when ship_to = DOT FOODS; null otherwise.
CREATE TABLE lot_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_number text,                   -- "4815846" (facility shipment)
  ship_order_id text,                     -- "4262458" (links to NetSuite PO)
  ship_date date,
  ship_to text,                           -- "DOT FOODS", "COMPACTOR", ...
  item_code text,
  item_description text,
  lot_code text,
  expiry_date date,
  base_quantity numeric,
  base_unit text,                         -- "eaches" / "pounds"
  case_quantity numeric,
  case_unit text,                         -- "cases" / "Roll"
  source_upload_id uuid REFERENCES upload_log(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE lot_shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON lot_shipments FOR SELECT USING (true);
CREATE POLICY "Ops/admin write" ON lot_shipments FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
CREATE INDEX idx_lot_shipments_lot ON lot_shipments(lot_code);
CREATE INDEX idx_lot_shipments_ship_order ON lot_shipments(ship_order_id);
CREATE INDEX idx_lot_shipments_shipment ON lot_shipments(shipment_number);
