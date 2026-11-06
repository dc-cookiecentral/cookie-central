-- Cookie Central — DOT outbound shipments, from DOT's "Consignment Sales
-- History" export (first copy received 2026-11-05).
--
-- One row per DOT order line: a Walmart PO × item that DOT shipped (or cut)
-- to a Walmart GDC, with the quantity ORDERED and the quantity RECEIVED.
-- Parsed by src/parsers/dotConsignmentSales.js.
--
-- ── Why it matters ────────────────────────────────────────────────────────
-- It is the UNFILTERED, ITEM-LEVEL outbound record the planner did not have:
--   · dot_order_history (DOT "Order History") is exception-filtered — every
--     row carries a cut — and has no item column (KNOWN_ISSUES, ADR-059).
--   · NetSuite (po_line_items) records the POST-cut quantity: on the first
--     file, NetSuite's PO quantity equals this file's RECEIVED on 561 of 566
--     POs. The original ask, and so the cut, exists only here.
-- First file: 620 lines, 566 POs, order dates Aug 24 – Oct 26 2026; 20,512 cs
-- ordered, 15,777 received; BC 57% filled. Ordered cases reproduce Retail
-- Link OTIF's cases ordered exactly for its first three weeks.
--
-- ── Key ───────────────────────────────────────────────────────────────────
-- (dot_order_number, item_number). NOT (customer_po, item): DOT re-places a
-- cut PO as a NEW DOT order — PO 0112957696 was cut 42 → 0 on DOT order
-- 3266700 and shipped in full on 4355664. Readers that total cuts must group
-- by customer_po + item first (see useDemandFeeds), or a recovered cut counts
-- as lost.
--
-- ── Quantities are CASES ──────────────────────────────────────────────────
-- 9 lb net per 12-count dough case; BC ~4.4 lb. "Quantity Received" is DOT's
-- shipped/settled quantity — it matches NetSuite's delivered — not a Walmart
-- receiving confirmation.
--
-- Forward-only.

CREATE TABLE IF NOT EXISTS dot_consignment_sales (
  dot_order_number      text NOT NULL,          -- "Customer Order Number" (DOT's order)
  item_number           text NOT NULL,          -- Walmart prime item ("Customer Item Number")
  sequence_number       int,
  sku                   text,                   -- WC | PBG | CCF | BC (null if unmapped)
  customer_po           text,                   -- Walmart PO, leading zeros kept
  order_date            date,
  ship_date             date,                   -- "Detail Establish Date"
  ship_week             int,                    -- Walmart week holding ship_date
  order_week            int,                    -- Walmart week holding order_date

  ordered_cases         numeric NOT NULL DEFAULT 0,
  received_cases        numeric NOT NULL DEFAULT 0,
  gross_weight_lb       numeric,
  net_weight_lb         numeric,
  unit_charge           numeric,                -- "Customer Unit Charge"

  dot_item_number       text,
  gtin                  text,
  product_line          text,                   -- 3670 Ref / 3888 Dry
  item_description      text,
  dest_customer_number  text,
  dest_name             text,                   -- e.g. "Walmart/Gdc #7055"
  dest_city             text,
  dest_state            text,
  load_number           text,
  stop_number           int,

  upload_id             uuid REFERENCES upload_log(id),
  updated_at            timestamptz DEFAULT now(),
  PRIMARY KEY (dot_order_number, item_number)
);
CREATE INDEX IF NOT EXISTS idx_dcs_ship_week ON dot_consignment_sales (ship_week);
CREATE INDEX IF NOT EXISTS idx_dcs_po ON dot_consignment_sales (customer_po);

ALTER TABLE dot_consignment_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON dot_consignment_sales FOR SELECT USING (true);
CREATE POLICY "Internal write" ON dot_consignment_sales FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles
                  WHERE id = auth.uid() AND role IN ('admin','finance','ops')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles
                  WHERE id = auth.uid() AND role IN ('admin','finance','ops')));

-- ── upload_log: allow upload_type='dot_consignment_sales' ─────────────────
ALTER TABLE upload_log DROP CONSTRAINT IF EXISTS upload_log_upload_type_check;
ALTER TABLE upload_log ADD CONSTRAINT upload_log_upload_type_check
  CHECK (upload_type IN ('dot','assemblers','production','qbo','netsuite','weekly_report',
                         'cortina_po','ingredient_master','walmart_orders',
                         'retail_link','retail_link_otif','retail_link_supply_plan',
                         'dot_order_history','dot_inventory_snapshot',
                         'dot_consignment_sales'));
