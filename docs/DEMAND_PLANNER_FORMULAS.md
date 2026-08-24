# Walmart Demand Planner — Formula Reference

> **This is the spec for `src/pages/DemandPlanner.jsx`.** The engine in that file
> is a plain-JS mirror of these formulas, cross-validated against the Excel
> workbook on 23 checks. If you change the engine, re-run that comparison —
> the numbers are used to size co-bakery production runs.
>
> ⚠️ **Before trusting a number off this page, read
> `DEMAND_PLANNER_KNOWN_ISSUES.md`.** The demand side reconciles to Walmart's own
> totals; the supply side (days-on-hand, recommended production) is still
> placeholder and looks just as convincing.
>
> **The demand side is now live.** POS, the Walmart forecast and DC service read
> the `retail_link_*` tables, populated by uploading the weekly Walmart exports
> at `/uploads`. The supply side — `orders`, `production`, `dot` — is still the
> embedded `SEED` snapshot, and each series falls back to SEED independently.
> See **"As built"** at the foot of this file, and ADR-053→056.

Every computed value in the dashboard, in calculation order. These formulas are identical in
the web engine (`demandEngine.ts` / prototype) and the Excel workbook — the two were
cross-validated on 23 checks. Notation: `wk` is the Walmart week (Sat–Fri), `w+1` means next
week. A missing feed value is *null* (shown blank), which is different from zero: a week with
no PO is null, a week with a zero-quantity PO is 0.

## Conventions & parameters

| Parameter | Value | Source / rationale |
|---|---|---|
| Units per case | 12 | Retail Link vendor pack; cross-checked $36.96/cs ÷ 12 = $3.08/unit wholesale |
| Cases per pallet layer | 21 | Every DOT order qty is a multiple of 21 |
| Cases per pallet | 189 | 9 layers × 21 |
| Production MOQ | 756 cases | 4 pallets — minimum co-bakery run |
| Walmart DC safety stock target | 7 days on hand | Confirmed by PH 7/13/26 |
| DOT pipeline target | 14 days on hand | |
| DOT overstock flag | > 28 days on hand | |
| Forecast gap alert | ±15 % | |
| Internal forecast window | trailing 4 weeks | |
| Production lead (model) | 2 weeks | Ordered wk w → arrives DOT wk w+2 (10 d real, rounded up) |
| DOT opening anchor (wk 202605) | 250 cases | Carried from prior Pipeline Tracker; superseded by DOT on-hand feed |
| Walmart DC opening (wk 202605) | 0 cases | Launch assumption |

Unit rule: POS, store on-hand, and the Walmart forecast arrive in **units**; NetSuite, DOT,
production, and all pipeline inventory are in **cases**. Conversion happens exactly once, at
*Demand (cases)*.

## 1. Demand (per SKU, per week)

**Traited stores** — count of distinct stores in the Retail Link pull for that week.

**Stores used** (forward-filled for forecasting)
```
storesUsed(wk) = traited(wk)            if the week has POS data
               = storesUsed(wk−1)       otherwise (2,200 fallback before first actual)
```

**In-stock %** — mean of the per-store binary in-stock flag = share of traited stores in stock.

**True demand (units)** — un-suppresses out-of-stocks:
```
trueDemand = POS units ÷ in-stock %     (= POS units when in-stock is 0 or missing)
```

**Store on-hand days on hand**
```
storeOhDoh = store on-hand units ÷ (POS units ÷ 7)
```

**Actual velocity (units/store/week)**
```
velocity = trueDemand ÷ storesUsed
```

**Base velocity** — the engine's demand rate:
```
baseVelocity = average of velocity over the last 4 weeks with actuals
```

**DC internal forecast (units)** — computed only for weeks after the last actual:
```
internalFcst(wk) = baseVelocity × storesUsed(wk) × seasonalityMult(wk)
```
`seasonalityMult` defaults to 1.00 and is an editable planning input.

**Walmart store forecast (units)** — for each target week, the forecast row whose snapshot
week is the **latest** available (`max snapshot` per target × SKU). The *lagged* variant used
for accuracy scoring takes the latest snapshot **strictly before** the target week.

**Consensus forecast (units)**
```
consensus = consensusOverride    if entered (editable input)
          = internalFcst         otherwise
```

**Walmart vs DC forecast gap**
```
gap = (walmartStoreFcst − internalFcst) ÷ internalFcst        flag when |gap| > 15 %
```

**Walmart forecast error (MAPE)** — fills in as snapshot history accumulates:
```
mape(wk) = |POS units − laggedWalmartFcst| ÷ POS units
```

**Demand (cases)** — the single units→cases conversion, drives the whole pipeline:
```
demandCases = (POS units       if the week has actuals
               else consensus  if a forecast exists
               else 0) ÷ 12
```

## 2. Orders & service (from NetSuite, Cortina)

**PO requested (cases)** = Σ NetSuite line quantity where the *Delivery Date* (requested)
falls in the week. **Delivered (cases)** = same, by *Actual Delivery Date*.
```
deliveryVariance = delivered − requested
fillRate         = delivered ÷ requested        flags: < 98 % amber, < 90 % red
cutLines         = count of lines with a Cut Reason, by requested week
invoicedRevenue  = Σ Amount by actual-delivery week
```
Caveat: NetSuite zeroes quantity on fully-cut lines, so `requested` understates the true
order book — see §6 for the DOT-based recovery.

## 3. Walmart DC inventory cascade (cases)

Computed left→right across weeks:
```
dcOpen(wk)  = 0 at launch;  max(0, dcClose(wk−1)) after
dcIn(wk)    = dotOut(wk)                      (arrivals from DOT)
dcOut(wk)   = demandCases(wk) + ΔstoreOH(wk)/12
              where ΔstoreOH = storeOH(wk) − storeOH(wk−1) on actual weeks, 0 on forecast weeks
              (so DC outbound = shipments to stores, and DC inventory excludes store stock)
dcClose(wk) = dcOpen + dcIn − dcOut
dcTarget(wk) = (7 ÷ 7) × demandCases(wk+1)            (7-day forward cover)
dcDaysOnHand(wk) = dcClose(wk) ÷ (demandCases(wk+1) ÷ 7)      flag < 7 red
```

## 4. DOT inventory cascade (cases)

```
dotOpen(wk)  = 250 at launch;  max(0, dotUsed(wk−1)) after
dotIn(wk)    = production actual(wk−2), else planned output(wk−2)
               (first two weeks use same-week values — pre-history boundary)
dotOut(wk)   = delivered(wk)                      if actuals exist
             = requested(wk)                      else if a PO exists
             = max(0, dcTarget − dcOpen + dcOut)  else (reorder-up-to model)
dotCloseModeled(wk) = dotOpen + dotIn − dotOut
dotUsed(wk)  = DOT actual on-hand(wk) if the feed has it, else dotCloseModeled
               (the feed re-anchors the whole forward cascade)
dotTarget(wk) = (14 ÷ 7) × demandCases(wk+1)          (14-day forward cover)
dotDaysOnHand(wk) = dotUsed(wk) ÷ (demandCases(wk+1) ÷ 7)     flags: < 7 red, > 28 amber
```

## 5. Co-bakery production (cases)

Production ordered in week w arrives at DOT in week w+2, so the recommendation looks two
weeks ahead:
```
recommended(w) = ceiling( max(0, dotTarget(w+2) − dotOpen(w+2) + dotOut(w+2)), 756 )
                 (final two weeks clamp w+2 to the last planning week)
plannedShifts  = recommended ÷ 756, rounded up
plannedOutput  = plannedShifts × 756
productionVariance = actualShipped − plannedOutput      (when an actual is keyed)
pallets        = (actualShipped, else plannedOutput) ÷ 189
```

## 6. DOT service & cut recovery panel (all SKUs)

From the DOT "Order History" export (exception slice — every PO carries a cut), joined to
NetSuite by Walmart PO number. Report-internal identity verified on all delivered rows:
`Reconciled = Ordered − Cut`.
```
trueOrderBook(wk) = NetSuite requested(wk) + DOT cut(wk)
trueFill(wk)      = NetSuite delivered(wk) ÷ trueOrderBook(wk)
recoveredCases    = Σ DOT cut     (order volume invisible in NetSuite because cut lines are zeroed)
```
Window shown (deliveries 6/18–7/20): ordered 12,747 · cut 10,756 · NetSuite cut reasons on
fully-cut POs: "Restricted Supply — Supplier" 119 of 136.

## 7. Summary metrics (per SKU card)

Anchored at the last week with POS actuals (`L4W` = that week and the 3 before; `N4W` = the
4 weeks after):
```
POS last 4 wks (cs/wk)   = mean(POS units, L4W) ÷ 12
True demand (cs/wk)      = mean(trueDemand, L4W) ÷ 12
In-stock                 = in-stock % at the anchor week
Fill rate last 4 wks     = Σ delivered(L4W) ÷ Σ requested(L4W)
DOT days on hand         = dotDaysOnHand at the anchor week
Walmart vs our fcst, N4W = mean(walmartFcst, N4W) ÷ mean(internalFcst, N4W) − 1
Open order book (N4W)    = Σ requested over the next 4 weeks
Recommended production   = Σ recommended over the next 4 weeks (÷189 for pallets)
Week-over-week           = POS(anchor) ÷ POS(anchor−1) − 1
```

## 8. Flow chart series (all in cases/week)

```
DC → DOT       = production actual, else planned output on forecast weeks
DOT → depots   = delivered, else requested order book on forecast weeks
POS            = POS units ÷ 12
Walmart fcst   = walmart store forecast units ÷ 12
```

## 9. Chain-balance chips (trailing 4 weeks, cases)

```
in    = Σ production shipped to DOT
thru  = Σ delivered to Walmart depots
out   = Σ POS ÷ 12

DOT buffer   = in − thru
Depot buffer = thru − out
```
Each buffer is compared to `out` (takeaway): within ±15 % → **balanced** (green); negative
beyond that → **draining** (amber, red past 50 %); positive beyond → **building** (blue).
A special red chip fires when production = 0 over the window while POS > 0.

## Known modeling caveats

The DC and DOT inventory lines are models until the DOT on-hand feed lands (then DOT
anchors to actuals weekly). NetSuite's zeroed cut lines mean `requested` and `fillRate`
read optimistic — the DOT panel's true-fill is the corrected view where the exception
report covers the window. Fill rate compares delivered-week to requested-week, so timing
slips can show > 100 %. Store-count projection carries the last actual forward; planned
door growth belongs in the seasonality multiplier until a traited-store forecast feed exists.

---

---

# As built — the live Retail Link feeds

**Status: August 24, 2026.** Built and building clean; the migration
`20260824120000_retail_link_demand_feeds.sql` is **not yet applied**, so the page
is still running on `SEED` until someone applies it and uploads a file. The
sections this replaces were written before anyone had read a real export and
several of their conclusions were wrong; the corrections are called out below so
the same wrong turns are not taken twice.

## What feeds what

| Engine series | Source | Status |
|---|---|---|
| `pos` | `retail_link_pos_weekly` ← `All Item Detail` sheet | **live** |
| `forecasts` | `retail_link_forecast` ← `Forecast` sheet | **live** |
| `dotService` | `dot_order_history` ← DOT `Order History` export | **live** |
| `otif` | `retail_link_otif` ← OTIF `Receiver` sheet | **live** |
| `orders` | `po_line_items` + `purchase_orders` ← Cortina/NetSuite export | **live** |
| `production` | — `production_runs` holds 5 rows | SEED |
| `dot` | 🔴 **no such feed exists** — there is no DOT on-hand report | permanently empty; engine uses `params.dotOpeningAnchor` |

⚠️ **The `orders` series reads TWO different dates.** `req` and `cuts` bucket by the PO's *scheduled* delivery week; `dlv` and `rev` bucket by the line's *actual* delivery week (per line — DCs on one SO deliver on different days). Verified against SEED: `req` 49/49, `cuts` 49/49 exact. `cuts` is a **count of lines** carrying a cut reason, not a sum of cut cases. See ADR-059.

🔴 **There is no DOT on-hand report** (Caroline, Aug 24 2026) — not "not yet", it does not exist. The Tracker's DOT rows are therefore a **model**, never actuals. Do not read `dotDoh` as measured.

⚠️ **`otif` and `dotService` are separate on purpose.** OTIF is Walmart measuring us against MABD, keyed on Walmart's week; cut recovery is what DOT failed to ship, keyed on delivery date. Same shipments, opposite ends, and **the weeks do not align** — merging them averages two different things. See ADR-058.

⚠️ **Two different files are called "the DOT report".** `dot_order_history` (orders and cuts — live) and `dot_inventory` (pallet-level on-hand — does not exist). Neither substitutes for the other.

🔴 **The only DOT export on hand was pulled 2026-07-16 and is stale** (weeks 202620–25 only). In it, 0 of 221 rows had no cut — either the export is exception-filtered, or that window is the documented supply crisis. A current export settles it; see ADR-060 for the test. Either way it is **not** a usable record of total depot deliveries and must **not** drive `dotOut`; doing so understates DOT's outflow ~6× and suppresses the production recommendation. It is surfaced in the Tracker as "DOT delivered — cut orders only". See ADR-060 for how to turn it on if an unfiltered export arrives — and for the one test that tells them apart.

`retail_link_supply_plan` is also ingested (Walmart's forward **order** plan, ADR-057) but is **not yet wired into the engine** — it lands and is queryable, and connecting it to the `orders` series is the next piece. ⚠️ It is not the store forecast: `retail_link_forecast` is what Walmart expects consumers to buy, the supply plan is what Walmart plans to order from us. Adding them together double-counts.

Code: `src/parsers/retailLink.js`, `src/parsers/retailLinkOtif.js`,
`src/hooks/useDemandFeeds.js`, and the `input` memo in `DemandPlanner.jsx`.
Schema detail is in `docs/DATA_MODEL.md`; the reasoning is in ADR-053→056.

**Each series falls back to SEED independently** when its table is missing
(pre-migration) or empty (pre-first-upload). That is what lets the migration,
the first upload and the cutover happen on different days without the page ever
breaking. The banner reports which source won per series — do not replace it
with a flat "live" or "static" claim, because it is genuinely both.

## The weekly routine

Six exports, in the order they appear on `/uploads` (ADR-057):

1. `Dirty Cookie Supply Plan WK#` — Walmart's forward order plan
2. `Dirty Cookie WK#` — POS, in-stock, traited stores, store forecast
3. `OTIF Store Performance` — 1 week
4. `OTIF Store Performance` — 3 weeks (overlaps #3 on purpose; upload both)
5. `DOT Report` — the `Order History (N).xlsx` outbound export (orders + cuts)
6. `Walmart Report (NetSuite)` — drives the `orders` series; also auto-ingests nightly from `systems@`

Re-uploading weeks you already have is not just safe, it is how the numbers stay
correct (see below). `/demand-planner` picks them up on next load; the banner's
"as of" is the newest week **with data**, not the time of the fetch.

⚠️ **The paste-in Inputs tab was removed** on Aug 24 2026 — every feed it
duplicated now has a real, persisted upload path, and a second lossy ingest route
meant two sources of truth for the same numbers. Its DOT **on-hand** hand-entry
went with it, and the Order History export does not replace it (that file carries
orders and cuts, not on-hand), so the `dot` series stays empty and the forward
cascade runs on `params.dotOpeningAnchor` until a pallet-level export arrives.

`scripts/inspect-retail-link.mjs <file.xlsx>` runs every parser over every sheet
and prints a coverage map. Reach for it first when an export changes shape.

## Corrections to what this document used to say

**❌ "The three xlsx attachments."** The workbook has **nine** sheets:
`Sales Summary`, `All Item Detail`, `Scorecard`, `Last Week Data`, `Sales Data`,
`Markdown`, `Warehouse Inv`, `Item Data`, `Forecast`. The three-attachment model
came from the retired weekly email, not from the export.

**❌ "`parseSalesSummary` is the closest thing to POS by SKU by week — start
there."** It is a single "last week" column. The real feed is **`All Item
Detail`**, a long-format matrix with ~55 Walmart-week columns and nine measures
per item. **One upload backfills the whole year.** The belief that POS would
accrue one week per file was the thing that made this look like a big project.

**❌ "`parseFile` already handles both CSV and XLSX, so the format question is
settled by existing code."** It is not. `parseXlsxFile` returns header-keyed
objects **concatenated across every sheet**, and these exports carry a title row
above the header. Measured on a real file: **0 of 12 rows** carried
`Prime Item Nbr`, `LW POS Qty` or `Curr Str On Hand`. Retail Link parsers use the
`parseFile(file)` hook and read sheets directly (ADR-055).

**❌ "The forecast feed's grain is unsettled / may make `mape` impossible."**
The `Forecast` sheet is weekly and clean — 3 items × 24 weeks, no duplicates.
Stamping the file's own week as `snapshot_week` works exactly as the fallback
predicted, so `mape` becomes computable once two weeks are loaded.

**❌ "They have never been run against a real file."** Too strong.
`src/data/itemMaster.js` records `parseItemMaster` producing *verified* output
from a real `Dirty Cookie WK16.xlsx`. Its numbers reproduce exactly.

**❌ "`parseSupplyPlan` — possibly the forecast feed."** Its `Supply Plan` sheet
is **monthly** and cannot feed a weekly engine — but the file is not a dead end.
Its `Data` sheet is date-grain and is a **different dataset entirely** (its
`metadata` sheet names it "Order Forecast"), now ingested to
`retail_link_supply_plan`. An intermediate reading of this file — that the `Data`
sheet merely duplicated the `Forecast` sheet — was also wrong.

**⚠️ "Keep `SEED` until a live feed reproduces the same numbers."** Do **not**
follow this literally — see the next section.

## The three things that will bite you

**1. Walmart restates POS.** Week 202622 reads `1322` units for PBG in SEED
(frozen 2026-08-13) and `2343` in the WK28 export; WC reads `4035` and `4847`.
In-stock was restated too — SEED has PBG at 0.62–0.69 for weeks 21–27 where the
file says 0.87–0.98. Week alignment was checked at offsets −2…+2 and zero-shift
wins, so this is restatement, not a calendar bug.

Two consequences. The tables **upsert** — a correctness requirement, not
re-upload hygiene. And **"reproduces SEED" is the wrong acceptance test**: SEED
is a stale snapshot, and a live number differing from it on a restated week is
the feed working. What SEED is still good for is the *engine* — it is the input
the 23-check Excel cross-validation ran against, which is why the engine still
must not be casually tidied.

**2. Future week columns read `0`, not null.** The parser bounds POS at the
file's own week. A week with no PO is null; a week with a zero-quantity PO is 0;
the engine treats those differently and cannot detect a fabricated zero.

**3. There is no weekly store on-hand anywhere.** Only the current position,
from `Sales Summary` / `Item Data`. `store_on_hand` is written for the file's own
week and left **NULL** for backfilled weeks — never 0 — so it accrues one week
per upload from here on.

## Which forecast? There are three

`/demand-planner` → **Sources** shows them side by side. See ADR-061.

| Number | Where it comes from |
|---|---|
| Walmart store forecast | `Forecast` sheet, raw rows — **the one the engine uses** (only copy with a snapshot week) |
| DC internal | derived: base velocity × stores used × seasonality |
| Consensus | internal, after override and seasonality |

🔴 **All Item Detail's `Forecast` row is malformed — do not chart it.** It holds a few real weeks, then a **grand total in a week column** (WK28, item 679640563: `202631 = 193,305.24`), then zeros. Ingested but drives nothing and is not displayed as a series.

⚠️ **Walmart's description column in All Item Detail is wrong on 8 of every 9 rows** — only the first row per item carries the right label. Descriptions come from the `Item Data` sheet instead. Item numbers were never affected.

## Service metrics — in-store fill rate and OTIF

The two headline numbers, in the **Service health** panel above the S&OP cards
(Caroline, Aug 24 2026). **OTIF = In Time and In Full.** They are the two ends of
the chain: OTIF is whether we delivered to Walmart complete and to the date;
in-store fill is whether it then reached the shelf. Both sit above the demand
read because a problem in either invalidates it — suppressed POS from an
out-of-stock is not weak demand.

```
OTIF(week)          = SUM(cases_on_time) / SUM(cases_ordered)     -- CASES, never a mean of per-PO %
inStoreFill(week)   = mean(instock_pct) across SKUs with sales    -- simple mean, not weighted
```

**Both formulas were verified against the exports' own total rows**, and both
obvious alternatives are wrong:

| | computed | file states |
|---|---|---|
| OTIF, cases-weighted | `0.646224` | `0.6462` ✅ |
| OTIF, mean of per-PO % | `0.6844` | ❌ 4 points high |
| In-stock, simple mean | `98.1500%` | `98.1467%` ✅ |
| In-stock, traited-weighted | `98.0967%` | ❌ |
| In-stock, POS-weighted | `98.1256%` | ❌ |

The `Scorecard` sheet's own "Repl Instock %" (`98.2503%`) is a **different
denominator again** — do not treat it as interchangeable with the Sales Summary
total.

⚠️ **OTIF can never be split by SKU.** There is no item number anywhere in the
OTIF export — it is per PO against MABD. It is a whole-business weekly figure
while in-stock is per-SKU, which is why the two halves of the panel are shaped
differently. The panel says so on screen.

⚠️ **Pre-launch weeks are excluded from the fill headline.** They carry in-stock
0 against a handful of test stores back to 202601; averaging those genuine zeros
would show a catastrophic outage in weeks the product was not on sale.

Thresholds mirror the Tracker's rows — in-stock < 65% bad / < 80% warn, OTIF
< 90% / < 98%. **Display thresholds, not Walmart-published targets.** Change both
places together, or the same metric gets flagged two ways on one page.

Field names stay Walmart's: the column is `cases_on_time`, matching the export's
literal `Cases On Time` header. Prose says "In Time and In Full"; the field names
have to match the file or the column match breaks on the next upload.

## Conventions this repo will hold you to

Learned the hard way; all of them cost real time at least once.

- **A passing build proves nothing.** Grep the deployed bundle for a distinctive
  string. `curl` the site, pull `/assets/index-*.js`, and check the hash changed.
- **Runtime-parsed flags are not constant-folded.** Grepping for a guarded
  string returns a hit whether the flag is on or off — see the
  `VITE_SAMPLE_TEST_MODE` note in the Sample Central docs. Check the env literal.
- **Merging to `main` redeploys Sample Central**, which serves live Cortina
  traffic — one Vercel project, one Vite bundle.
- **Seed an account before its first sign-in.** `COALESCE(seed.role,'ops')` plus
  `ON CONFLICT (id) DO NOTHING` means an unseeded sign-in silently becomes
  internal `ops` and never self-corrects.
- **Postgres `date` columns are bare `YYYY-MM-DD`.** Use `formatDate` from
  `utils/dates.js`; `new Date(value)` treats them as UTC and lands a day early
  west of Greenwich.
- **No Docker.** `npx supabase db push` works (it hits the remote directly);
  Docker is only needed for the *local* stack. Applying SQL by hand through the
  Management API or SQL editor writes no history row, so `migration list` is not
  the truth about what is applied (ADR-047).

## Still open

> ⚠️ **The team-facing version of this list is `DEMAND_PLANNER_KNOWN_ISSUES.md`** —
> written for the people using the page rather than the people building it, and
> it leads with the two items that can actually cause harm. Keep the two in sync.


- **Apply the four pending migrations** (`20260824120000`, `130000`, `140000`, `150000`), then upload the six exports once.
- **`production`** is the last series with no live source (`production_runs`
  holds 5 rows). The `dot` on-hand series has no source and never will.
- **Restore the cut-reason breakdown** in the cut-recovery panel. It was
  removed as hardcoded prose (ADR-058) and `cut_reason` is now ingested
  (ADR-059), so it can come back as a computed breakdown.
- **Confirm the restated in-stock.** SEED has PBG at 0.62–0.69 for weeks 21–27,
  the file says 0.87–0.98. In-stock divides into demand, so this materially moves
  the forecast. If PB&J really was ~65% in stock through that stretch, it is
  Walmart's restated figure that deserves the doubt, not SEED's.
- **`mape` stays blank** until a second week's file lands.
