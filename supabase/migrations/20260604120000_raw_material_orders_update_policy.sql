-- Cookie Central — raw_material_orders UPDATE policy
--
-- raw_material_orders shipped with RLS enabled but only SELECT (all) + INSERT
-- (ops/admin) policies — no UPDATE policy. With RLS on and no UPDATE policy,
-- Postgres blocks every UPDATE (0 rows affected), and PostgREST/supabase-js
-- returns no error, so the failure is silent.
--
-- This broke the Landing / receiving flow (receiveRawMaterialOrder): marking an
-- order 'delivered', stamping actual_delivery, and capturing the inbound BOL #
-- (bol_reference) all ride on that UPDATE, so none of them persisted. Mirrors
-- the ops/admin write pattern already used on raw_materials / raw_material_lots.

CREATE POLICY "Ops/admin update" ON raw_material_orders FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
