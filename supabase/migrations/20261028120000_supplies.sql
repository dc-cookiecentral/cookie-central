-- Cookie Central — Supplies & Vendors (Phase V1: read-only catalogue)
--
-- docs/SUPPLIES_SPEC.md §V1.1. Records every ingredient and packaging
-- component, who sells it, at what price and terms, with the original
-- quote/invoice PDFs in the private `supply-docs` bucket.
--
--   vendors          — one row per supplier (rolodex)
--   vendor_contacts  — people at a vendor
--   supply_items     — 'Light Brown Sugar', 'SRP Case — 8-CT', … (what we buy)
--   supply_skus      — brand/SKU at a vendor; pricing attaches here
--   quotes           — a quote, PO, invoice or verbal price point
--   quote_breaks     — qty → price rows inside a quote
--   v_sku_pricing    — derived $/lb and $/1,000. NEVER stored, always computed.
--
-- Deliberately separate from ingredient_catalog / ingredient_suppliers (the
-- Jun 2026 Assembler-sheet import behind /reference): those stay untouched.
-- The supplies seed re-imports the same sheet rows into this model.
--
-- Columns added beyond the spec's draft DDL (all nullable):
--   supply_skus.vendor_item_code     — the vendor's own code (Batory 101575, McCormick FG0410)
--   supply_skus.units_per_order_unit — packaging pieces per order unit (film roll = 3,500),
--                                      needed to derive $/1,000 when the order unit isn't 'each'
--   quotes.doc_ref                   — PL 30378, PO SP026-2026, SO-1758307 …
--
-- Read = internal roles (admin/finance/ops — NOT cortina: this is vendor
-- pricing). Write = admin/ops. Every table carries a field-level audit trigger.
--
-- Verify:
--   SELECT count(*) FROM vendors; SELECT count(*) FROM supply_items;
--   SELECT * FROM v_sku_pricing WHERE item_name = 'Light Brown Sugar';

-- ── tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('raw', 'packaging', 'equipment', 'services')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'prospect')),
  address text,
  website text,
  phone_main text,
  account_number text,
  fob text,
  default_terms text,
  freight_notes text,
  billing_entity text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendor_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  phone_office text,
  phone_cell text,
  email text,
  is_primary boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vendor_contacts_vendor ON vendor_contacts(vendor_id);

CREATE TABLE IF NOT EXISTS supply_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('ingredient', 'packaging')),
  primary_vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supply_skus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES supply_items(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  brand_name text,
  item_code text,                        -- DC ERP code (116070, 120005 …) when known
  vendor_item_code text,
  order_unit text NOT NULL,              -- '50 lb bag', '35 lb pail', 'each', 'roll (3,500)'
  unit_weight_lbs numeric,               -- lbs per order unit; null for packaging
  units_per_order_unit numeric,          -- pieces per order unit; packaging only
  units_per_thousand boolean DEFAULT false,  -- packaging priced per 1,000
  spec_note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supply_skus_item ON supply_skus(item_id);
CREATE INDEX IF NOT EXISTS idx_supply_skus_vendor ON supply_skus(vendor_id);

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id uuid NOT NULL REFERENCES supply_skus(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  doc_type text NOT NULL CHECK (doc_type IN ('quote', 'invoice', 'po', 'verbal')),
  doc_ref text,
  doc_date date,
  valid_until date,
  moq text,
  lead_time text,
  terms text,
  one_time_costs text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'expired', 'closed', 'on_po', 'preliminary')),
  notes text,
  doc_path text,                         -- object path in storage bucket 'supply-docs'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quotes_sku ON quotes(sku_id);

CREATE TABLE IF NOT EXISTS quote_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  qty numeric NOT NULL,                  -- order quantity (in order units) the price applies to
  price_per_order_qty numeric NOT NULL,  -- total price for that qty
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quote_breaks_quote ON quote_breaks(quote_id);

-- ── RLS: internal read, admin/ops write ─────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendors','vendor_contacts','supply_items','supply_skus','quotes','quote_breaks'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "Internal read" ON %I', t);
    EXECUTE format($p$CREATE POLICY "Internal read" ON %I FOR SELECT USING (
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops'))
    )$p$, t);

    EXECUTE format('DROP POLICY IF EXISTS "Ops/admin insert" ON %I', t);
    EXECUTE format($p$CREATE POLICY "Ops/admin insert" ON %I FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
    )$p$, t);

    EXECUTE format('DROP POLICY IF EXISTS "Ops/admin update" ON %I', t);
    EXECUTE format($p$CREATE POLICY "Ops/admin update" ON %I FOR UPDATE USING (
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
    )$p$, t);

    EXECUTE format('DROP POLICY IF EXISTS "Ops/admin delete" ON %I', t);
    EXECUTE format($p$CREATE POLICY "Ops/admin delete" ON %I FOR DELETE USING (
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
    )$p$, t);
  END LOOP;
END $$;

-- ── field-level audit + updated_at ──────────────────────────────────────────
-- AFTER trigger, so an INSERT … ON CONFLICT DO UPDATE that lands as an update
-- logs only the columns that actually changed (a no-op seed re-run logs
-- nothing). INSERT/DELETE log one row; UPDATE logs one row per changed column,
-- updated_at excluded. Same audit_log shape as log_po_changes().
CREATE OR REPLACE FUNCTION log_supplies_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o jsonb;
  n jsonb;
  k text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (user_id, table_name, record_id, action)
    VALUES (auth.uid(), TG_TABLE_NAME, NEW.id, 'INSERT');
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (user_id, table_name, record_id, action, old_value)
    VALUES (auth.uid(), TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD)::text);
  ELSE
    o := to_jsonb(OLD);
    n := to_jsonb(NEW);
    FOR k IN SELECT jsonb_object_keys(n) LOOP
      IF k <> 'updated_at' AND (o -> k) IS DISTINCT FROM (n -> k) THEN
        INSERT INTO audit_log (user_id, table_name, record_id, action, field_name, old_value, new_value)
        VALUES (auth.uid(), TG_TABLE_NAME, NEW.id, 'UPDATE', k, o ->> k, n ->> k);
      END IF;
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendors','vendor_contacts','supply_items','supply_skus','quotes','quote_breaks'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON %1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION log_supplies_changes()', t);
    IF t <> 'quote_breaks' THEN
      EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at_%1$s ON %1$I', t);
      EXECUTE format('CREATE TRIGGER set_updated_at_%1$s BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t);
    END IF;
  END LOOP;
END $$;

-- ── v_sku_pricing: one row per price break, derived prices computed ─────────
--   ingredients: price_per_lb       = price / (qty × unit_weight_lbs)
--   packaging:   price_per_unit     = price / (qty × units_per_order_unit)
--                price_per_thousand = price_per_unit × 1000 (when units_per_thousand)
-- Quotes with no breaks still appear (break columns null) so their dates,
-- terms and documents are visible.
DROP VIEW IF EXISTS v_sku_pricing;
CREATE VIEW v_sku_pricing
  WITH (security_invoker = true) AS
SELECT
  s.id                      AS sku_id,
  i.id                      AS item_id,
  i.name                    AS item_name,
  i.kind,
  v.id                      AS vendor_id,
  v.name                    AS vendor_name,
  s.brand_name,
  s.item_code,
  s.vendor_item_code,
  s.order_unit,
  s.unit_weight_lbs,
  s.units_per_order_unit,
  s.units_per_thousand,
  q.id                      AS quote_id,
  q.doc_type,
  q.doc_ref,
  q.doc_date,
  q.valid_until,
  q.status                  AS quote_status,
  q.doc_path,
  b.id                      AS break_id,
  b.qty,
  b.price_per_order_qty,
  CASE WHEN b.qty > 0 THEN round(b.price_per_order_qty / b.qty, 4) END
                            AS price_per_order_unit,
  CASE WHEN i.kind = 'ingredient' AND b.qty > 0 AND s.unit_weight_lbs > 0
       THEN round(b.price_per_order_qty / (b.qty * s.unit_weight_lbs), 4) END
                            AS price_per_lb,
  CASE WHEN i.kind = 'packaging' AND b.qty > 0
       THEN round(b.price_per_order_qty / (b.qty * coalesce(s.units_per_order_unit, 1)), 5) END
                            AS price_per_unit,
  CASE WHEN i.kind = 'packaging' AND s.units_per_thousand AND b.qty > 0
       THEN round(1000 * b.price_per_order_qty / (b.qty * coalesce(s.units_per_order_unit, 1)), 2) END
                            AS price_per_thousand
FROM supply_skus s
JOIN supply_items i ON i.id = s.item_id
LEFT JOIN vendors v ON v.id = s.vendor_id
LEFT JOIN quotes q ON q.sku_id = s.id
LEFT JOIN quote_breaks b ON b.quote_id = q.id;

-- ── storage: private 'supply-docs' bucket ───────────────────────────────────
-- Private (vendor pricing): the app opens docs through short-lived signed URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('supply-docs', 'supply-docs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "supply-docs internal read" ON storage.objects;
CREATE POLICY "supply-docs internal read" ON storage.objects FOR SELECT USING (
  bucket_id = 'supply-docs'
  AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops'))
);
DROP POLICY IF EXISTS "supply-docs ops/admin insert" ON storage.objects;
CREATE POLICY "supply-docs ops/admin insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'supply-docs'
  AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
DROP POLICY IF EXISTS "supply-docs ops/admin update" ON storage.objects;
CREATE POLICY "supply-docs ops/admin update" ON storage.objects FOR UPDATE USING (
  bucket_id = 'supply-docs'
  AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
DROP POLICY IF EXISTS "supply-docs ops/admin delete" ON storage.objects;
CREATE POLICY "supply-docs ops/admin delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'supply-docs'
  AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
