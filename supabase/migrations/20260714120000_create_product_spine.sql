-- Cookie Central — Product spine (the Cookulator / Spec Sheet model)
--
-- Phase 1, Task 1.1 of the Spec Sheet + Sample Central extension. Creates the
-- five-level product spine that REPLACES the legacy finished-goods `products`
-- table (see docs/DECISIONS.md ADR-024):
--
--   products      — the cookie atom (BOM base); one row per cookie
--   eaches        — retail consumer sell-units (register-scanned; carry a UPC)
--   inners        — inner cases (grouping of eaches)
--   master_cases  — the sellable CPG unit (composed of eaches | inners | cookies)
--   stuffings     — filling reference
--
-- Columns follow docs/DATA_MODEL_ADDITIONS.md, reconciled against the real
-- prototype data (prototype/cookulator_prototype.html). RLS mirrors the
-- existing role pattern: all authenticated read; admin/ops write (matches
-- raw_materials / po_line_items write policies).
--
-- THE ONE RULE — derived values are never stored:
--   * cookie/case STORAGE is derived from prep (Baked→Ambient, Raw→Frozen) —
--     no storage column anywhere; computed in the app / price_list view.
--   * master_case NET WEIGHT rolls down through composition to cookie dough_oz —
--     NOT stored. Only net_wt_manual (the human-entered sheet figure) is kept.
--
-- Naming collision: the legacy finished-goods table is also named `products`.
-- We rename it to `products_legacy` here to free the name; its FKs
-- (po_line_items / dot_inventory / bill_of_materials .product_id) follow the
-- rename automatically and are all UNPOPULATED. The legacy table + its dead
-- FKs are dropped last, after re-point, in *_drop_finished_goods.sql (Task 1.5).
-- Data is demo/disposable — this is a clean replacement, not a data migration.
--
-- Forward-only; applied manually via the Supabase SQL editor.

-- ── 0. Free the `products` name: rename the legacy finished-goods table ──────
-- Guarded so a re-run is a no-op: only fires while `products` is still the
-- legacy shape (has a `sku` column) and `products_legacy` doesn't exist yet.
DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'sku'
      )
     AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'products_legacy'
      )
  THEN
    ALTER TABLE products RENAME TO products_legacy;
  END IF;
END $$;

-- ── 1. products — the cookie atom (BOM base) ────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,             -- e.g. 'CCH-3OZ-BAK-C' — FK target everywhere
  description text,                      -- full description; display name for both modules
  flavor text,
  outer_cookie text,
  stuffing text,                         -- free-text filling name (see stuffings ref)
  tier text,                             -- Gourmet | Classic (source-of-truth = dough; stored here until the WIP layer is modeled)
  form text,                             -- Stuffed | Shot
  prep text,                             -- Baked | Raw  (drives derived storage)
  dough_oz numeric,                      -- dough oz per cookie (consumption factor)
  wip_dough text,                        -- production-dough name (WIP layer link; text until modeled)
  allergens text,
  ingredients text,
  nutrition text,
  sample_eligible boolean NOT NULL DEFAULT false,  -- the bridge to Sample Central
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read" ON products;
CREATE POLICY "All can read" ON products FOR SELECT USING (true);
DROP POLICY IF EXISTS "Ops/admin insert" ON products;
CREATE POLICY "Ops/admin insert" ON products FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
DROP POLICY IF EXISTS "Ops/admin update" ON products;
CREATE POLICY "Ops/admin update" ON products FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
DROP POLICY IF EXISTS "Ops/admin delete" ON products;
CREATE POLICY "Ops/admin delete" ON products FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

-- ── 2. stuffings — filling reference ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stuffings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stuffing_id text UNIQUE NOT NULL,      -- e.g. 'ST-03'
  name text,
  type text,                             -- 'Filling'
  no_flex boolean NOT NULL DEFAULT false,-- true = no substitution allowed (e.g. vanilla extract)
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE stuffings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read" ON stuffings;
CREATE POLICY "All can read" ON stuffings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Ops/admin insert" ON stuffings;
CREATE POLICY "Ops/admin insert" ON stuffings FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
DROP POLICY IF EXISTS "Ops/admin update" ON stuffings;
CREATE POLICY "Ops/admin update" ON stuffings FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
DROP POLICY IF EXISTS "Ops/admin delete" ON stuffings;
CREATE POLICY "Ops/admin delete" ON stuffings FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

-- ── 3. eaches — retail consumer sell-units ──────────────────────────────────
CREATE TABLE IF NOT EXISTS eaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  each_sku text UNIQUE NOT NULL,
  product_code text REFERENCES products(code),  -- the cookie this each holds
  each_upc text,
  cookies_per_each numeric,
  pack_type text,
  net_wt text,                           -- descriptive, e.g. '12oz (4 x 3oz)'
  brand text,
  retail_price numeric,                  -- nullable = TBD
  length_in numeric,
  width_in numeric,
  height_in numeric,
  gross_wt_oz numeric,
  sample_eligible boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE eaches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read" ON eaches;
CREATE POLICY "All can read" ON eaches FOR SELECT USING (true);
DROP POLICY IF EXISTS "Ops/admin insert" ON eaches;
CREATE POLICY "Ops/admin insert" ON eaches FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
DROP POLICY IF EXISTS "Ops/admin update" ON eaches;
CREATE POLICY "Ops/admin update" ON eaches FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
DROP POLICY IF EXISTS "Ops/admin delete" ON eaches;
CREATE POLICY "Ops/admin delete" ON eaches FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

-- ── 4. inners — inner cases ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inner_sku text UNIQUE NOT NULL,
  name text,
  each_sku text REFERENCES eaches(each_sku),  -- nullable (not every inner is tied to a retail each)
  eaches_per_inner numeric,
  sellable boolean,
  upc text,
  gtin14 text,
  sample_eligible boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE inners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read" ON inners;
CREATE POLICY "All can read" ON inners FOR SELECT USING (true);
DROP POLICY IF EXISTS "Ops/admin insert" ON inners;
CREATE POLICY "Ops/admin insert" ON inners FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
DROP POLICY IF EXISTS "Ops/admin update" ON inners;
CREATE POLICY "Ops/admin update" ON inners FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
DROP POLICY IF EXISTS "Ops/admin delete" ON inners;
CREATE POLICY "Ops/admin delete" ON inners FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

-- ── 5. master_cases — the sellable CPG unit ─────────────────────────────────
-- composed_of + unit_ref is a POLYMORPHIC reference (unit_ref points at an
-- eaches.each_sku, inners.inner_sku, or products.code depending on composed_of),
-- so it's intentionally a plain text column, not a single FK.
CREATE TABLE IF NOT EXISTS master_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id text UNIQUE NOT NULL,
  name text,
  status text,
  composed_of text CHECK (composed_of IN ('eaches', 'inners', 'cookies')),
  unit_ref text,                         -- polymorphic ref into the composed level's code
  unit_qty int,
  channel text,
  gtin14 text,
  product_sku text,
  -- manual packaging
  length_in numeric,
  width_in numeric,
  height_in numeric,
  gross_wt_lb numeric,
  cube_cuft numeric,
  net_wt_manual numeric,                 -- the spec-sheet figure (explicitly manual; net weight is otherwise DERIVED and never stored)
  storage_override text,                 -- rare per-case override of the derived storage
  -- pallet
  ti int,
  hi int,
  cases_per_pallet numeric,
  pallet_size text,
  pallet_weight_lb numeric,
  loading_height_in numeric,
  shelf_life text,
  country text,
  sample_eligible boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE master_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read" ON master_cases;
CREATE POLICY "All can read" ON master_cases FOR SELECT USING (true);
DROP POLICY IF EXISTS "Ops/admin insert" ON master_cases;
CREATE POLICY "Ops/admin insert" ON master_cases FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
DROP POLICY IF EXISTS "Ops/admin update" ON master_cases;
CREATE POLICY "Ops/admin update" ON master_cases FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
DROP POLICY IF EXISTS "Ops/admin delete" ON master_cases;
CREATE POLICY "Ops/admin delete" ON master_cases FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

-- ── 6. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_eaches_product_code ON eaches(product_code);
CREATE INDEX IF NOT EXISTS idx_inners_each_sku ON inners(each_sku);
CREATE INDEX IF NOT EXISTS idx_master_cases_unit_ref ON master_cases(unit_ref);
CREATE INDEX IF NOT EXISTS idx_master_cases_channel ON master_cases(channel);
CREATE INDEX IF NOT EXISTS idx_products_sample_eligible ON products(sample_eligible);

-- ── 7. updated_at triggers (reuse the existing update_updated_at() fn) ───────
DROP TRIGGER IF EXISTS set_updated_at_products ON products;
CREATE TRIGGER set_updated_at_products BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_eaches ON eaches;
CREATE TRIGGER set_updated_at_eaches BEFORE UPDATE ON eaches FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_inners ON inners;
CREATE TRIGGER set_updated_at_inners BEFORE UPDATE ON inners FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_master_cases ON master_cases;
CREATE TRIGGER set_updated_at_master_cases BEFORE UPDATE ON master_cases FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Verify:
--   select table_name from information_schema.tables
--     where table_schema='public'
--       and table_name in ('products','eaches','inners','master_cases','stuffings','products_legacy')
--     order by table_name;                       -- expect all 6 (products_legacy = renamed old FG)
--   select count(*) from products;               -- expect 0 until the reseed (Task 1.3)
--   -- confirm NO stored derived columns:
--   select column_name from information_schema.columns
--     where table_name='master_cases' and column_name in ('net_wt_lb','storage');  -- expect 0 rows
