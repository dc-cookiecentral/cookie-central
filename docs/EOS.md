# EOS Tracker

The third project in this repo, after Cookie Central and Sample Central. It is the standing record for Dirty Cookie's **Level 10 meeting** — the weekly leadership rhythm from EOS (*Traction*, Gino Wickman).

Route: **`/eos`**, inside the internal shell. Built August 17–19, 2026. See **ADR-047** in `docs/DECISIONS.md` for the reasoning behind the schema.

**Status: live.** Database and frontend both shipped — `/eos` is in the sidebar for internal roles. Eight migrations applied. See [Deployment state](#deployment-state).

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
| `eos_todos` | `issue_id` links back to the issue that produced it, so the trail survives the meeting. `metric_id` + `metric_week` (added `20260823140000`) hang a To-Do off a **measurable** instead, which is what the Scorecard's `▸` panel reads. `ON DELETE SET NULL`, never CASCADE — retiring a measurable must not silently delete outstanding commitments. Unique on `(issue_id, title)` where `issue_id` is not null, so one issue cannot spawn the same To-Do twice |
| `eos_meetings` | One row per week held. `week_start` unique + Monday-CHECKed. Attendees, 1–10 rating |

### Access

Read *and* write for `admin`, `finance`, `ops`. **The `cortina` role is excluded entirely** — one `FOR ALL` policy per table, keyed off `user_profiles.role`.

This is stricter than most tables in this schema, which grant read with `USING (true)`. EOS content is internal leadership material: revenue targets, open seats, hiring plans, and issues named after individual people. The Cortina sales login must not see any of it.

> `column "role" ...` — the Accountability Chart column is `major_function`, **not** `function`. `function` is non-reserved in Postgres and would technically work, but it is too close to the edge for a column read through PostgREST.

---

## Current data

Seeded from `Dirty_Cookie_EOS_Foundation.pages` (the first EOS session) plus the late-July L10 notes.

*(counts as of Aug 23 2026)*

- **22 seats** — Leadership 2, Sales 12, Operations 5, Finance 3. ⚠️ **GWC is empty on all 22** — owner and accountable-for are complete, but Get it / Want it / Capacity are unset across the board, and that is the part of the chart that does the work
- **6 Rocks** for `2026-Q3`, all now **due 2026-09-30**. A Rock is a 90-day commitment, so the quarter end *is* the due date; stagger by hand if one genuinely lands earlier
- **13 measurables**, 4 primary (★): Weekly Sales, Sales Pipeline, Cash Balance & Forecast, Innovation Tracking. **10 carry goals; 3 are still baselining** — see *Goal shapes* below
- **32 open issues + 17 parked**, none ever solved. A Level 10 IDSs about three per meeting, so this wants triage before the first one
- **7 to-dos**, all dated. Four are the founding-L10 tasks, backdated to the week of 2026-07-27 and therefore **overdue** — which is accurate: "Stand up a weekly Level 10", "Begin running the Scorecard weekly", "Finalize the quarter's Rocks" and "Fill the OPEN seats" are the launch tasks and none is done
- **1 meeting record** — week of 2026-07-27, held Tue Jul 28 (Paul · Caro · Shahira · Dave · Marc)
- **0 scorecard entries** — nothing has been logged yet, so the trend grid is blank by design

### Goal shapes — not everything is "number goes up"

Set in `20260823120000` after a pre-launch review. The three shapes the engine
supports are `gte`, `lte` and `between` (which uses `goal_max`), and choosing
the wrong one is silently wrong rather than visibly broken:

| Measurable | Shape | Goal | Where the number came from |
|---|---|---|---|
| Innovation Tracking | `gte` | 100% | % of planned milestones complete **to date**, not % of the whole project. At 100 you are on plan, and the engine's own bands then reproduce the R/Y/G the foundation document asked for |
| Service Level | `gte` | 98% | Demand planner threshold (<98% amber, <90% red) |
| Sample Service Level | `gte` | 95% | % delivered on or before `required_by`. **Not computable yet** — no real carrier delivery has ever been observed |
| AR — Days Sales Outstanding | `lte` | 45d | Actual is **55.2d** across 336 paid invoices (range 9–80). A real stretch |
| AP — Days Payable Outstanding | `gte` | 30d | Net-30 assumption. **Not computable** — `invoices` and `payments` are both empty |
| Inventory — Finished Goods | `between` | 14–28d | Demand planner constants: DOT target 14d, overstock flag >28d |
| Inventory — Raw Materials | `between` | 21–45d | **Starting point.** Every `raw_materials` row carries the same placeholder `default_lead_days` of 14, so lead time cannot differentiate the three yet |
| Inventory — Packaging | `between` | 30–60d | **Starting point.** No expiry, larger minimums, so it tolerates more cover |
| Cookie Central Utilization | `gte` | 90% | **Placeholder** — needs a definition first: which orders are the denominator? |
| QA / Customer Complaints | `lte` | 0 | Note `scoreEntry`'s tolerance is 10% of the goal, which is **zero** here. No yellow band; any complaint is red. Deliberate for QA |
| Weekly Sales · Sales Pipeline · Cash Balance | — | *baselining* | Ellen's to set. **Weekly Sales should probably be a rolling 4-week average**: weekly shipped revenue swings $0–$100k, so a weekly threshold tracks shipping timing rather than performance |

Two rows were **split**, because neither could be scored as one number:

- **`AP / AR`** — AP days you want longer, AR shorter. No single direction works.
- **`Inventory`** — FG, Raw and Pkg have different stock profiles and different bounds.

And `Inventory` was `lte 28d` before the split, which meant a warehouse at **2 days on hand scored bright green**. Days on hand has a floor as well as a ceiling.

### To-Dos that hang off a measurable

The Scorecard's `▸` disclosure opens a panel per measurable. **Carry-forward is a
query, not a job**: `useMetricTodos` lists every linked To-Do with `done = false`
*regardless of which week raised it*, so an open item keeps appearing until
someone ticks it, then the row collapses. `metric_week` records the raising
week so a carried-over item reads as carried over rather than new.

Nothing copies rows forward, deliberately. Copying would produce one duplicate
per week, each needing its own tick — which is exactly what the three identical
`P0 · Transition to FreshCoast` To-Dos were before `20260823160000` collapsed
them and added the uniqueness guard.

### On the source document

Two things read as gaps but are not:

- The Scorecard section says *"5–15 weekly measurables"*. That is the range EOS prescribes, **not a target count**. Thirteen is inside it — it was ten until the AP/AR and Inventory splits.
- The Rocks section says *"Items 7–9 are related deliverables to be confirmed as Rocks or tasks"*. Those were discussed but never entered as rows. Six Rocks is inside that section's own "3–7" guidance.

The extracted tables are exact — parsed from the `.pages` bundle's cell-offset maps, not from loose strings, which matters because a naive read shifts rows wherever a cell is empty and silently reassigns owners.

### Names

Owner fields are **free text, not account FKs** — a seat or Rock can name someone with no login.

Two normalisations, both done as follow-up `UPDATE` migrations rather than edits to the applied seed:

- **`Caroline` → `Caro`** (`20260819120000`) — Caro is the nickname she goes by, and what the foundation document already used on four measurables and Rock 5. Five values across `eos_seats`, `eos_issues`, `eos_todos` and the July `eos_meetings` attendees. `docs/PEOPLE.md` keeps her full name; this is the owner field, not her identity.
- **`Mark` → `Marc`** (`20260818130000`).

Both match **whole values only, never substrings** — `Caro` is a prefix of `Caroline`, so a text-search rewrite would corrupt the rows already correct. Note that the issue **"Mark Cuban meeting debrief"** is a different person and is correctly spelled — any future normalisation must match exact array elements, not search text.

**Resolved Aug 23 2026** (`20260823120000`), and one of the three was not a missing person at all:

- **`PJ` was Paul Hardy** under a third label — metrics said `PJ`, Rocks and issues said `Paul`, seats and To-Dos said `Paul (PJ)`. All normalised to **`Paul`** across six tables including `eos_meetings.attendees`.
- **Ellen** is seeded as `ellen@dirtycookie.com`, role **`finance`** — least privilege that still carries EOS write. She owns **5 of the 13 measurables**, more than anyone. Her surname is still unrecorded; `full_name` is literally "Ellen".
- **Sean** and **Serina** are **deliberately not seeded** (Caroline, Aug 23). They appear as owners because the fields are free text; neither owns a measurable. Don't seed them.

⚠️ Owner fields are still **free text with no FK to `user_profiles`**, so nothing can filter "my measurables" and nothing stops a fourth spelling appearing. Worth linking if the scorecard grows.

---

## Deployment state

**Both halves are LIVE as of Aug 23 2026.**

| Half | State |
|------|-------|
| **Database** | **Live.** 8 migrations applied |
| **Frontend** | **Live** — merged in PR #44 and deployed; `/eos` is in the sidebar |

The frontend was held back through Sample Central's launch week on purpose:
Cookie Central, Sample Central, the Demand Planner and EOS all ship from **one
Vercel project and one Vite bundle**, so merging EOS to `main` rebuilds and
redeploys Sample Central. It shipped once Sample Central was launched and
verified, and Sample Central's launch state (test mode off, floor 1206, SKU
labels) was re-checked in the deployed bundle afterwards.

That coupling has not gone away — **any merge to `main` redeploys Sample
Central, which now serves live Cortina traffic.** Verify the deployed bundle
after a merge, not the build log.

**One pixel of Sample Central changed when it shipped:** `AppSwitcher.jsx` is shared, so internal users see an extra tile in the waffle menu. The `cortina` role is filtered out by `internalOnly: true`.

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
supabase/migrations/20260819120000_eos_caro_nickname.sql
supabase/migrations/20260823120000_eos_launch_prep.sql          goals, PJ->Paul, Ellen
supabase/migrations/20260823140000_eos_rock_dates_and_metric_todos.sql
supabase/migrations/20260823160000_eos_dedupe_todos.sql
```

Wiring edits: `src/App.jsx` (route, inside `InternalOnly`), `src/components/Sidebar.jsx` (nav item), `src/components/AppSwitcher.jsx` (tile).

⚠️ **`src/utils/eosWeek.js` does its own local-midnight date parsing on purpose.** Its module header warns that `new Date('2026-08-18')` parses as UTC and lands a day early west of Greenwich — and the *renderers* ignored that warning, printing the Level 10 date as Aug 17 for a meeting on Aug 18. Fixed at source in `utils/dates.js` (PR #46): `formatDate` and `daysUntil` now detect a bare `YYYY-MM-DD` and parse it locally. **Use `formatDate` for anything from a Postgres `date` column; it is now correct for both shapes.**

---

## Weekly operation

1. Open `/eos`. The Scorecard opens on the week that just closed.
2. Enter each measurable's number for that week. Tab across.
3. Anything off-goal — or any Rock gone off-track — gets ⚑'d into Issues.
4. Rank the top three issues with the 1-2-3 picker.
5. IDS them. Each solution becomes a To-Do with an owner — or, if it belongs to a specific measurable, add it under that measurable's `▸` panel, where it will keep appearing weekly until ticked.
6. Record attendees and the 1–10 rating on the meeting row.

After 3–4 weeks of entries, set the remaining goals — Weekly Sales, Sales Pipeline and Cash Balance are the three still open. Every prior week re-scores the moment you do.

### Before the first real Level 10

- [ ] Triage the **32 open issues** — a meeting solves ~3
- [ ] Fill in **GWC** on the 22 seats
- [ ] Set the three financial goals
- [ ] **Shahira and Marc are seeded but have never signed in** — confirm the role resolved afterwards; `ON CONFLICT (id) DO NOTHING` means a wrong one never self-corrects
- [ ] Give `P0 · Transition to FreshCoast` an owner (its source issue has none either)
- [ ] Record Ellen's surname
