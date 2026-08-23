-- ════════════════════════════════════════════════════════════════════════════
-- EOS: due dates on Rocks and To-Dos, and To-Dos attached to a measurable
--
-- ── 1. Rocks get a due date ─────────────────────────────────────────────────
-- All six Rocks had due_date NULL. In EOS a Rock is a 90-day commitment, so the
-- quarter end IS the due date — 2026-Q3 ends 2026-09-30. Setting them all to
-- the quarter end is not laziness, it is the definition; stagger them by hand
-- if a particular Rock genuinely lands earlier.
--
-- ── 2. To-Dos get a due date ────────────────────────────────────────────────
-- All eight had due_week NULL, which makes a To-Do a wish rather than a
-- seven-day commitment. EOS convention: a To-Do raised in a Level 10 is due by
-- the next one, so due_week = created_week + 7.
--
-- Four of the eight also had created_week NULL — they came out of the founding
-- L10 on 2026-07-28 (see eos_meetings), whose week starts Monday 2026-07-27.
-- Backdating them to that week makes them read as overdue, which they are:
-- "Stand up a weekly Level 10", "Begin running the Scorecard weekly",
-- "Finalize the quarter's Rocks", "Fill or assign coverage for the OPEN seats"
-- are the launch tasks and none is done. Showing them as current would be
-- flattering and wrong.
--
-- ── 3. To-Dos can hang off a measurable ─────────────────────────────────────
-- A To-Do raised because a Scorecard number went off-goal belongs WITH that
-- measurable, not adrift in a flat list. `eos_issues` carries no metric link,
-- so the metric -> issue -> todo chain could not be walked; this adds the link
-- directly to the To-Do instead, which is the relationship the UI actually
-- needs to render.
--
--   metric_id    the measurable this To-Do came from
--   metric_week  which week's cell spawned it — by the time anyone reads the
--                To-Do the context is gone, same reasoning as raised_week on
--                the issue drop
--
-- ON DELETE SET NULL, not CASCADE: retiring a measurable must not silently
-- delete outstanding commitments. The To-Do survives, orphaned, and shows up in
-- the flat list where someone will see it.
--
-- CARRY-FORWARD IS A QUERY, NOT A JOB. "Keep posting it next week until it is
-- checked off" needs no cron and no row-copying: the UI lists every linked
-- To-Do with done = false regardless of which week raised it, so an open item
-- simply keeps appearing. Copying rows forward each week would produce
-- duplicates that each need checking off separately — which is exactly the bug
-- the three identical "P0 · Transition to FreshCoast" To-Dos already show.
--
-- Forward-only; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Rocks ────────────────────────────────────────────────────────────────
UPDATE eos_rocks
   SET due_date = DATE '2026-09-30'
 WHERE quarter = '2026-Q3' AND due_date IS NULL;

-- ── 2. To-Dos ───────────────────────────────────────────────────────────────
-- Backfill the founding-meeting To-Dos to the week of the L10 they came from.
UPDATE eos_todos
   SET created_week = DATE '2026-07-27'
 WHERE created_week IS NULL;

-- Due the following Level 10.
UPDATE eos_todos
   SET due_week = created_week + 7
 WHERE due_week IS NULL AND created_week IS NOT NULL;

-- ── 3. Link To-Dos to a measurable ──────────────────────────────────────────
ALTER TABLE eos_todos
  ADD COLUMN IF NOT EXISTS metric_id uuid REFERENCES eos_scorecard_metrics(id) ON DELETE SET NULL;

ALTER TABLE eos_todos
  ADD COLUMN IF NOT EXISTS metric_week date;

-- Partial index: the vast majority of To-Dos carry no metric, and the Scorecard
-- only ever asks for the ones that do.
CREATE INDEX IF NOT EXISTS eos_todos_metric_id_idx
  ON eos_todos (metric_id) WHERE metric_id IS NOT NULL;

-- Verify:
--   select quarter, count(*), count(due_date) from eos_rocks group by quarter;
--   -- expect 6 / 6 for 2026-Q3.
--   select count(*) total, count(due_week) with_due, count(created_week) with_created
--     from eos_todos;
--   -- expect 8 / 8 / 8.
--   select column_name from information_schema.columns
--    where table_name = 'eos_todos' and column_name in ('metric_id','metric_week');
