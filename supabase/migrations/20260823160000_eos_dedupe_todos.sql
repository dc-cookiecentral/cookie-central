-- ════════════════════════════════════════════════════════════════════════════
-- EOS: collapse duplicate To-Dos, and stop them coming back
--
-- Three identical "P0 · Transition to FreshCoast" To-Dos existed — same title,
-- same owner (null), same created_week and due_week, none done, and all three
-- pointing at the SAME issue (0c7d9db4). Not three commitments, one commitment
-- inserted three times.
--
-- This is the failure mode that argued against implementing To-Do carry-forward
-- by copying rows week to week: had anything been doing that, the list would
-- grow one duplicate per week, each needing its own tick. Carry-forward is a
-- query instead (see useMetricTodos) precisely so this cannot happen.
--
-- ── Which copy survives ─────────────────────────────────────────────────────
-- `done DESC, created_at ASC, id`: a ticked-off copy wins over an open one, and
-- only then does the oldest win. Ordering by created_at alone would be fine for
-- today's data — all three are open — but would silently discard a completion
-- if this ever runs against a set where someone had already ticked a later
-- duplicate. Losing a "done" is the one outcome worth engineering against.
--
-- ── The guard ───────────────────────────────────────────────────────────────
-- Unique on (issue_id, title), NOT on issue_id alone. One issue legitimately
-- spawns several different To-Dos — that is how an issue gets solved. What is
-- never legitimate is the same issue producing the same To-Do text twice.
--
-- Partial, because issue_id is null on To-Dos raised directly (four of the
-- current eight), and a null-heavy unique index would be both useless and
-- surprising: nulls do not collide in Postgres, so unlinked To-Dos are
-- unaffected either way, and the partial index keeps that explicit.
--
-- Order matters: dedupe FIRST, then create the index. Creating it first would
-- fail against the existing duplicates.
--
-- Forward-only; safe to re-run (the delete is a no-op once no duplicates
-- remain, and the index is IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════════════════

DELETE FROM eos_todos t
 USING (
   SELECT id,
          row_number() OVER (
            PARTITION BY issue_id, title
            ORDER BY done DESC, created_at ASC, id
          ) AS rn
     FROM eos_todos
    WHERE issue_id IS NOT NULL
 ) d
 WHERE t.id = d.id
   AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS eos_todos_issue_title_uniq
  ON eos_todos (issue_id, title)
  WHERE issue_id IS NOT NULL;

-- Verify:
--   select issue_id, title, count(*) from eos_todos where issue_id is not null
--     group by issue_id, title having count(*) > 1;
--   -- expect zero rows.
--   select count(*) from eos_todos;   -- expect 6 (was 8, minus the two dupes)
