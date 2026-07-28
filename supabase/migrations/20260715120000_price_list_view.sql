-- Cookie Central — Price list (thin prices table + composition VIEW)
--
-- Phase 1, Task 1.2 of the Spec Sheet + Sample Central extension. Depends on
-- the product spine (20260714120000_create_product_spine.sql).
--
--   product_prices — the ONLY stored pricing. One row per (master_case, channel)
--                    price point. list_price NULL = TBD.
--   price_list     — a VIEW (never a table). One row per master_case, with every
--                    displayed column pulled LIVE through the composition chain
--                    (master_case -> inner? -> each? -> cookie) plus the price.
--                    Net weight + storage are DERIVED here, never stored.
--
-- Pricing is finance/admin-writable (matches the pricing-change rule + the legacy
-- products "Finance/admin update" policy). The view is all-readable.
--
-- Forward-only; applied manually via the Supabase SQL editor.

-- ── 1. product_prices — the only stored pricing ─────────────────────────────
CREATE TABLE IF NOT EXISTS product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_case_id uuid REFERENCES master_cases(id) ON DELETE CASCADE,
  channel text,
  list_price numeric,                    -- NULL = TBD
  currency text DEFAULT 'USD',
  effective_from date,
  effective_to date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE product_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read" ON product_prices;
CREATE POLICY "All can read" ON product_prices FOR SELECT USING (true);
DROP POLICY IF EXISTS "Finance/admin insert" ON product_prices;
CREATE POLICY "Finance/admin insert" ON product_prices FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance'))
);
DROP POLICY IF EXISTS "Finance/admin update" ON product_prices;
CREATE POLICY "Finance/admin update" ON product_prices FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance'))
);
DROP POLICY IF EXISTS "Finance/admin delete" ON product_prices;
CREATE POLICY "Finance/admin delete" ON product_prices FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance'))
);

CREATE INDEX IF NOT EXISTS idx_product_prices_master_case ON product_prices(master_case_id);

DROP TRIGGER IF EXISTS set_updated_at_product_prices ON product_prices;
CREATE TRIGGER set_updated_at_product_prices BEFORE UPDATE ON product_prices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 2. price_list — the composition VIEW ────────────────────────────────────
-- Polymorphic composition resolved via guarded LEFT JOINs:
--   composed_of='cookies' -> cookie = products WHERE code = unit_ref
--   composed_of='eaches'  -> each   = eaches   WHERE each_sku = unit_ref -> cookie
--   composed_of='inners'  -> inner  = inners   WHERE inner_sku = unit_ref -> each -> cookie
-- Derived net weight rolls DOWN to cookie dough_oz; a NULL factor yields NULL
-- (renders TBD). Storage derives from cookie prep (Raw->Frozen, else Ambient),
-- with storage_override winning.
DROP VIEW IF EXISTS price_list;
CREATE VIEW price_list
  WITH (security_invoker = true) AS
SELECT
  mc.id                                   AS master_case_id,
  mc.case_id,
  mc.name                                 AS case_name,
  mc.status,
  mc.channel,
  mc.composed_of,
  mc.unit_ref,
  mc.unit_qty,
  mc.gtin14,
  mc.product_sku,
  mc.length_in,
  mc.width_in,
  mc.height_in,
  mc.gross_wt_lb,
  mc.cube_cuft,
  mc.net_wt_manual,                       -- human-entered sheet figure (kept separate from derived)
  mc.ti,
  mc.hi,
  COALESCE(mc.cases_per_pallet, mc.ti * mc.hi) AS cases_per_pallet,
  mc.pallet_size,
  mc.pallet_weight_lb,
  mc.loading_height_in,
  mc.shelf_life,
  mc.country,
  mc.sample_eligible                      AS case_sample_eligible,

  -- resolved EACH level (direct, or via the inner)
  e.each_sku,
  e.each_upc,
  e.pack_type,
  e.brand,
  e.retail_price,
  e.cookies_per_each,

  -- resolved INNER level
  inr.inner_sku,
  inr.gtin14                              AS inner_gtin14,
  inr.eaches_per_inner,

  -- resolved COOKIE level (the BOM atom)
  ck.code                                 AS cookie_code,
  ck.description                          AS cookie_description,
  ck.flavor,
  ck.outer_cookie,
  ck.stuffing,
  ck.tier,
  ck.form,
  ck.dough_oz,
  ck.prep,
  ck.allergens,
  ck.ingredients,
  ck.nutrition,

  -- DERIVED storage (from prep; override wins)
  COALESCE(
    NULLIF(mc.storage_override, ''),
    CASE
      WHEN lower(ck.prep) = 'raw' THEN 'Frozen'
      WHEN ck.prep IS NOT NULL AND ck.prep <> '' THEN 'Ambient'
      ELSE NULL
    END
  )                                       AS storage,

  -- DERIVED net weight (rolls down to cookie dough_oz). NULL factor -> NULL (TBD).
  CASE mc.composed_of
    WHEN 'cookies' THEN mc.unit_qty * ck.dough_oz
    WHEN 'eaches'  THEN mc.unit_qty * e.cookies_per_each * ck.dough_oz
    WHEN 'inners'  THEN mc.unit_qty * inr.eaches_per_inner * e.cookies_per_each * ck.dough_oz
  END                                     AS net_wt_oz_derived,
  (CASE mc.composed_of
    WHEN 'cookies' THEN mc.unit_qty * ck.dough_oz
    WHEN 'eaches'  THEN mc.unit_qty * e.cookies_per_each * ck.dough_oz
    WHEN 'inners'  THEN mc.unit_qty * inr.eaches_per_inner * e.cookies_per_each * ck.dough_oz
  END) / 16.0                             AS net_wt_lb_derived,

  -- pricing (the only stored pricing; NULL = TBD)
  pp.id                                   AS price_id,
  pp.channel                              AS price_channel,
  pp.list_price,
  pp.currency,
  pp.effective_from,
  pp.effective_to
FROM master_cases mc
LEFT JOIN inners  inr ON mc.composed_of = 'inners'
                     AND inr.inner_sku = mc.unit_ref
LEFT JOIN eaches  e   ON (mc.composed_of = 'eaches' AND e.each_sku = mc.unit_ref)
                     OR  (mc.composed_of = 'inners' AND e.each_sku = inr.each_sku)
LEFT JOIN products ck ON (mc.composed_of = 'cookies' AND ck.code = mc.unit_ref)
                     OR  (mc.composed_of IN ('eaches', 'inners') AND ck.code = e.product_code)
LEFT JOIN product_prices pp ON pp.master_case_id = mc.id;

-- PostgREST needs the API roles to read the view.
GRANT SELECT ON price_list TO anon, authenticated;

-- Verify:
--   select case_id, case_name, composed_of, cookie_code,
--          net_wt_lb_derived, storage, list_price
--     from price_list order by case_id;
--   -- list_price all NULL (TBD) until product_prices is populated;
--   -- net_wt_lb_derived NULL where composition parts are incomplete.
