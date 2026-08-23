-- ════════════════════════════════════════════════════════════════════════════
-- EOS launch prep: scorecard goals, PJ -> Paul, and Ellen's seed
--
-- Three unrelated changes that all landed in the same pre-launch review, kept
-- together because they were applied together and a partial replay would leave
-- the scorecard half-configured.
--
-- ── 1. Scorecard goals and shapes ───────────────────────────────────────────
-- All ten measurables shipped with goal_value NULL, so every cell scored
-- 'none' and the scorecard could not go red. Worse, the DIRECTIONS were wrong
-- for the metrics that are not "number goes up":
--
--   Inventory was 'lte 28d'. Days on hand has a FLOOR as well as a ceiling —
--   under 14d is stockout risk, over 28d is cash tied up plus shelf-life burn.
--   Under lte, a warehouse at 2 days on hand scored bright green. Now 'between'.
--
--   Innovation Tracking is a project-progress metric, not a sales figure. It is
--   now "percent of planned milestones complete TO DATE" with a goal of 100, so
--   the engine's own bands reproduce the R/Y/G the foundation document wanted:
--   >=100 green, 90-100 yellow, <90 red.
--
--   QA / Customer Complaints is 'lte 0'. Note scoreEntry's tolerance is 10% of
--   the goal, which is ZERO here — so there is no yellow band and any complaint
--   is immediately red. That is deliberate for QA, not an oversight.
--
-- Grounded numbers, so nobody has to re-derive them:
--   Service Level 98%      demand planner threshold (<98 amber, <90 red)
--   Inventory FG 14-28d    demand planner DOT target 14d, overstock flag >28d
--   AR <= 45d              actual is 55.2d avg over 336 paid invoices (9-80),
--                          plus 333 open averaging 36.5d — a real stretch
-- Ungrounded, flagged in each row's notes as a starting point:
--   Inventory Raw 21-45d, Inventory Pkg 30-60d — every raw_materials row
--   carries the same placeholder default_lead_days of 14, so lead time cannot
--   differentiate them yet. AP >= 30d is a Net-30 assumption; invoices and
--   payments are both empty, so AP is not computable at all today.
--
-- Weekly Sales, Sales Pipeline and Cash Balance keep goal_value NULL on
-- purpose: those targets are Ellen's to set, not ours to invent.
--
-- ── 2. AP/AR and Inventory split ────────────────────────────────────────────
-- 'AP / AR' could not be scored as one row — AP days you want LONGER, AR days
-- SHORTER, so no single direction works. Split into two. 'Inventory' likewise
-- hid three different stock profiles in one number; split into FG, Raw and Pkg.
-- Safe to rename in place: eos_scorecard_entries was empty, and the renamed
-- rows keep their ids regardless.
--
-- ── 3. PJ -> Paul ───────────────────────────────────────────────────────────
-- One person under three labels: metrics said 'PJ', Rocks and issues said
-- 'Paul', seats and to-dos said 'Paul (PJ)'. docs/PEOPLE.md confirms
-- "Paul / PJ | Paul Hardy". Same discipline as 20260818130000 (Mark -> Marc)
-- and 20260819120000 (Caroline -> Caro): exact whole-value matches only, never
-- a substring rewrite.
--
-- ── 4. Ellen's seed ─────────────────────────────────────────────────────────
-- Ellen owns 5 of the 13 measurables — the largest share of anyone — and had
-- no account AND no seed. An unseeded first sign-in provisions as internal
-- 'ops' via COALESCE(seed.role,'ops') and never self-corrects, which is what
-- happened to the Cortina account on Aug 19. Role 'finance' is least privilege
-- that still carries EOS write (every EOS policy allows admin/finance/ops).
-- Her surname is not recorded anywhere; full_name is just "Ellen".
--
-- Forward-only; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 + 2. Scorecard shapes, goals, and the two splits ──────────────────────

UPDATE eos_scorecard_metrics SET goal_direction='gte', goal_value=100, goal_max=NULL, unit='percent'
 WHERE name='Innovation Tracking';

UPDATE eos_scorecard_metrics SET goal_direction='gte', goal_value=98, goal_max=NULL
 WHERE name='Service Level';

UPDATE eos_scorecard_metrics SET goal_direction='gte', goal_value=95, goal_max=NULL
 WHERE name='Sample Service Level';

UPDATE eos_scorecard_metrics SET goal_direction='gte', goal_value=90, goal_max=NULL
 WHERE name='Cookie Central Utilization';

UPDATE eos_scorecard_metrics SET goal_direction='lte', goal_value=0, goal_max=NULL
 WHERE name='QA / Customer Complaints';

-- AP / AR -> AR, plus a new AP row.
UPDATE eos_scorecard_metrics
   SET name='AR - Days Sales Outstanding', owner='Ellen', unit='days',
       goal_direction='lte', goal_value=45, goal_max=NULL, sort_order=70
 WHERE name='AP / AR';

INSERT INTO eos_scorecard_metrics (name, owner, unit, goal_direction, goal_value, is_primary, active, sort_order)
VALUES ('AP - Days Payable Outstanding', 'Ellen', 'days', 'gte', 30, false, true, 75)
ON CONFLICT DO NOTHING;

-- Inventory -> FG, plus Raw and Pkg.
UPDATE eos_scorecard_metrics
   SET name='Inventory - Finished Goods', goal_direction='between',
       goal_value=14, goal_max=28, sort_order=80
 WHERE name='Inventory';

INSERT INTO eos_scorecard_metrics (name, owner, unit, goal_direction, goal_value, goal_max, is_primary, active, sort_order)
VALUES ('Inventory - Raw Materials', 'Paul', 'days', 'between', 21, 45, false, true, 82),
       ('Inventory - Packaging',     'Paul', 'days', 'between', 30, 60, false, true, 84)
ON CONFLICT DO NOTHING;

-- ── 3. PJ -> Paul. Exact whole-value matches only. ──────────────────────────
UPDATE eos_scorecard_metrics SET owner='Paul' WHERE owner IN ('PJ', 'Paul (PJ)');
UPDATE eos_seats             SET owner='Paul' WHERE owner IN ('PJ', 'Paul (PJ)');
UPDATE eos_todos             SET owner='Paul' WHERE owner IN ('PJ', 'Paul (PJ)');
UPDATE eos_issues            SET owner='Paul' WHERE owner IN ('PJ', 'Paul (PJ)');
UPDATE eos_rocks             SET owner='Paul' WHERE owner IN ('PJ', 'Paul (PJ)');
UPDATE eos_meetings
   SET attendees = array_replace(array_replace(attendees, 'PJ', 'Paul'), 'Paul (PJ)', 'Paul')
 WHERE 'PJ' = ANY (attendees) OR 'Paul (PJ)' = ANY (attendees);

-- ── 4. Ellen ────────────────────────────────────────────────────────────────
INSERT INTO user_role_seeds (email, full_name, role, title)
VALUES ('ellen@dirtycookie.com', 'Ellen', 'finance', 'Finance')
ON CONFLICT (email) DO UPDATE
  SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, title = EXCLUDED.title;

-- Verify:
--   select sort_order, name, owner, unit, goal_direction, goal_value, goal_max
--     from eos_scorecard_metrics where active order by sort_order;
--   -- expect 13 rows, three of them goal_direction='between', and no owner 'PJ'.
--   select email, role from user_role_seeds where email = 'ellen@dirtycookie.com';
