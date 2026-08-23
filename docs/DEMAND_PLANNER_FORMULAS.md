# Walmart Demand Planner — Formula Reference

> **This is the spec for `src/pages/DemandPlanner.jsx`.** The engine in that file
> is a plain-JS mirror of these formulas, cross-validated against the Excel
> workbook on 23 checks. If you change the engine, re-run that comparison —
> the numbers are used to size co-bakery production runs.
>
> The page currently runs on an embedded `SEED` snapshot (`SEED.asOf`), not on
> Supabase. See the header comment in `DemandPlanner.jsx` for what wiring it to
> live data would require.

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

# Wiring it to live data — start here

**Status as of Aug 23 2026: the page is LIVE at `/demand-planner` and runs on a
static snapshot.** Everything below is what a session picking this up needs to
know before designing anything. Written so you don't have to rediscover it.

## What exists today

`src/pages/DemandPlanner.jsx` — ported in from a standalone artifact, engine and
data unchanged. It reads one embedded `SEED` constant frozen at `SEED.asOf`
(2026-08-13) and carries a banner saying so. Edits, pastes and overrides live in
component state for the session and are lost on reload. `recharts` was added for
it; the app had no charting library before.

**Do not casually refactor the engine.** It is a plain-JS mirror of the formulas
above, cross-validated against the Excel workbook on 23 checks. If you change
it, re-run that comparison.

## The blocker: the feeds have no home in the schema

This is the finding that decides the whole shape of the work. Checked against
the live database, searching for anything matching `%pos%`, `%retail%`,
`%forecast%`, `%velocity%`:

| `SEED` series | Feeds | Where it would come from today |
|---|---|---|
| `pos` | POS units, $, traited stores, in-stock %, store on-hand | **No table exists.** This is the primary feed and the whole demand side |
| `forecasts` | Walmart store forecast, by snapshot week × target week | **No table exists.** Needs snapshot history for the MAPE/lagged logic |
| `dotService` | DOT ordered / cut / POs, the cut-recovery panel | **No table exists** |
| `dot` | DOT on-hand, which re-anchors the forward cascade | `dot_inventory` exists but is **empty (0 rows)** |
| `production` | Cases produced per week per SKU | `production_runs` exists — **5 rows** |
| `orders` | NetSuite requested / delivered / revenue / cuts | `purchase_orders` (892) + `po_line_items` (1,194) — **the one series with a real source** |

So "wiring it up" is really: **design three or four new tables, plus an ingest
path.** It is a project, not a task. Schema is the easy half.

## The real open question is ingest, and it is now WIDE open

🔴 **The weekly Bentonville Retail Link email is retired (Caroline, Aug 23
2026).** An earlier draft of this section recommended extending that path as the
cheapest route to POS data. **Do not.** It is dead.

Be precise about what died, because it is narrower than it first sounds: **the
`systems@` email reader itself is being KEPT.** The daily poll still runs,
`InboxCard` is still on `/uploads`, and Product Orders and the BOL flow are
expected back around Oct 2026 with substantial changes. What is retired is the
weekly Bentonville *feed*, not the email pipeline. So "get it from email" is not
categorically off the table — that one sender is.

What that leaves:

- `weekly_reports` holds 6 rows, newest `2026-07-06` — nothing has landed since
  early July, consistent with the feed being dead.
- `src/parsers/weeklyEmail.js` (body scorecard) and
  `src/parsers/weeklyAttachments.js` (the three xlsx: `parseSalesSummary`,
  `parseMarkdown`, `parseItemMaster`, `parseScorecard`, `parseSupplyPlan`,
  `parseOtifDetail`) **both exist and were never wired to an ingest path** —
  their header says the caller was "the dev test now, the Gmail/Edge-Function
  connect later", and later never came.

**Those parsers are still worth reading even though the email is gone.** They
encode the actual column names and shapes of the Walmart BI exports —
`parseSalesSummary` in particular is the closest thing in the repo to
POS-by-SKU-by-week. If the same reports arrive by another route (a manual
download, a different mailbox, a Retail Link pull), the parsing work is largely
done and only the transport changes.

## ✅ ANSWERED: Retail Link data arrives as an uploaded CSV / XLSX

**Caroline, Aug 23 2026.** Not email, not an API — a **file upload**. That is a
better fit than the email path would have been, and most of the machinery
already exists.

**`UploadPipeline` is already generic.** `src/components/UploadPipeline.jsx`
does drag-drop → parse → preview → confirm → import, logs to `upload_log`
(`upload_type`, `filename`, `row_count`, `status`, `errors`, `source`), and is
driven entirely by a **parser config object**. Adding a feed means writing that
config, not building an upload flow. The shape, from
`src/parsers/ingredientMaster.js`:

```js
export default {
  type: 'ingredient_master',          // → upload_log.upload_type
  label: 'Ingredient Master',
  accept: '.csv,.xlsx,.xls',
  columns: [ { key, label }, … ],     // preview table
  parse(rows),                        // 2D array → { records, errors }
  importRecords(records, { uploadId, client }),
  // parseFile(file) instead of parse(rows) ONLY for multi-sheet workbooks
  // that need workbook structure the row-flattener destroys (see production.js)
};
```

`parseFile` in `src/utils/csvParser.js` already handles **both CSV and XLSX** →
rows, so the format question is settled by existing code.

**And the Walmart parsers already take exactly that input.**
`src/parsers/weeklyAttachments.js` exports six pure functions that accept
`rows` — a single sheet as a 2D array from SheetJS `sheet_to_json(ws, {header: 1})`
— which is precisely what `parseFile` produces. They were written transport-
agnostic on purpose; its header says the caller "does the XLSX.read + sheet
extraction". **The retirement of the weekly email cost the transport, not the
parsing.**

| Parser | Likely role for the demand planner |
|---|---|
| `parseSalesSummary` | the closest thing in the repo to **POS by SKU by week** — start here |
| `parseScorecard` | weekly KPI roll-up |
| `parseSupplyPlan` | forward order plan; possibly the forecast feed |
| `parseOtifDetail` | per-PO OTIF, feeds fill rate / service level |
| `parseMarkdown`, `parseItemMaster` | markdowns and item master |

⚠️ **They have never been run against a real file in this pipeline** — only
"the dev test". Verify each against an actual export before trusting its column
matching, which is by name (exact then prefix) and tolerant of stray spaces.

### What still needs deciding

- **Which report(s) actually carry POS by SKU by week**, and at what grain.
  `parseSalesSummary` is the candidate; confirm against a real file.
- **The forecast feed's grain.** The engine needs **snapshot week × target
  week** per row, because accuracy scoring uses the latest snapshot strictly
  *before* the target. A file carrying only "the current forecast" cannot
  reproduce `mape` — if the export is a single forward view, either snapshot it
  on upload (stamp the upload week as `snap`) or accept that MAPE stays blank.
- **Re-upload semantics.** Weekly files overlap. `importRecords` should upsert
  on `(week, sku)` rather than insert, or a re-upload doubles a week.

The Walmart *forecast* feed is a separate question with the same status. The
engine wants a **snapshot week and a target week per row**, because accuracy
scoring uses the latest snapshot strictly before the target. A feed that only
carries "the current forecast" cannot reproduce `mape`.

The Walmart *forecast* feed is a separate question — the engine wants a
**snapshot week and a target week per row**, because the accuracy scoring uses
the latest snapshot strictly before the target. A feed that only carries "the
current forecast" cannot reproduce `mape`.

## Conventions this repo will hold you to

Learned the hard way; all of them cost real time at least once.

- **A passing build proves nothing.** Grep the deployed bundle for a distinctive
  string. `curl` the site, pull `/assets/index-*.js`, and check the hash changed.
- **Runtime-parsed flags are not constant-folded.** Grepping for a guarded
  string returns a hit whether the flag is on or off — see the
  `VITE_SAMPLE_TEST_MODE` note in the Sample Central docs. Check the env literal.
- **Anything with a counter needs its floor raised and deployed *before* the
  data is purged.** See `SHIPMENT_NO_FLOOR`.
- **Merging to `main` redeploys Sample Central**, which serves live Cortina
  traffic — one Vercel project, one Vite bundle.
- **Seed an account before its first sign-in.** `COALESCE(seed.role,'ops')` plus
  `ON CONFLICT (id) DO NOTHING` means an unseeded sign-in silently becomes
  internal `ops` and never self-corrects. This has already happened once.
- **Postgres `date` columns are bare `YYYY-MM-DD`.** Use `formatDate` from
  `utils/dates.js`, which parses them as local midnight; `new Date(value)`
  treats them as UTC and lands a day early west of Greenwich.
- **No Docker.** Migrations go through the Management API, which writes no
  history row — so `migration list` is not the truth about what is applied.

## Suggested first moves

1. **Get one real Retail Link export** and run `parseSalesSummary` against it.
   That single step answers the grain question, validates the column matching,
   and tells you whether POS by SKU by week is actually in there.
2. Design the tables from what that file actually contains — not from `SEED`'s
   shape, which is what the engine wants, not what the source provides. The gap
   between the two is the real work.
3. Settle the forecast feed's grain (snapshot × target) before writing
   migrations; stamping the upload week as `snap` is the fallback.
4. Write the parser config, point `UploadPipeline` at it from `/uploads`, and
   make `importRecords` upsert rather than insert.
5. Keep `SEED` in place until a live feed reproduces the same numbers — it is
   the reference implementation, and the 23-check validation is against it.
   Swap the data source last, not first.
