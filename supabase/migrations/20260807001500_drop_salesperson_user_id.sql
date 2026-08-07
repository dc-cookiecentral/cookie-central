-- Cookie Central — drop sample_shipments.salesperson_user_id
--
-- Superseded by sales_rep_id (migration 20260807000500). Reps are a plain list,
-- not user accounts, so the FK to user_profiles → auth.users is gone for good.
--
-- The column was kept for one migration's worth of overlap purely because
-- SMP-TEST-1044 still resolved through it. That order has now been deleted here
-- and cancelled in ShipStation, so `sample_shipments` is empty and nothing
-- references the column. Dropping it now removes the `sales_rep ?? salesperson`
-- fallback from the export and, with it, a permanent "which field wins" question
-- that every future reader would have had to answer.
--
-- Deliberately done while the table is empty: no backfill, no data risk. The
-- rows that existed are in purge_20260806_* / purge_20260807_*.
--
-- Forward-only; applied via the Management API (no Docker locally).

DROP INDEX IF EXISTS idx_sample_shipments_salesperson;

ALTER TABLE sample_shipments
  DROP COLUMN IF EXISTS salesperson_user_id;

-- Verify:
--   select column_name from information_schema.columns
--     where table_name = 'sample_shipments' and column_name like '%sales%';
--   -- should return sales_rep_id only.
