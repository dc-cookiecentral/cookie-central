# EOS Tracker

The third project in this repo, after Cookie Central and Sample Central. It is the standing record for Dirty Cookie's **Level 10 meeting** — the weekly leadership rhythm from EOS (*Traction*, Gino Wickman).

Route: **`/eos`**, inside the internal shell. Built August 17–19, 2026. See **ADR-047** in `docs/DECISIONS.md` for the reasoning behind the schema.

**Status: database live, frontend not deployed.** All five migrations are applied to production Supabase, but the UI is deliberately unshipped — see [Deployment state](#deployment-state).

---

## What it is for

Once a week, in the meeting, the team pulls up this page and works down it. The Scorecard is the centrepiece; everything else exists to serve the loop that starts there:

```
Scorecard          a measurable comes in off-goal
    │
    ▼  ⚑ one click
Issues List        it becomes an issue, carrying its week and its number
    │
    ▼  IDS — identify, discuss, solve
To-Dos             the solution becomes a seven-day commitment with an owner
```

That chain is the whole point. An off-track number that stays a number is EOS working badly; the ⚑ button is what makes the meeting produce something. Rocks drop to Issues the same way when they go off track.

**Meeting day is Tuesday.** Weeks are stored as **Monday** `week_start` dates regardless, so the scorecard grid, the issues and the meeting record all join cleanly. The Tuesday is display only — `meetingDateFor()` in `src/utils/eosWeek.js` derives it.

**The current scorecard week is the week that has closed**, not the calendar week you are in. On Tuesday Aug 18 the grid opens on the week starting Aug 10, because that is the week there are complete numbers for.

---

## The page

Six tabs, landing on Scorecard.

| Tab | What it holds | Source |
|-----|---------------|--------|
| **Scorecard** | Measurables × weeks grid, 13 / 26 / 52-week windows | `eos_scorecard_metrics`, `eos_scorecard_entries` |
| **Issues** | Open list, Parking Lot, solved + dropped | `eos_issues` |
| **Rocks** | 90-day priorities, by quarter | `eos_rocks` |
| **To-Dos** | Seven-day commitments, with completion rate | `eos_todos` |
| **Accountability Chart** | Seats by function, GWC dots | `eos_seats` |
| **V/TO** | Vision/Traction Organizer, read-only | `src/data/eosVto.js` — **code, not database** |

A collapsible agenda bar carries the standard 90-minute L10 structure (Segue 5 · Scorecard 5 · Rock Review 5 · Headlines 5 · To-Dos 5 · IDS 60 · Conclude 5).

### Red / Yellow / Green is derived, never stored

A metric's status is computed at render time from its goal, in `scoreEntry()`:

- **green** — meets the goal
- **yellow** — within 10% on the wrong side
- **red** — outside that
- **none** — *no goal set yet*, which is a real and expected state, not a defect

Goals ship deliberately **NULL on every measurable**. The foundation document says to baseline 3–4 weeks of real numbers before locking weekly goals. Because status is derived, setting a goal later re-scores every historical week instantly — a stored status would have frozen the wrong verdict against the baseline period.

### Blank means never entered

`saveEntry` **deletes** the row when a value is cleared rather than writing NULL, so "never entered" and "cleared" stay the same thing. Sparklines skip gaps instead of drawing them as zero.

---

## Schema

Seven tables, all `eos_`-prefixed, all with `updated_at` triggers and RLS. Full column detail is in `docs/DATA_MODEL.md`.

| Table | Notes |
|-------|-------|
| `eos_seats` | Accountability Chart. `major_function` + `seat` unique. GWC are **nullable** booleans — unset is distinct from "no" |
| `eos_rocks` | `quarter` is a text label (`'2026-Q3'`). Status: `on_track` / `off_track` / `done` / `dropped` |
| `eos_scorecard_metrics` | `goal_value` nullable by design. `goal_direction`: `gte` / `lte` / `between`. `is_primary` = the ★ metric |
| `eos_scorecard_entries` | One row per metric per week. `week_start` CHECKed to a Monday. Unique on `(metric_id, week_start)` |
| `eos_issues` | `priority` is the **weekly top-three IDS pick (1–3)**, not a severity grade |
| `eos_todos` | `issue_id` links back to the issue that produced it, so the trail survives the meeting |
| `eos_meetings` | One row per week held. `week_start` unique + Monday-CHECKed. Attendees, 1–10 rating |

### Access

Read *and* write for `admin`, `finance`, `ops`. **The `cortina` role is excluded entirely** — one `FOR ALL` policy per table, keyed off `user_profiles.role`.

This is stricter than most tables in this schema, which grant read with `USING (true)`. EOS content is internal leadership material: revenue targets, open seats, hiring plans, and issues named after individual people. The Cortina sales login must not see any of it.

> `column "role" ...` — the Accountability Chart column is `major_function`, **not** `function`. `function` is non-reserved in Postgres and would technically work, but it is too close to the edge for a column read through PostgREST.

---

## Current data

Seeded from `Dirty_Cookie_EOS_Foundation.pages` (the first EOS session) plus the late-July L10 notes.

- **22 seats** — Leadership 2, Sales 12, Operations 5, Finance 3
- **6 Rocks** for `2026-Q3`
- **10 measurables**, 4 primary (★): Weekly Sales, Sales Pipeline, Cash Balance & Forecast, Innovation Tracking. **No goals set** — baselining
- **32 open issues + 17 parked**
- **4 to-dos**
- **1 meeting record** — week of 2026-07-27, held Tue Jul 28
- **0 scorecard entries** — nothing has been logged yet

### On the source document

Two things read as gaps but are not:

- The Scorecard section says *"5–15 weekly measurables"*. That is the range EOS prescribes, **not a target count**. Ten measurables is inside it.
- The Rocks section says *"Items 7–9 are related deliverables to be confirmed as Rocks or tasks"*. Those were discussed but never entered as rows. Six Rocks is inside that section's own "3–7" guidance.

The extracted tables are exact — parsed from the `.pages` bundle's cell-offset maps, not from loose strings, which matters because a naive read shifts rows wherever a cell is empty and silently reassigns owners.

### Open naming question

**Caroline vs Caro.** The foundation document uses `Caro` as the owner on four measurables and Rock 5; the issues seed and the July attendees use `Caroline`. Not yet normalised.

`Mark` → `Marc` was normalised in `20260818130000`. Note that the issue **"Mark Cuban meeting debrief"** is a different person and is correctly spelled — any future normalisation must match exact array elements, not search text.

Three EOS owners — **PJ**, **Sean**, **Ellen** — have no entry in `docs/PEOPLE.md`. Owner fields are free text and are not tied to accounts, so this is a documentation gap rather than a functional one.

---

## Deployment state

| Half | State |
|------|-------|
| **Database** | **Live.** 5 migrations applied, ledger in sync |
| **Frontend** | **Not deployed.** 12 files + 3 one-line wiring edits, uncommitted |

The frontend was held back on purpose: Cookie Central, Sample Central and EOS all ship from **one Vercel project and one Vite bundle**, so merging EOS to `main` rebuilds and redeploys Sample Central — and the week of Aug 17 was Sample Central's launch week.

The EOS tables are inert until the UI ships; nothing in the deployed app queries `eos_*`.

**One pixel of Sample Central does change when it ships:** `AppSwitcher.jsx` is shared, and internal users will see a fourth tile in the waffle menu. The `cortina` role is filtered out by `internalOnly: true`.

### Files

```
src/pages/Eos.jsx                    six tabs, role gate, agenda bar
src/components/eos/Scorecard.jsx     the centrepiece
src/components/eos/{IssuesList,Rocks,Todos,AccountabilityChart,Vto}.jsx
src/components/eos/bits.jsx          shared inline-edit primitives
src/hooks/useEos.js                  useTable + per-entity hooks
src/utils/eosWeek.js                 ISO week arithmetic, scoring, formatting
src/data/eosVto.js                   V/TO content + L10 agenda

supabase/migrations/20260817120000_eos_foundation.sql
supabase/migrations/20260817130000_eos_seed.sql
supabase/migrations/20260818120000_eos_july_l10.sql
supabase/migrations/20260818130000_eos_marc_spelling.sql
```

Wiring edits: `src/App.jsx` (route, inside `InternalOnly`), `src/components/Sidebar.jsx` (nav item), `src/components/AppSwitcher.jsx` (tile).

---

## Weekly operation

1. Open `/eos`. The Scorecard opens on the week that just closed.
2. Enter each measurable's number for that week. Tab across.
3. Anything off-goal — or any Rock gone off-track — gets ⚑'d into Issues.
4. Rank the top three issues with the 1-2-3 picker.
5. IDS them. Each solution becomes a To-Do with an owner.
6. Record attendees and the 1–10 rating on the meeting row.

After 3–4 weeks of entries, set the goals. Every prior week re-scores when you do.
