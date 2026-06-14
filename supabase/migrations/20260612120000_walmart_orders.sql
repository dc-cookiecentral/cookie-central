-- Cookie Central — Cortina Walmart Orders support
--
-- Backs the walmartOrders.js parser + the gmail agent's 7th classification
-- ("walmart_orders"). This NetSuite daily export (one row per SKU × Walmart DC,
-- grouped into a purchase_order per Document Number / SO####) is the primary
-- source for Product Orders and Payments — it replaces the Cortina PO PDF upload.
--
-- Bundles:
--   1. purchase_orders identity columns (Cortina SO #, Walmart PO #, received date)
--   2. po_line_items columns (Cortina item #, UPC, Walmart unit price, store UPC,
--      destination DC) + a metadata jsonb for the warehouse/appointment fields
--   3. ship_status 'partial' (a PO can be part-delivered across its DCs)
--   4. cortina_invoices table (invoice + payment, one per SO) + RLS
--   5. upload_log + gmail_messages CHECK constraints extended for walmart_orders
--
-- NOT auto-deployed — paste into the Supabase SQL editor (RUNBOOK §7).

-- 1. purchase_orders identity columns -----------------------------------------
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cortina_so_number text UNIQUE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS walmart_po_number text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cortina_received_date date;
CREATE INDEX IF NOT EXISTS idx_po_cortina_so ON purchase_orders(cortina_so_number);
CREATE INDEX IF NOT EXISTS idx_po_walmart_po ON purchase_orders(walmart_po_number);

-- 3. ship_status 'partial' — some line items (DCs) delivered, others not yet.
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_ship_status_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_ship_status_check
  CHECK (ship_status IN ('pending', 'partial', 'shipped', 'delivered'));

-- 2. po_line_items columns ----------------------------------------------------
ALTER TABLE po_line_items ADD COLUMN IF NOT EXISTS cortina_item_number text;
ALTER TABLE po_line_items ADD COLUMN IF NOT EXISTS upc text;
ALTER TABLE po_line_items ADD COLUMN IF NOT EXISTS walmart_unit_price numeric;
ALTER TABLE po_line_items ADD COLUMN IF NOT EXISTS store_upc text;
ALTER TABLE po_line_items ADD COLUMN IF NOT EXISTS destination_dc text;
-- Warehouse / delivery-appointment fields (mostly empty in the export today) +
-- per-line invoice ref + actual delivery date live here so the flat schema
-- doesn't sprout a dozen sparse columns.
ALTER TABLE po_line_items ADD COLUMN IF NOT EXISTS metadata jsonb;

-- 4. cortina_invoices (Stage 1: Cortina → DC) ---------------------------------
CREATE TABLE IF NOT EXISTS cortina_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  invoice_number text UNIQUE,
  invoice_date date,
  invoice_terms int,
  invoice_amount numeric,
  payment_document text,
  payment_date date,
  source_upload_id uuid REFERENCES upload_log(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE cortina_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read" ON cortina_invoices;
CREATE POLICY "All can read" ON cortina_invoices FOR SELECT USING (true);
DROP POLICY IF EXISTS "Ops/admin write" ON cortina_invoices;
CREATE POLICY "Ops/admin write" ON cortina_invoices FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
CREATE INDEX IF NOT EXISTS idx_cortina_invoices_po ON cortina_invoices(po_id);

-- 5. upload_log type + gmail_messages classification --------------------------
ALTER TABLE upload_log DROP CONSTRAINT IF EXISTS upload_log_upload_type_check;
ALTER TABLE upload_log ADD CONSTRAINT upload_log_upload_type_check
  CHECK (upload_type IN ('dot','assemblers','production','qbo','netsuite',
    'weekly_report','cortina_po','ingredient_master','walmart_orders'));

ALTER TABLE gmail_messages DROP CONSTRAINT IF EXISTS gmail_messages_classification_check;
ALTER TABLE gmail_messages ADD CONSTRAINT gmail_messages_classification_check
  CHECK (classification IN ('PO', 'BOL', 'supplier_confirmation',
    'assemblers_report', 'weekly_report', 'walmart_orders', 'other'));

-- Verify:
--   select column_name from information_schema.columns
--     where table_name='purchase_orders'
--       and column_name in ('cortina_so_number','walmart_po_number','cortina_received_date');
--   select count(*) from cortina_invoices;
