-- Cookie Central — upload_log: allow ops/admin/finance to insert + update.
--
-- The initial schema only created a SELECT policy on upload_log, so any
-- authenticated user attempting to upload a file hit "new row violates
-- row-level security policy" the moment UploadPipeline tried to open the
-- log row. Mirrors the role pattern used on raw_material_suppliers (which
-- already has authorized-role write policies).

CREATE POLICY "Authorized insert" ON upload_log FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops'))
);

-- UPDATE so UploadPipeline can flip status to 'complete' / 'error' after
-- the importer runs. USING clause gates which rows the user can touch;
-- WITH CHECK gates what the post-update row may look like.
CREATE POLICY "Authorized update" ON upload_log FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops'))
);
