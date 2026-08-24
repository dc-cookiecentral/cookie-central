# Demand Planner — what to trust, and what not to

**For everyone using `/demand-planner`, not just whoever is building it.**
Last reviewed: **August 24, 2026**, the day the live feeds went in.

The page went live on real Walmart data on Aug 24 2026. Most of it is solid and
reconciles to Walmart's own totals. **Some of it does not, and looks exactly as
convincing as the parts that do.** This file is the list. Read the first section
before you make a decision with anything on this page.

---

## 🔴 1. Do not plan production off this page yet

**The numbers:** PB&J currently shows **363.8 days on hand** and the recommended
production is **0 cases for all three SKUs**.

**Why they are wrong:** the page computes demand from live Walmart data but the
supply side of the same calculation is still placeholder — production volumes are
a frozen snapshot from 2026-08-13, and there is no DOT on-hand feed at all
(see §3). The days-on-hand and production-recommendation figures are what you get
when you divide a real number by a made-up one.

**Do not trust, on any tab:**

| Figure | Where it appears |
|---|---|
| DC days on hand | Summary cards, Tracker |
| DOT days on hand | Summary cards, Tracker |
| Recommended production / pallets | Summary cards, Tracker |
| DOT closing / DOT opening | Tracker |

**Do trust:** POS, true demand, velocity, in-store fill rate, OTIF, the Walmart
forecast, PO requested / delivered / cuts, and DOT cut recovery. Every one of
those was reconciled against the source files' own total rows.

**On screen, these are marked for you.** Placeholder figures are greyed and
struck through with a `placeholder` badge, their red/amber warning colours are
suppressed (a flag on a made-up number reads as a real alarm), and the tab
carries a notice saying so. If a number is not marked, it is real.

**When this gets fixed:** when `production_runs` has a real feed. It currently
holds **5 rows**. Until then, size co-bakery runs the way you did before this
page existed.

---

## 🔴 2. A page elsewhere in the app will start silently losing data in ~2 months

**Not the Demand Planner — this affects Product Orders, Payments and Alerts.**

Supabase returns a **maximum of 1,000 rows** per query and gives no error when it
truncates. `purchase_orders` is at **892 rows** and grows about **45–50 per
month** from the nightly Cortina export. Around **November 2026** it crosses
1,000, and from that day:

- **Product Orders** silently stops showing some POs
- **Payments** silently misses invoices
- **Alerts** silently misses at-risk orders

No error message. No empty state. Just fewer rows than reality, on pages people
trust.

**Tracked as an open ticket** at the top of `BUILD_PLAN.md` — impact table, fix,
acceptance criteria and the count-check command. **This is pre-existing** — not
caused by the Demand Planner work — but it was found during it, and it has a date
attached. The fix is the same pattern
already used in `src/hooks/useDemandFeeds.js` (`fetchAll`, which pages through
in 1,000-row chunks). The hooks needing it: `usePurchaseOrders.js`,
`usePayments.js`, `useAlerts.js`.

⚠️ It has already bitten once. `po_line_items` (1,194 rows) was silently
truncated on the Demand Planner's first day live — the order book was missing
~16% of its lines and nothing indicated it.

---

## 🟠 3. There is no DOT on-hand report, and there never will be

Confirmed by Caroline, Aug 24 2026. Not "not yet" — it does not exist.

The forward DOT model therefore runs off a fixed opening assumption
(`params.dotOpeningAnchor`, 250 cases) rather than a measurement. **The DOT rows
in the Tracker are a model, not a reading.** Nobody should go looking for a file
to fix this.

Note this is a *different* thing from the **DOT Report (Order History)** upload,
which is real, live, and covers orders and cuts.

---

## 🟠 4. The DOT data on screen is three weeks behind — and that is now a signal

**A DOT report arrives every week** (confirmed Aug 24 2026), so it belongs in the
weekly upload routine alongside the Retail Link files — it is card 5 at
`/uploads`.

The currently loaded export was pulled **2026-07-16** and ends at Walmart week
**202625**, while POS runs to **202628**. The cut-recovery panel warns when this
happens.

**Because the report is weekly, a gap of two weeks or more means an upload was
missed — not that none was available.** Treat the warning as an action, not a
disclaimer: go and upload the latest one.

⚠️ **On the next report, check whether it contains any orders with ZERO cuts.**
The current file has **none** — all 221 rows carry a cut — which means it is
either filtered to exception orders only, or that window (the supply crisis)
really was that bad. Weekly delivery settles this quickly: a normal week with no
clean orders in it means the export is filtered. Until that is answered, the file
is used for cut recovery only and **not** as a record of total deliveries.

---

## 🟠 5. Walmart's data has two defects we work around

**a. The forecast column that isn't a forecast.** The `All Item Detail` sheet has
a `Forecast` row that holds a few real weeks, then a **grand total dropped into a
week column** (WK28, item 679640563: `202631 = 193,305.24`), then zeros. It is
ingested but drives nothing and is deliberately not charted. The Sources tab
reports it as a defect.

⚠️ **A retracted claim.** An earlier version of this work reported that "Walmart
publishes its forecast twice, disagreeing by a different multiple per SKU — WC
×1.0, PB&J ×0.7, CCF ×5.0" and suggested raising it with Bentonville. **That
statistic was computed over the corrupted cells and is withdrawn — please do not
take it to Walmart.** The defensible version is a single observation: CCF reads
26,549 at week 202629 against the Forecast sheet's 5,355.

**b. Item descriptions are wrong on 8 of every 9 rows** in `All Item Detail` —
item `679640563` reads "SC TIRAMISU CUP" on eight of its nine rows. Descriptions
are taken from the `Item Data` sheet instead. **No figure was ever affected**;
item numbers were never in doubt.

---

## 🟡 6. An open business question: which in-stock number is right?

The frozen snapshot had PB&J in-stock at **0.62–0.69** for weeks 21–27. The
current Walmart file says **0.87–0.98** for the same weeks. Walmart restated it.

In-stock divides into demand — the engine uses it to work out what would have
sold if the shelf had been full — so this materially moves the forecast. Both
figures are now visible in the **Sources** tab.

**If your recollection is that PB&J really was around 65% in stock through that
stretch, then it is Walmart's restated figure that deserves the doubt, not
ours.** Nobody has adjudicated this.

---

## 🟡 7. Smaller things worth knowing

- **`mape` (forecast accuracy) stays blank** until a second week's file is
  uploaded. Accuracy scoring compares against the *previous* week's forecast
  snapshot, and snapshots before the first upload are unrecoverable. Expected,
  not broken.
- **Store on-hand only accrues from the first upload onward.** No Walmart export
  carries weekly on-hand history, so older weeks show blank for Store OH DOH —
  blank, not zero.
- **OTIF can never be broken down by SKU.** The export has no item number; it is
  per PO, measured against MABD. Do not request a per-SKU split; it cannot exist.
- **The Supply Plan is ingested but wired to nothing.** It is Walmart's plan for
  what it will *order from us* — not what shoppers will buy. Adding it to the
  demand forecast would double-count.
- **Re-uploading a week you already have is correct, not a mistake.** Walmart
  restates POS after the fact and every feed upserts, so the later file wins.

---

## For whoever picks this up next

**Verifying a deploy by grepping the bundle for strings does not work.** On Aug
24 2026 this page shipped blank — a runtime error on every render — through three
deploys that were each reported as "verified" because the new strings were
present in the bundle. They were: in code that could never execute.

`node scripts/smoke-render.mjs` now renders the page for real and fails if it
throws. Run it before shipping. It covers this page only; the rest of the app has
no equivalent.

Background and reasoning: **ADR-053 → ADR-062** in `DECISIONS.md`, the "As built"
section of `DEMAND_PLANNER_FORMULAS.md`, and `RUNBOOK.md` §2.7 for the weekly
upload routine.
