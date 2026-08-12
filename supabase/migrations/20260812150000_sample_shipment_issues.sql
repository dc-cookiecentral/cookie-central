-- Cookie Central — record what went wrong with a sample shipment
--
-- Purpose is improvement, not incident management: which co-man, which lane and
-- which packaging produce delays, damage and QC complaints, so the pattern is
-- visible after twenty shipments instead of being re-learned each time.
--
-- ── Why this lives HERE and not in ShipStation ─────────────────────────────
--
-- There is no ShipStation field that fits, and it is worth writing down why so
-- nobody re-litigates it:
--
--   1. Every outbound text field is spoken for and points the wrong way.
--      InternalNotes carries RUSH + the site note, CustomerNotes carries
--      third-party billing, CustomField1/2/3 are salesperson / account / temp
--      override (ADR-037). All of them are INSTRUCTIONS sent before fulfilment
--      and rewritten on every re-import — an issue logged afterwards would be
--      overwritten by the next export. Worse, writing one bumps `updated_at`,
--      which schedules the row for re-export (ADR-041): a QA note would become
--      a message to the co-man's queue.
--   2. Nothing flows back FROM ShipStation except `shipnotify`, which fires
--      once at label purchase. The co-man's own notes cannot reach us.
--   3. The one genuine surface is shipment TAGS
--      (POST /v2/shipments/{id}/tags/{name}, available on every plan, and a
--      direct API call rather than the export, so no feedback loop). But
--      ShipStation destroys the shipment record once an order leaves Awaiting
--      Shipment (ADR-039) — so tagging after delivery, which is exactly when an
--      issue is known, is the case most likely to 404. Unreliable precisely
--      when it matters.
--
-- So the site owns this. That is also the honest division: ShipStation is the
-- fulfilment system of record; this is our own quality log.
--
-- ── Shape ──────────────────────────────────────────────────────────────────
-- One issue record per shipment, edited in place. `issue_flags` is an array so
-- an order can be both late AND badly packed — the common case — and so
-- reporting is a plain `unnest`. No CHECK constraint on the values: the
-- vocabulary will change as real problems show up, and a constraint would turn
-- adding a category into a migration.
--
-- ⚠️ Writing these bumps `updated_at` and therefore re-exports the order. That
-- is harmless (a delivered/shipped order maps to `shipped`, which is what
-- ShipStation already believes) but it is not nothing — see ADR-041.
--
-- Forward-only; applied via the Management API (no Docker locally).

ALTER TABLE sample_shipments
  ADD COLUMN IF NOT EXISTS issue_flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS issue_note  text,
  ADD COLUMN IF NOT EXISTS issue_at    timestamptz;

COMMENT ON COLUMN sample_shipments.issue_flags IS
  'What went wrong: delay, damage, quality, packaging, wrong-items, address, other. Free vocabulary on purpose — see the migration.';
COMMENT ON COLUMN sample_shipments.issue_note IS
  'Free text detail for the flags. Site-owned; never sent to ShipStation.';
COMMENT ON COLUMN sample_shipments.issue_at IS
  'When the issue was last recorded. Null = no issue logged.';

-- Reporting asks "which shipments had problems", never "which had none".
CREATE INDEX IF NOT EXISTS idx_sample_shipments_issues
  ON sample_shipments USING gin (issue_flags)
  WHERE issue_at IS NOT NULL;

-- Verify / the reporting query this exists for:
--   select unnest(issue_flags) as issue, count(*)
--     from sample_shipments where issue_at is not null
--     group by 1 order by 2 desc;
