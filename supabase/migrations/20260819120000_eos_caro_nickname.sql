-- ════════════════════════════════════════════════════════════════════════════
-- Normalise the owner name: Caroline -> Caro
--
-- Caro is the nickname she goes by, and it is what the foundation document
-- already used on four measurables and Rock 5. The seed preserved the document's
-- inconsistency verbatim rather than guessing; this resolves it in her favour.
--
-- Five values across four tables:
--   eos_seats     Sales / Samples, Operations / Logistics
--   eos_issues    "Pricing"
--   eos_todos     "Begin running the Scorecard weekly..."
--   eos_meetings  attendees on the 2026-07-27 L10
--
-- Exact whole-value matches only, never a substring replace. 'Caro' is a prefix
-- of 'Caroline', so a text-search rewrite in the other direction would corrupt
-- the rows that are already correct. Same discipline as the Mark -> Marc fix in
-- 20260818130000.
--
-- docs/PEOPLE.md keeps her full name, Caroline Friedrich — this changes the
-- free-text owner fields in the EOS tables, not her identity in the roster.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE eos_seats  SET owner = 'Caro' WHERE owner = 'Caroline';
UPDATE eos_issues SET owner = 'Caro' WHERE owner = 'Caroline';
UPDATE eos_todos  SET owner = 'Caro' WHERE owner = 'Caroline';

UPDATE eos_meetings
   SET attendees = array_replace(attendees, 'Caroline', 'Caro')
 WHERE 'Caroline' = ANY (attendees);
