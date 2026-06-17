-- Cookie Central — reprocess the Inventory Snapshot under full-truth semantics
--
-- Re-queue the Assemblers Inventory Snapshot message so the updated importer
-- runs its purge (drop Assemblers-warehouse raw_materials absent from the
-- snapshot → audit_log) and writes the first raw_material_snapshots history row.
-- This also clears the one stale item lingering from an earlier upsert-only import.
--
-- One-time, testing-mode op (no-op on a fresh DB). Run AFTER deploying the
-- updated gmail-extract, then invoke the function.

UPDATE gmail_messages
   SET processed = false, error = NULL, upload_log_id = NULL
 WHERE classification = 'assemblers_report'
   AND subject ILIKE '%Inventory Report%'
   AND error IS NULL;
