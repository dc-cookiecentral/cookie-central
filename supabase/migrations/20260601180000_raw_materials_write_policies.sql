-- Cookie Central — raw_materials + raw_material_lots write policies
--
-- The initial schema only gave raw_materials a SELECT + UPDATE policy and
-- raw_material_lots only a SELECT policy, so the Assemblers Inventory
-- importer (called via the production parser) hit "new row violates RLS"
-- on the very first material upsert. raw_material_lots' importer does
-- DELETE-then-INSERT per material, so it needs both verbs too.
--
-- Mirrors the role pattern on the surrounding tables (raw_material_suppliers
-- + raw_material_orders) — authenticated ops/admin can write.

CREATE POLICY "Ops/admin insert" ON raw_materials FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

CREATE POLICY "Ops/admin insert" ON raw_material_lots FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

CREATE POLICY "Ops/admin update" ON raw_material_lots FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

CREATE POLICY "Ops/admin delete" ON raw_material_lots FOR DELETE
USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
