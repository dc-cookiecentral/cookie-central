-- Cookie Central — upload_log: tag provenance (manual drop vs email auto-ingest)
--
-- Phase 2 lets the AI agent auto-import the Assemblers production workbook (and,
-- later, weekly attachments) straight from systems@dirtycookie.com — the same
-- parser + importRecords flow the manual /uploads card uses, just triggered by an
-- email instead of a drag-drop. The agent writes its upload_log rows with
-- source='email' so the upload log distinguishes "Marc dropped this" from "the
-- agent ingested this". Existing manual inserts default to 'manual', so no
-- application change is forced (the UploadPipeline keeps inserting as before).
--
-- upload_type already permits 'production'/'weekly_report' (20260601130000), so
-- only the source column is new.
--
-- NOT auto-deployed — paste into the SQL editor in filename order (RUNBOOK §7).

ALTER TABLE upload_log
  ADD COLUMN source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'email'));

-- Verify:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'upload_log' AND column_name = 'source';
