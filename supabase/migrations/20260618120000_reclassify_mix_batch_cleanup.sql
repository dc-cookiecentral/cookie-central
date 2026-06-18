-- Cookie Central — reclassify Mix/Batch sheets to 'other' + clean misroute logs
--
-- The old handleAssemblers routed every Assemblers attachment to production.js;
-- Mix Sheets and Batch Sheets (no structured importer) imported 0 rows and were
-- recorded as production/0 "successes". gmail-extract now reclassifies such
-- attachments to 'other'. This fixes up the existing rows:
--
--   1. Reclassify the already-ingested Mix/Batch emails to 'other' (identified by
--      their link to a stale production/0 email upload_log row). Done BEFORE the
--      delete, since upload_log_id is ON DELETE SET NULL.
--   2. Delete the stale production/0 email log rows from the misroute.
--
-- The real production workbook ("Production (40).xlsx", 151 rows) and the
-- Inventory Snapshot (assemblers/32) are untouched.

UPDATE gmail_messages
   SET classification = 'other', error = NULL
 WHERE classification = 'assemblers_report'
   AND upload_log_id IN (
     SELECT id FROM upload_log
      WHERE upload_type = 'production' AND row_count = 0 AND source = 'email'
   );

DELETE FROM upload_log
 WHERE upload_type = 'production' AND row_count = 0 AND source = 'email';

-- Verify:
--   select classification, count(*) from gmail_messages
--     where subject ilike '%Mix Sheet%' or subject ilike '%Reports%' group by 1;
--   select filename, row_count from upload_log where upload_type='production';
