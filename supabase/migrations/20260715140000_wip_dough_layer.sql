-- Cookie Central — WIP / dough layer (Spec Sheet tab 1)
--
-- Phase 1, Task 1.6 support. Completes the product spine with the WIP layer the
-- Cookulator's "1 · WIP" tab renders: raw doughs (base recipes) and production
-- (WIP) doughs (raw + mix-ins). Deferred from Task 1.1 (ADR-024 noted the WIP
-- layer as optional); modeled now so the Spec Sheet WIP tab is full-parity and
-- table-backed like every other level.
--
-- products.wip_dough (text) references a wip_doughs.name; the Cookies tab's
-- Form/Tier inherit from the dough (matching the prototype), while products also
-- carries stored tier/form for self-contained queries.
--
-- RLS mirrors the spine: all authenticated read; admin/ops write.
-- Forward-only; applied manually via the Supabase SQL editor.

-- ── raw_doughs — base recipes ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS raw_doughs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_sku text UNIQUE NOT NULL,
  name text,
  family text,                           -- Form: Stuffed | Shot
  subtype text,                          -- Tier: Classic | Gourmet
  batch_wt_oz numeric,
  co_mans text[] NOT NULL DEFAULT '{}',  -- co-manufacturers
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE raw_doughs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read" ON raw_doughs;
CREATE POLICY "All can read" ON raw_doughs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Ops/admin insert" ON raw_doughs;
CREATE POLICY "Ops/admin insert" ON raw_doughs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
DROP POLICY IF EXISTS "Ops/admin update" ON raw_doughs;
CREATE POLICY "Ops/admin update" ON raw_doughs FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
DROP POLICY IF EXISTS "Ops/admin delete" ON raw_doughs;
CREATE POLICY "Ops/admin delete" ON raw_doughs FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

-- ── wip_doughs — production doughs (raw + mix-ins) ──────────────────────────
CREATE TABLE IF NOT EXISTS wip_doughs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wip_sku text UNIQUE NOT NULL,
  name text,
  type text,                             -- Form: Shot | Mixed (Mixed -> displays as Stuffed)
  subtype text,                          -- Tier: Classic | Gourmet
  raw_base text,                         -- name of the raw dough this builds on
  mixins text,
  mixin_wt_oz numeric,
  raw_dough_portion_oz numeric,
  wip_batch_wt_oz numeric,
  co_mans text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE wip_doughs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read" ON wip_doughs;
CREATE POLICY "All can read" ON wip_doughs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Ops/admin insert" ON wip_doughs;
CREATE POLICY "Ops/admin insert" ON wip_doughs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
DROP POLICY IF EXISTS "Ops/admin update" ON wip_doughs;
CREATE POLICY "Ops/admin update" ON wip_doughs FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
DROP POLICY IF EXISTS "Ops/admin delete" ON wip_doughs;
CREATE POLICY "Ops/admin delete" ON wip_doughs FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

DROP TRIGGER IF EXISTS set_updated_at_raw_doughs ON raw_doughs;
CREATE TRIGGER set_updated_at_raw_doughs BEFORE UPDATE ON raw_doughs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_wip_doughs ON wip_doughs;
CREATE TRIGGER set_updated_at_wip_doughs BEFORE UPDATE ON wip_doughs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Verify:
--   select count(*) from raw_doughs;   -- expect 5 after seed
--   select count(*) from wip_doughs;   -- expect 13 after seed
