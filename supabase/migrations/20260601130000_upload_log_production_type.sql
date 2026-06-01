-- Cookie Central — upload_log: allow 'production' upload_type.
--
-- The original schema constrained upload_type to a fixed set
-- (dot, assemblers, qbo, netsuite, weekly_report). The Day 6.7 production
-- parser writes upload_type='production', which the existing CHECK would
-- reject. Drop + recreate the CHECK with the new value included.

ALTER TABLE upload_log DROP CONSTRAINT upload_log_upload_type_check;
ALTER TABLE upload_log ADD CONSTRAINT upload_log_upload_type_check
  CHECK (upload_type IN ('dot', 'assemblers', 'production', 'qbo', 'netsuite', 'weekly_report'));
