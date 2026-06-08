-- Cookie Central — Ingredient Master (catalog) tables.
--
-- A bulk sourcing catalog imported from the Assembler ingredient sheet:
--   ingredient_catalog   — one row per normalized ingredient name (47).
--   ingredient_suppliers — one row per ingredient × distributor × brand (91),
--                          linked to ingredient_catalog via ingredient_id.
--
-- DELIBERATELY SEPARATE from raw_materials / raw_material_suppliers (the live
-- Assemblers inventory feed). Those use SKU-style lot names and are referenced
-- by lots/orders/adjustments/BoM; the catalog uses clean normalized names and
-- only ~4/47 overlap. Keeping them apart gives the catalog exact 47/91 counts
-- without polluting or destroying inventory data.
--
-- Idempotent (IF NOT EXISTS / DROP … IF EXISTS) per the repo's push convention:
-- objects may pre-exist out-of-band.

-- ── ingredient_catalog ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingredient_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  unit text,
  category text DEFAULT 'raw_material',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE ingredient_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All can read" ON ingredient_catalog;
CREATE POLICY "All can read" ON ingredient_catalog FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authorized insert" ON ingredient_catalog;
CREATE POLICY "Authorized insert" ON ingredient_catalog FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops'))
);

DROP POLICY IF EXISTS "Authorized update" ON ingredient_catalog;
CREATE POLICY "Authorized update" ON ingredient_catalog FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops'))
);

DROP POLICY IF EXISTS "Authorized delete" ON ingredient_catalog;
CREATE POLICY "Authorized delete" ON ingredient_catalog FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops'))
);

-- ── ingredient_suppliers ────────────────────────────────────────────────────
-- moq is TEXT: the source MOQ column is free-form ("Pallet", "FTL", "9 Pallets",
-- "200000", "Truckload"), not a number. Likewise lead time / shelf life are kept
-- verbatim as *_text. cost (per package) and cost_per_unit are both retained.
CREATE TABLE IF NOT EXISTS ingredient_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid REFERENCES ingredient_catalog(id) ON DELETE CASCADE,
  brand text,
  dc_item_number text,
  supplier_number text,
  distributor text,
  pkg_type text,
  qty_per_package numeric,
  unit text,
  cost numeric,
  cost_per_unit numeric,
  priority text,
  product_line text,
  lead_time_text text,
  shelf_life_text text,
  moq text,
  terms text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE ingredient_suppliers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ing_suppliers_ingredient ON ingredient_suppliers(ingredient_id);

DROP POLICY IF EXISTS "All can read" ON ingredient_suppliers;
CREATE POLICY "All can read" ON ingredient_suppliers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authorized insert" ON ingredient_suppliers;
CREATE POLICY "Authorized insert" ON ingredient_suppliers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops'))
);

DROP POLICY IF EXISTS "Authorized update" ON ingredient_suppliers;
CREATE POLICY "Authorized update" ON ingredient_suppliers FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops'))
);

DROP POLICY IF EXISTS "Authorized delete" ON ingredient_suppliers;
CREATE POLICY "Authorized delete" ON ingredient_suppliers FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops'))
);

-- updated_at triggers (reuse the shared helper from the initial schema).
DROP TRIGGER IF EXISTS set_updated_at_ingredient_catalog ON ingredient_catalog;
CREATE TRIGGER set_updated_at_ingredient_catalog BEFORE UPDATE ON ingredient_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_ingredient_suppliers ON ingredient_suppliers;
CREATE TRIGGER set_updated_at_ingredient_suppliers BEFORE UPDATE ON ingredient_suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── upload_log: allow upload_type='ingredient_master' ───────────────────────
ALTER TABLE upload_log DROP CONSTRAINT IF EXISTS upload_log_upload_type_check;
ALTER TABLE upload_log ADD CONSTRAINT upload_log_upload_type_check
  CHECK (upload_type IN ('dot','assemblers','production','qbo','netsuite','weekly_report','cortina_po','ingredient_master'));
