-- Cookie Central — Walmart SQEP defects, from the "SQEP Total Compliance
-- Table" CSV export (first copies received 2026-11-09). Parsed by
-- src/parsers/walmartSqep.js, upload cards 10 (projected) and 11 (invoiced).
--
-- ── What it is ────────────────────────────────────────────────────────────
-- One row per SQEP defect Walmart recorded against a PO: defect category
-- (ASN COMPLIANCE, PO line accuracy, case / packaging / pallet / load
-- compliance), defect type and sub-type, PO and OMS PO, DC and network,
-- item and ticket (NA for ASN defects), and the charge.
-- The same export comes PROJECTED ("Potential Charge ($)", not yet billed,
-- still disputable) or INVOICED ("Invoiced Charge ($)", on the monthly SQEP
-- bill). Both are stored, told apart by charge_status, so projected vs
-- invoiced can be compared defect by defect.
-- First files: projected wk 202640, 62 ASN defects, $1,378.40; invoiced wk
-- 202635, 55 ASN defects, $1,375.00. Every PO matched DOT's shipments.
--
-- ⚠️ po_number is stored as Walmart gives it: GDC POs are 9 digits here,
-- 10 (zero-padded) in DOT / OTIF. lpad(po_number, 10, '0') to join.
-- ⚠️ The supplier on these rows is 127224 NATIONAL FOOD TRADING CORP.
--
-- ── Key ───────────────────────────────────────────────────────────────────
-- charge_status × PO × category × type × sub-type × item × ticket ×
-- occurrence (the nth identical defect within one file). Empty values are ''
-- not NULL so the key holds. Re-pulls and overlapping ranges UPSERT.
--
-- Forward-only.

CREATE TABLE IF NOT EXISTS walmart_sqep_defects (
  charge_status          text NOT NULL CHECK (charge_status IN ('projected','invoiced')),
  defect_category        text NOT NULL DEFAULT '',   -- e.g. ASN COMPLIANCE
  defect_type            text NOT NULL DEFAULT '',   -- e.g. NO ASN RECEIVED
  defect_sub_type        text NOT NULL DEFAULT '',
  po_number              text NOT NULL,              -- as given; 9 digits for GDC POs
  oms_po_number          text,
  item_number            text NOT NULL DEFAULT '',
  ticket_number          text NOT NULL DEFAULT '',
  occurrence             int  NOT NULL DEFAULT 1,

  processed_date         date,
  walmart_week           int NOT NULL,               -- "WMT Week", e.g. 202640
  wmt_month              text,                       -- "NOV FYE 27"
  business_area          text,
  supplier_6digit        text,                       -- "127224 - NATIONAL FOOD TRADING CORP."
  supplier_9digit        text,
  merch_alignment        text,
  sbu                    text,
  department             text,                       -- "90 - DAIRY" | "95 - SNACKS AND BEVERAGES"
  category               text,
  category_desc          text,
  item_desc              text,
  vendor_stock_number    text,
  case_gtin              text,
  brand_id               text,
  brand_type             text,
  buyer_id               text,
  network                text,                       -- GDC | RDC
  dc_number              text,
  applicable_for_score   boolean,
  applicable_for_charge  boolean,
  charge                 numeric,                    -- potential or invoiced, per charge_status

  upload_id              uuid REFERENCES upload_log(id),
  first_seen_at          timestamptz DEFAULT now(),
  last_seen_at           timestamptz DEFAULT now(),
  PRIMARY KEY (charge_status, po_number, defect_category, defect_type, defect_sub_type, item_number, ticket_number, occurrence)
);
CREATE INDEX IF NOT EXISTS idx_sqep_week ON walmart_sqep_defects (walmart_week);
CREATE INDEX IF NOT EXISTS idx_sqep_po ON walmart_sqep_defects (po_number);

ALTER TABLE walmart_sqep_defects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON walmart_sqep_defects FOR SELECT USING (true);
CREATE POLICY "Internal write" ON walmart_sqep_defects FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles
                  WHERE id = auth.uid() AND role IN ('admin','finance','ops')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles
                  WHERE id = auth.uid() AND role IN ('admin','finance','ops')));

-- ── upload_log: allow upload_type='walmart_sqep' ──────────────────────────
ALTER TABLE upload_log DROP CONSTRAINT IF EXISTS upload_log_upload_type_check;
ALTER TABLE upload_log ADD CONSTRAINT upload_log_upload_type_check
  CHECK (upload_type IN ('dot','assemblers','production','qbo','netsuite','weekly_report',
                         'cortina_po','ingredient_master','walmart_orders',
                         'retail_link','retail_link_otif','retail_link_supply_plan',
                         'dot_order_history','dot_inventory_snapshot',
                         'dot_consignment_sales','dot_customer_orders',
                         'walmart_sqep'));
