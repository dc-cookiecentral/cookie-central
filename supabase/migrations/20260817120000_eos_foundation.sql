-- Cookie Central — EOS (Entrepreneurial Operating System) tracker
--
-- Source of truth for the seed below: "Dirty_Cookie_EOS_Foundation.pages",
-- the working record of the company's first EOS session (document dated
-- June 18, 2026). Everything here is EOS vocabulary as defined in Traction
-- (Gino Wickman) — Accountability Chart, Rocks, Scorecard, Issues, To-Dos.
--
-- ── What lives here and what does not ──────────────────────────────────────
--
-- The V/TO's *vision side* (core values, core focus, 5-year target, marketing
-- strategy, 3-year picture, 1-year plan) is NOT in this schema. It changes at
-- most once a year, is prose rather than records, and giving it a CRUD surface
-- would cost more than it saves. It renders from `src/data/eosVto.js`.
--
-- The *traction side* — the Accountability Chart, the quarterly Rocks, the
-- Weekly Scorecard and the Issues List — is live data that changes inside the
-- Level 10 meeting, so it lives in these six tables.
--
-- ── The week boundary ──────────────────────────────────────────────────────
--
-- `week_start` is always a MONDAY (ISO week). The Level 10 meeting runs on
-- TUESDAY, so at the meeting the team is entering the week that just closed.
-- Storing the Monday rather than the meeting date means moving the meeting day
-- never re-buckets historical numbers — the meeting day is a display setting,
-- not a key. A CHECK enforces the Monday invariant so a bad insert cannot
-- silently create a duplicate half-week.
--
-- ── Why R/Y/G is not a column ──────────────────────────────────────────────
--
-- A measurable's status is derived from its value and its CURRENT goal, in the
-- UI. Storing it would freeze the old verdict the moment a goal is set or
-- changed — and per the source document the goals are deliberately unset
-- ("Baseline 3–4 weeks before locking weekly goals"), so almost every metric
-- will get its first goal after real numbers already exist. Derived, those
-- weeks re-colour correctly; stored, they would lie.
--
-- Forward-only; applied via the Management API (no Docker locally).

-- ───────────────────────────── Accountability Chart ─────────────────────────
-- One name accountable per seat. `owner` is free text on purpose: the real
-- roster contains 'OPEN', 'HIRE #1' and 'Shahira + Dave' alongside real people,
-- and an FK to user_profiles would make the un-filled seats — the ones that
-- matter most — unrepresentable.
CREATE TABLE IF NOT EXISTS eos_seats (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  major_function  text NOT NULL,            -- Leadership | Sales | Operations | Finance
  seat            text NOT NULL,
  owner           text,
  accountable_for text,
  -- GWC = Get it, Want it, Capacity to do it. NULL = not yet assessed, which is
  -- the honest state for every seat today; false is a real (and different) answer.
  gwc_get         boolean,
  gwc_want        boolean,
  gwc_capacity    boolean,
  sort_order      int NOT NULL DEFAULT 0,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (major_function, seat)
);
COMMENT ON TABLE eos_seats IS
  'EOS Accountability Chart. One accountable name per seat; owner is free text so OPEN / HIRE #N seats are representable.';

-- ───────────────────────────────── Rocks ────────────────────────────────────
-- The 3–7 most important priorities for a quarter. `quarter` is a plain label
-- ('2026-Q3') rather than a date range: Rocks are discussed by quarter name and
-- a range invites off-by-one questions nobody wants in a meeting.
CREATE TABLE IF NOT EXISTS eos_rocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter     text NOT NULL,
  seq         int,
  title       text NOT NULL,
  owner       text,
  notes       text,
  -- EOS scores a Rock on-track / off-track weekly and done at quarter-end.
  -- 'dropped' records the ones the team consciously killed, which is worth
  -- keeping: a quarter that dropped three Rocks is a planning signal.
  status      text NOT NULL DEFAULT 'on_track'
              CHECK (status IN ('on_track', 'off_track', 'done', 'dropped')),
  due_date    date,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eos_rocks_quarter ON eos_rocks (quarter, sort_order);

-- ──────────────────────────── Scorecard measurables ─────────────────────────
CREATE TABLE IF NOT EXISTS eos_scorecard_metrics (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  owner          text,
  notes          text,
  unit           text NOT NULL DEFAULT 'number'
                 CHECK (unit IN ('number', 'usd', 'percent', 'days', 'ratio')),
  -- NULL goal = still baselining. The UI shows the number without a verdict
  -- rather than inventing a target.
  goal_value     numeric,
  goal_max       numeric,                   -- only meaningful for direction 'between'
  goal_direction text NOT NULL DEFAULT 'gte'
                 CHECK (goal_direction IN ('gte', 'lte', 'between')),
  -- The ★ in the source document: the primary metrics leadership reacts to first.
  is_primary     boolean NOT NULL DEFAULT false,
  active         boolean NOT NULL DEFAULT true,
  sort_order     int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name)
);
COMMENT ON COLUMN eos_scorecard_metrics.goal_value IS
  'NULL until the team locks a weekly goal. Source doc: baseline 3-4 weeks first.';

-- ─────────────────────────── Scorecard weekly entries ───────────────────────
-- The heart of the tracker: one number per measurable per week, forever.
CREATE TABLE IF NOT EXISTS eos_scorecard_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id   uuid NOT NULL REFERENCES eos_scorecard_metrics(id) ON DELETE CASCADE,
  week_start  date NOT NULL CHECK (EXTRACT(ISODOW FROM week_start) = 1),  -- Monday
  value       numeric,
  note        text,
  entered_by  uuid REFERENCES user_profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric_id, week_start)
);
-- Every read is "the last N weeks, all metrics" — week first.
CREATE INDEX IF NOT EXISTS idx_eos_entries_week ON eos_scorecard_entries (week_start DESC, metric_id);

-- ─────────────────────────────── Issues List ────────────────────────────────
-- IDS: Identify, Discuss, Solve. The Parking Lot from the source document is
-- status 'parked' rather than its own table — a parked topic becoming a live
-- issue is then a status change, which is exactly what happens in the meeting.
CREATE TABLE IF NOT EXISTS eos_issues (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  detail       text,
  owner        text,
  status       text NOT NULL DEFAULT 'open'
               CHECK (status IN ('open', 'solved', 'dropped', 'parked')),
  -- Which L10 the issue surfaced in / was closed in. Both are week_start
  -- Mondays so they join cleanly against the scorecard.
  raised_week  date,
  solved_week  date,
  solution     text,
  -- The L10 ranks the top 3 issues to solve this week; NULL = not picked.
  priority     int CHECK (priority IS NULL OR priority BETWEEN 1 AND 3),
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eos_issues_status ON eos_issues (status, priority NULLS LAST, sort_order);

-- ──────────────────────────────── To-Dos ────────────────────────────────────
-- Seven-day action items created in the meeting. Distinct from Rocks (90 days)
-- and from Issues (things to solve, not things to do).
CREATE TABLE IF NOT EXISTS eos_todos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  owner         text,
  created_week  date,
  due_week      date,
  done          boolean NOT NULL DEFAULT false,
  done_at       timestamptz,
  -- Set when a to-do came out of solving a specific issue, so the trail from
  -- "we discussed this" to "someone did something" survives the meeting.
  issue_id      uuid REFERENCES eos_issues(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eos_todos_open ON eos_todos (due_week) WHERE NOT done;

-- ───────────────────────── The Level 10 meeting record ──────────────────────
-- One row per week the team actually met. Its presence is what marks a week
-- "held"; the 1-10 rating is the standard EOS close-out question.
CREATE TABLE IF NOT EXISTS eos_meetings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start  date NOT NULL UNIQUE CHECK (EXTRACT(ISODOW FROM week_start) = 1),
  held_on     date,
  rating      numeric CHECK (rating IS NULL OR rating BETWEEN 1 AND 10),
  attendees   text[] NOT NULL DEFAULT '{}',
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────── updated_at ────────────────────────────────
-- update_updated_at() is defined in 20260521000000_initial_schema.sql.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['eos_seats','eos_rocks','eos_scorecard_metrics',
                           'eos_scorecard_entries','eos_issues','eos_todos','eos_meetings']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at_%s ON %I', t, t);
    EXECUTE format('CREATE TRIGGER set_updated_at_%s BEFORE UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t, t);
  END LOOP;
END $$;

-- ─────────────────────────────────── RLS ────────────────────────────────────
-- EOS content is internal leadership material — revenue targets, open seats,
-- hiring plans, an issue literally named after a person. The `cortina` role
-- (the Sample Central sales login) must not see any of it, so read is granted
-- to the internal roles explicitly rather than with USING (true), which is the
-- pattern most other tables in this schema use.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['eos_seats','eos_rocks','eos_scorecard_metrics',
                           'eos_scorecard_entries','eos_issues','eos_todos','eos_meetings']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Internal read" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Internal write" ON %I', t);
    -- One FOR ALL policy: in a live Level 10 the person driving the screen edits
    -- every section, so splitting read from write would buy nothing.
    EXECUTE format($p$
      CREATE POLICY "Internal write" ON %I FOR ALL
        USING (EXISTS (SELECT 1 FROM user_profiles
                        WHERE id = auth.uid() AND role IN ('admin','finance','ops')))
        WITH CHECK (EXISTS (SELECT 1 FROM user_profiles
                        WHERE id = auth.uid() AND role IN ('admin','finance','ops')))
    $p$, t);
  END LOOP;
END $$;
