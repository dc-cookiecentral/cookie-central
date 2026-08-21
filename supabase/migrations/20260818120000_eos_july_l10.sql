-- ════════════════════════════════════════════════════════════════════════════
-- L10 meeting record + issues raised, week of 2026-07-27
--
-- Source: the "EOS Level 10 Agenda" notes from the late-July meeting
-- (Paul, Caroline, Shahira, Dave, Mark).
--
-- Three decisions worth recording:
--
-- (a) The notes' agenda ran Scorecard/Short-Term Focus for 60 minutes and IDS
--     for 10-15. In EOS the Scorecard segment is a five-minute number read and
--     everything discussable drops to Issues for a 60-minute IDS. So what that
--     60-minute block actually contained was an issues list, and that is how it
--     is loaded here. L10_AGENDA in src/data/eosVto.js keeps the standard
--     structure as the target; the drift is recorded on the meeting row.
--
-- (b) Parent topics become Issues; their sub-bullets go into `detail`. One row
--     per heading keeps the list rankable for the weekly top-three pick, which
--     is the point of the Issues list. Nothing from the notes is dropped.
--
-- (c) `priority` in this schema is the top-three IDS pick, not a P0/P1 severity
--     grade. The notes' own P0/P1 labels are preserved in the title text. The
--     single P0 also gets priority = 1, since the notes flag it as the top item.
--
-- Owners are set ONLY where the notes name one. Everything else is left NULL to
-- be assigned in-app rather than guessed at here.
-- ════════════════════════════════════════════════════════════════════════════

-- ── The meeting itself ───────────────────────────────────────────────────
INSERT INTO eos_meetings (week_start, held_on, attendees, notes)
VALUES (
  DATE '2026-07-27',
  DATE '2026-07-28',
  ARRAY['Paul', 'Caroline', 'Shahira', 'Dave', 'Mark'],
  'Agenda as run: Segue 5 · Scorecard / Short-Term Focus 60 · Customer / Employee '
  || 'Headlines 5 · To-Do List 5 · IDS 10-15 · Conclude 5. The 60-minute '
  || '"Short-Term Focus" block was in substance an IDS session; its topics are '
  || 'loaded as Issues raised this week.'
)
ON CONFLICT (week_start) DO NOTHING;

-- ── Issues raised ────────────────────────────────────────────────────────
INSERT INTO eos_issues (title, detail, owner, status, raised_week, priority, sort_order)
SELECT * FROM (VALUES
  ('Walmart current and forecasted sales',
   NULL,
   NULL, 'open', DATE '2026-07-27', NULL, 400),

  ('Shelf-stable cookie launch',
   'Packaging · Equipment · Production',
   NULL, 'open', DATE '2026-07-27', NULL, 410),

  ('Dough ball corrugate change — perforated, in-fridge, 8-count',
   'Supplier decisions · Sell-through rate / transition timing · Walmart final '
   || 'approval requirements · Test process · Target transition date',
   NULL, 'open', DATE '2026-07-27', NULL, 420),

  ('Walmart CAPA',
   'Lot code format decision · Input from Susie · Confirm Walmart / Bentonville '
   || 'Merchants requirements with Becky · Feedback from Walmart: status and '
   || 'expected timing',
   NULL, 'open', DATE '2026-07-27', NULL, 430),

  ('P0 · Transition to FreshCoast',
   'Debrief on Amit and Tim''s visit to Assemblers · Build transition timeline · '
   || 'Assemblers agreement · Cortina role definition · Natural break in '
   || 'production · Re-dating plan for PB&J and WCCB · FreshCoast labeling + '
   || 'frozen storage cost confirmation · SMETA audit · Walmart system setup '
   || 'ownership (Franz)',
   NULL, 'open', DATE '2026-07-27', 1, 440),

  ('P1 · Cash and AP approval process',
   'Sources of cash · Consolidation of open AP · Checking account / bank info '
   || 'for Ellen · Whether Ellen should join L10',
   NULL, 'open', DATE '2026-07-27', NULL, 450),

  ('P1 · Sample order process update',
   NULL,
   NULL, 'open', DATE '2026-07-27', NULL, 460),

  ('P1 · New business',
   'Passed on Target: implications · Pipeline review: GoPuff, Trader Joe''s, '
   || 'Costco, others',
   NULL, 'open', DATE '2026-07-27', NULL, 470),

  ('Weekly Cortina meeting',
   'Review straw-man agenda · Participants · Goals',
   NULL, 'open', DATE '2026-07-27', NULL, 480),

  ('Mark Cuban meeting debrief',
   'Raised under Customer / Employee Headlines.',
   NULL, 'open', DATE '2026-07-27', NULL, 490),

  ('Shahira follow-up with John Lidestri',
   'Raised under Customer / Employee Headlines.',
   'Shahira', 'open', DATE '2026-07-27', NULL, 500),

  ('Review VTO',
   'Raised under Customer / Employee Headlines.',
   NULL, 'open', DATE '2026-07-27', NULL, 510)
) AS v(title, detail, owner, status, raised_week, priority, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM eos_issues e WHERE e.title = v.title);
