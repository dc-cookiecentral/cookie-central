-- Cookie Central — Assemblers Inventory Snapshot as full truth
--
-- The Assemblers Inventory Snapshot Report is the authoritative count for the
-- Assemblers warehouse. On import, raw_materials rows for that warehouse which
-- are absent from the latest snapshot are purged (logged to audit_log), and a
-- per-item history row is written so the last 4 weeks of snapshots are
-- retained. Schema this needs:
--
--   1. raw_materials.warehouse — scopes the purge to Assemblers (other
--      warehouses, e.g. DOT, never get touched by this import).
--   2. a DELETE policy on raw_materials — the importer's browser path runs as
--      the ops/admin user (the email path is service-role and bypasses RLS);
--      raw_materials had SELECT/INSERT/UPDATE but no DELETE, so manual-upload
--      purges would hit "violates RLS".
--   3. raw_material_snapshots — the 4-week rolling history (importer prunes
--      rows older than 28 days). audit_log already has an open INSERT policy.
--
-- Executable via `npx supabase db push`.

-- 1. Warehouse tag (existing rows default to the Assemblers warehouse).
ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS warehouse text NOT NULL DEFAULT 'assemblers';
CREATE INDEX IF NOT EXISTS idx_raw_materials_warehouse ON raw_materials(warehouse);

-- 2. DELETE policy (mirrors the ops/admin role pattern on the table).
DROP POLICY IF EXISTS "Ops/admin delete" ON raw_materials;
CREATE POLICY "Ops/admin delete" ON raw_materials FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

-- 3. Snapshot history (one row per item per import; pruned to 4 weeks).
CREATE TABLE IF NOT EXISTS raw_material_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date timestamptz NOT NULL DEFAULT now(),
  warehouse text NOT NULL DEFAULT 'assemblers',
  code text NOT NULL,
  name text,
  category text,
  quantity numeric,
  unit text,
  lot_count int,
  expired_quantity numeric,
  expiry_status text,
  upload_id uuid REFERENCES upload_log(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rm_snapshots_date ON raw_material_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_rm_snapshots_wh_code ON raw_material_snapshots(warehouse, code);

ALTER TABLE raw_material_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON raw_material_snapshots FOR SELECT USING (true);
CREATE POLICY "Ops/admin insert" ON raw_material_snapshots FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
CREATE POLICY "Ops/admin delete" ON raw_material_snapshots FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

-- Verify:
--   select column_name from information_schema.columns
--     where table_name='raw_materials' and column_name='warehouse';
--   select to_regclass('public.raw_material_snapshots');
