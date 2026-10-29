# Demand Planner — what to trust, and what not to

**For everyone using `/demand-planner`, not just whoever is building it.**
Last reviewed: **October 29, 2026**. §3 is resolved — the DOT on-hand report exists and is now a live upload (Oct 28) — and §4 was part-fixed on Oct 27–28; see the dated notes in each. First written Aug 24 2026, the day the live
feeds went in; §2 and §4 have changed status since, §8 is new, and §9 was
added Oct 22.

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
a frozen snapshot from 2026-08-13. DOT on-hand is now **measured** in weeks that
have a DOT Inventory Snapshot upload (§3), but every week after the latest reading
is modelled forward from it using that frozen production, and every week before the
first reading still runs off a fixed 250-case assumption. The days-on-hand and
production-recommendation figures are what you get when you divide a real number
by a made-up one.

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

**Now real (Oct 28 2026):** the Tracker's **DOT actual OH (feed)** row, in weeks
with an Inventory Snapshot upload. It is no longer marked placeholder.

**When the rest gets fixed:** when `production_runs` has a real feed — the only
supply input still on the seed. It currently holds **5 rows**. Until then, size co-bakery runs the way you did before this
page existed.

---

## 🔴 2. A page elsewhere in the app IS silently losing data — this already happened

**Not the Demand Planner — this affects Product Orders, Payments and Alerts.**

Supabase returns a **maximum of 1,000 rows** per query and gives no error when it
truncates. This was written on Aug 24 2026 as a forecast: `purchase_orders` stood
at 892 rows and was projected to cross 1,000 "around November 2026".

**It crossed. Verified Oct 12 2026:**

```
purchase_orders   1,265 rows   → an unpaged query returns exactly 1,000
po_line_items     1,606 rows   → an unpaged query returns exactly 1,000
```

Confirmed by measurement, not inference — the response is 1,000 rows long with
HTTP 200 and no warning. So, today:

- **Product Orders** silently stops showing some POs
- **Payments** silently misses invoices
- **Alerts** silently misses at-risk orders

No error message. No empty state. Just fewer rows than reality, on pages people
trust. The Alerts case is the worst: a missing alert is indistinguishable from
"nothing is wrong".

✅ **What limits the damage right now:** all three surfaces are currently hidden
from the sidebar (`hidden: true` in `src/components/Sidebar.jsx`). `AlertsPanel`
is mounted only in `ProductOrders.jsx` and `WeeklyReport.jsx`, both hidden. So
nobody is being shown truncated numbers *through the nav* — but the routes still
resolve, and anyone who types `/orders` or `/payments` gets short data with no
indication. **Product Orders is due back around Oct 2026, which makes this a
blocker for that work rather than a background chore.**

**Tracked as an open ticket** at the top of `BUILD_PLAN.md` — impact table, fix,
acceptance criteria and the count-check command. **This is pre-existing** — not
caused by the Demand Planner work — but it was found during it. The fix is the
same pattern already used in `src/hooks/useDemandFeeds.js` (`fetchAll`, which
pages through in 1,000-row chunks). The hooks needing it:
`usePurchaseOrders.js`, `usePayments.js`, `useAlerts.js`.

⚠️ It had already bitten once before crossing. `po_line_items` (1,194 rows) was
silently truncated on the Demand Planner's first day live — the order book was
missing ~16% of its lines and nothing indicated it.

---

## ✅ 3. DOT on-hand — the report exists, and is now a live upload

**Resolved Oct 28 2026.** This section used to say there was no DOT on-hand
report and never would be (Aug 24 2026). That was overturned on Oct 27, when DOT's
**“Inventory Snapshot”** export arrived (three tabs: Inventory Summary per lot with
RG / EX product status and Loaded / Picked; WH Summary per location; Aggregated
Orders in transit). It is now **card 7 at `/uploads`** and writes `dot_on_hand`.

**What the page does with it:**
- One reading per SKU per Walmart week. The file carries no date, so it is dated
  by the workbook's created date and taken as the **closing** stock of that week.
- **Good cases** (RG lots, committed stock included) drive the Tracker's
  *DOT actual OH (feed)* row, and the forward DOT cascade opens from that reading.
  Expired (EX) and committed (Loaded + Picked) cases are stored alongside.
- First reading, as of Oct 27 (W39): good WC 1,531 / PBG 743 / CCF 1,544 /
  BC 1,257 cases; **1,086 expired cases** sitting at DOT (PBG 458) that still need a
  disposition decision; 1,005 cases committed to POs.

**What is still a model, not a reading:**
- **Weeks after the latest reading**: modelled forward using frozen production
  (§1), so DOT closing, DOT days on hand and recommended production stay marked
  placeholder.
- **Weeks before the first reading**, and any SKU missing from a file: these still
  open from the fixed 250-case assumption (`params.dotOpeningAnchor`).
- Upload it weekly. A week without an upload is modelled.

Note this is a *different* report from the **DOT Report (Order History)**
upload (card 5), which covers orders and cuts. And it is not the Assemblers
"Inventory Snapshot Report" — near-identical name, different company.

---

## 🟠 4. The DOT data on screen is months behind — and that is a missed upload, not a limitation

**A DOT report arrives every week** (confirmed Aug 24 2026), so it belongs in the
weekly upload routine alongside the Retail Link files — it is card 5 at
`/uploads`.

⚠️ **As of Oct 13 2026 this has got worse, not better.** The last DOT upload of
any kind was **Aug 24 2026** (`Order History (6).xlsx`), and the export it
carried was pulled **2026-07-16**, ending at Walmart week **202625** — while POS
now runs to **202636**. That is roughly **eleven weeks** of cut recovery nobody
has loaded, against a report that arrives weekly. The Retail Link files are being
kept current (WK36 went in Oct 12); this one is being skipped.

The cut-recovery panel warns when this happens, and the panel's window describes
the weeks it covers, not the current ones.

**Because the report is weekly, a gap of two weeks or more means an upload was
missed — not that none was available.** Treat the warning as an action, not a
disclaimer: go and upload the latest one.

⚠️ **On the next report, check whether it contains any orders with ZERO cuts.**
The current file has **none** — all 221 rows carry a cut — which means it is
either filtered to exception orders only, or that window (the supply crisis)
really was that bad. Weekly delivery settles this quickly: a normal week with no
clean orders in it means the export is filtered. Until that is answered, the file
is used for cut recovery only and **not** as a record of total deliveries.

✳️ **Oct 28 2026:** cut *reasons* now also land in `po_line_items.cut_reason`
(268 lines as of this morning; zero before — the nightly importer ran a bundle
predating the column, fixed via trigger + redeploy, see BUILD_PLAN Oct 27–28).
The Order History upload remains the only source of cut *volume* history; this
fixes the cut-reason trail going forward.

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
- **`All Item Detail` writes rows for weeks that have not happened yet**, carrying
  a Walmart forecast and nothing else — out to the end of the fiscal year. That is
  deliberate (it is the only copy of Walmart's forecast that can be compared
  against the Forecast sheet's), but it means a row existing for a week is not
  evidence that week has data. The banner's "as of" filters on an actual POS
  value; until Oct 12 2026 it did not, and read 16 weeks into the future.

---

## 🟠 8. A new SKU can be missing from this page entirely — and now it says so

**This happened, undetected, for two weeks.** Cortina started shipping a fourth
Walmart item in week **202635 (Sep 26 2026)** — Cortina item **1324**, Walmart
prime item **686669913**, "BG WHT CHOC CURR", mapped here as **BC** (White
Chocolate and Black Currant). Both item-number maps in `useDemandFeeds.js` were
hardcoded to three SKUs, so every line carrying it was dropped with no error:
**22,845 cases / $135,474 of NetSuite orders** *(as measured Oct 12 — these
figures do not reconcile with the database as of Oct 22; see §9)* and
**266,392 units of Walmart forecast**, more volume than any existing SKU over those weeks, absent from every
chart. Fixed Oct 12 2026 (ADR-063).

**What you need to know as a user of this page:**

- **If a red band appears at the top of the S&OP summary** saying *N cases of
  NetSuite orders are missing from this page*, believe it and act on it. It names
  the Cortina item number, the cases, the dollars and the weeks. Every figure on
  the page understates the order book by exactly that much until someone adds the
  item. It is not a rounding caveat.
- **Nothing on the page was ever visibly broken by this.** The orders series
  computed, the banner said "live", every number was internally consistent — it
  was simply short. Under-reporting has no symptom, which is the whole reason the
  band now exists.
- **BC's name is provisional.** It was read off Walmart's own item description and
  vendor stock number (`BGBLKCRRT5947`), not from a Dirty Cookie product list.
  Correct it in `SKU_NAMES` in `src/pages/DemandPlanner.jsx` if it is wrong.
- **BC shows no POS, and that is correct.** It is not traited at shelf yet:
  Walmart forecasts it but reports no sales and no traited stores, so its
  `All Item Detail` row is dropped by design. It reaches the page through the
  forecast feed alone until it starts selling. **Do not read its blank POS as a
  missed upload.** Its fill rate reads near zero for the same reason — deliveries
  against those 22,845 cases are still in flight.

---

## 🔴 9. Recent order lines: the case count needs to be confirmed

**Found Oct 22 2026. Unresolved — do not use the order dollars or cases below
until someone confirms them against the source file.**

Some NetSuite order lines priced at roughly **10× the normal price per case**
arrived in the latest Walmart order uploads:

| Item | Normal $/case | Flagged $/case | Lines | Cases recorded | Ship dates |
|---|---|---|---|---|---|
| 1324 (BC) | $33.92 | **$339.24** (10×) | 20 | 723 | Oct 19–23 |
| 1251, 1252, 1287 | $36.96 | **$388.08** (10.5×) | 47 | 96 | Oct 26–30 |

**The open question is which number is wrong.** Either:

- **the case count is right** and `line_total` is inflated (about **$254k**
  overstated, ~$221k of it on BC), or
- **the dollars are right** and `quantity_cases` is too low, so the order book
  is short on cases instead.

**Walmart's own figures say the flagged lines are the wrong ones** (added Oct 22
2026, from the Item 360 export). Unit cost × pack gives exactly the normal
prices: $3.08 × 12 = **$36.96** for the three doughs, and $3.39 × 10 = **$33.90**
for BC. BC's flagged price is exactly 10×, and BC has 10 pouches a case, which
suggests pouches were recorded as cases (the case count is short). That is a
lead, not proof: the doughs' 10.5× fits neither reading cleanly.

The database alone cannot settle it. **Confirm the case count** by
opening `Walmart_Orders_2026-10-20.xlsx` and checking one line. A good one to
start with is PO **6185610199**, item 1324, recorded as **75 cases / $25,443**.

**Until then:**

- **BC's order value is unreliable.** It reads **$421k** across 5,898 cases;
  without the flagged lines it is about $176k across 5,175.
- **Order dollars and cases for ship weeks Oct 19 – Oct 30** are suspect for all
  four SKUs. Earlier weeks price normally.
- **The BC figures in §8 and ADR-063** (22,845 cases / $135k) do not match the
  database either, flagged lines or not. Re-measure them after this is resolved.

**Possibly related:** three Walmart order uploads are stuck at `processing` in
`upload_log` — `Walmart_Orders_2026-10-19.xlsx` (Oct 21; the same file completed
on a re-run Oct 22), `Walmart_Orders_2026-10-20.xlsx` (Oct 22) and
`Walmart_Orders_2026-06-11.xlsx` (June). Not confirmed to be the cause.

Find the flagged lines:

```sql
select p.walmart_po_number, p.ship_date_original, l.cortina_item_number,
       l.quantity_cases, l.line_total,
       round(l.line_total / nullif(l.quantity_cases, 0), 2) as per_case
  from po_line_items l join purchase_orders p on p.id = l.po_id
 where p.retailer = 'Walmart'
   and l.line_total / nullif(l.quantity_cases, 0) > 60
 order by p.ship_date_original;
```

---

## For whoever picks this up next

**Verifying a deploy by grepping the bundle for strings does not work.** On Aug
24 2026 this page shipped blank — a runtime error on every render — through three
deploys that were each reported as "verified" because the new strings were
present in the bundle. They were: in code that could never execute.

`node scripts/smoke-render.mjs` now renders the page for real and fails if it
throws. Run it before shipping. It covers this page only; the rest of the app has
no equivalent.

Background and reasoning: **ADR-053 → ADR-063** in `DECISIONS.md`, the "As built"
section of `DEMAND_PLANNER_FORMULAS.md`, and `RUNBOOK.md` §2.7 for the weekly
upload routine.
