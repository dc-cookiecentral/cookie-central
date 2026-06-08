-- Cookie Central — po_line_items write policies.
--
-- The initial schema gave po_line_items only a SELECT policy, so the Cortina PO
-- PDF importer (and the NetSuite importer — both do delete-then-insert of line
-- items per PO) hit "new row violates row-level security policy for table
-- po_line_items" on the very first line insert. The parent purchase_orders
-- already has ops/admin INSERT + UPDATE policies; this mirrors that pattern on
-- the child so the same role can write its line items.
--
-- Idempotent per the repo's push convention.

DROP POLICY IF EXISTS "Ops/admin insert" ON po_line_items;
CREATE POLICY "Ops/admin insert" ON po_line_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

DROP POLICY IF EXISTS "Ops/admin update" ON po_line_items;
CREATE POLICY "Ops/admin update" ON po_line_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

DROP POLICY IF EXISTS "Ops/admin delete" ON po_line_items;
CREATE POLICY "Ops/admin delete" ON po_line_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
