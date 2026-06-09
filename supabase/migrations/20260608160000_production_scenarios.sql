-- Cookie Central — Reorder Calculator: scenario-based production planning.
--
-- Ops builds a scenario (a set of planned production runs), the calculator
-- explodes each run through the BOM (derived from production_subcomponents, with
-- per-ingredient overrides in bom_overrides), compares against current inventory
-- + expiring lots, and recommends what to order and by when.
--
-- All tables: RLS on, "All can read" SELECT, ops/admin write (mirrors the
-- production_* tables). Idempotent per the repo's push convention.

-- ── production_scenarios ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  created_by uuid REFERENCES user_profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE production_scenarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read" ON production_scenarios;
CREATE POLICY "All can read" ON production_scenarios FOR SELECT USING (true);
DROP POLICY IF EXISTS "Ops/admin write" ON production_scenarios;
CREATE POLICY "Ops/admin write" ON production_scenarios FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

-- ── scenario_runs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scenario_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid REFERENCES production_scenarios(id) ON DELETE CASCADE,
  product_sku text NOT NULL,
  quantity_cases int NOT NULL,
  run_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE scenario_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read" ON scenario_runs;
CREATE POLICY "All can read" ON scenario_runs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Ops/admin write" ON scenario_runs;
CREATE POLICY "Ops/admin write" ON scenario_runs FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
CREATE INDEX IF NOT EXISTS idx_scenario_runs_scenario ON scenario_runs(scenario_id);
CREATE INDEX IF NOT EXISTS idx_scenario_runs_sku ON scenario_runs(product_sku);

-- ── scenario_ingredients (computed explosion snapshot, optional persistence) ──
CREATE TABLE IF NOT EXISTS scenario_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid REFERENCES production_scenarios(id) ON DELETE CASCADE,
  run_id uuid REFERENCES scenario_runs(id) ON DELETE CASCADE,
  ingredient text NOT NULL,
  quantity_required numeric NOT NULL,
  unit text NOT NULL,
  bom_per_case numeric,
  on_hand numeric,
  expiring_before_run numeric DEFAULT 0,
  available numeric,
  surplus_deficit numeric,
  lead_time_days int,
  order_by date,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE scenario_ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read" ON scenario_ingredients;
CREATE POLICY "All can read" ON scenario_ingredients FOR SELECT USING (true);
DROP POLICY IF EXISTS "Ops/admin write" ON scenario_ingredients;
CREATE POLICY "Ops/admin write" ON scenario_ingredients FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
CREATE INDEX IF NOT EXISTS idx_scenario_ingredients_scenario ON scenario_ingredients(scenario_id);

-- ── bom_overrides (editable BOM; persists across scenarios) ──────────────────
CREATE TABLE IF NOT EXISTS bom_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_sku text NOT NULL,
  ingredient_code text NOT NULL,
  ingredient_name text,
  quantity_per_case numeric NOT NULL,
  unit text NOT NULL,
  yield_factor numeric DEFAULT 1.0,
  source text DEFAULT 'manual' CHECK (source IN ('manual', 'derived', 'adjusted')),
  derived_from_jobs text[],
  notes text,
  updated_by uuid REFERENCES user_profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (product_sku, ingredient_code)
);
ALTER TABLE bom_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read" ON bom_overrides;
CREATE POLICY "All can read" ON bom_overrides FOR SELECT USING (true);
DROP POLICY IF EXISTS "Ops/admin write" ON bom_overrides;
CREATE POLICY "Ops/admin write" ON bom_overrides FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
CREATE INDEX IF NOT EXISTS idx_bom_overrides_sku ON bom_overrides(product_sku);

-- updated_at triggers (reuse the shared helper).
DROP TRIGGER IF EXISTS set_updated_at_production_scenarios ON production_scenarios;
CREATE TRIGGER set_updated_at_production_scenarios BEFORE UPDATE ON production_scenarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_bom_overrides ON bom_overrides;
CREATE TRIGGER set_updated_at_bom_overrides BEFORE UPDATE ON bom_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
