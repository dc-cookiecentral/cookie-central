-- Cookie Central — reprocess the Assemblers Inventory Snapshot Report
--
-- The standalone Inventory Snapshot Report was misrouted to production.js (the
-- multi-sheet production parser) and imported 0 rows. gmail-extract now routes
-- it to assemblers.js → raw_materials + raw_material_lots. Re-queue that one
-- message so the corrected router imports it.
--
-- One-time, testing-mode op (no-op on a fresh DB). Run AFTER deploying the
-- updated gmail-extract, then invoke the function.

-- Drop the misleading "production / 0 rows" log row from the misroute
-- (gmail_messages.upload_log_id FK is ON DELETE SET NULL).
DELETE FROM upload_log
 WHERE upload_type = 'production' AND row_count = 0 AND source = 'email'
   AND filename ILIKE 'inventory-snapshot-report%';

-- Re-queue the inventory snapshot email (the reply that carried the .xlsx; the
-- attachment-less original already has an error and is left alone).
UPDATE gmail_messages
   SET processed = false, error = NULL, upload_log_id = NULL
 WHERE classification = 'assemblers_report'
   AND subject ILIKE '%Inventory Report%'
   AND error IS NULL;

-- Verify (after re-running gmail-extract):
--   select upload_type, row_count, status from upload_log
--     where filename ilike 'inventory-snapshot%';   -- expect assemblers / 32
--   select count(*) from raw_materials;              -- expect ~32
