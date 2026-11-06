# Cookie Central — Build Plan

## Timeline
*(current as of October 29, 2026)*
- **Start:** Wednesday May 21, 2026
- **Phase 1 demo:** delivered June 2026 (Marc + David) ✅
- **Phase 1 ship:** largely live. AI email reader (Day 10) ✅ and lot-traceability chain UI (Day 11) ✅ done. Remaining: Cortina NetSuite real-file reconciliation (waiting on Harshita's sample); DOT/QBO real-file reconciliation non-blocking.
- **Extension track — Spec Sheet → Sample Central → ShipStation** (separate from the Operations/Financials phases below): built July 2026. Phase 1 Cookulator product spine (ADR-025) ✅, Phase 2 Sample Central (ADR-026) ✅, Phase 3 ShipStation Custom Store (ADR-028/029) ✅ **verified end-to-end July 27, 2026**; refined July 28 (ADR-030→033: prototype-aligned shell, rush flag replaces the shipping-speed selector, third-party billing, read-only status, shipnotify cost/label capture). Schema, Edge Function and frontend all deployed.

  **August 2026 (ADR-034→042), in four strands:** the field contract settled (ADR-036→038 — salesperson/account/temp override in CustomField1/2/3, RUSH in InternalNotes, billing in Notes from Buyer, custom and collateral lines carrying no SKU); Deliver By moved to ShipStation's native field via an outbound V2 sweep, now on a 15-minute cron (ADR-034); status sync in from ShipStation, which surfaced that **V2 reports the label lifecycle, not order status** — so `cancelled` works, `on_hold` cannot without a V1 key, and `delivered` is one entitlement away (ADR-039→041); and **sales reps became a lookup list rather than user accounts (ADR-042)**, with the 25-person Cortina roster now live in the Salesperson dropdown and a selected rep's email flowing to `<BillTo><Email>`, which is what ShipStation notifies.

  **August 12–13 (ADR-043→045):** `delivered` finally has a source — not the `/v2/tracking` path everyone had written off as a billing wall, but the per-label track endpoint that was available all along (ADR-043). Orders split into **two fulfilment routes**, with Cortina-shipped samples withheld from the export by an allowlist and confirmed by hand via a copy/print order sheet (ADR-044). The site took ownership of data ShipStation has no field for — a per-shipment **issue log** and a live **cold-chain season** switch (ADR-045) — plus a monthly report spanning both routes. A pre-onboarding UX/PM review shipped in three batches: a confirm step on the unrecallable submit, keyboard-accessible dialogs, address retirement, and a four-step type scale.

  **Launched August 19, 2026 (ADR-046).** Test mode is off in Production, the test orders were cancelled and purged, the counter floor is 1206, and the seasonal cold rule exists in ShipStation. The first real order numbers `SMP-1206`. *(Corrected Oct 22 2026: 1206, 1207, 1210, 1211 and 1212 turned out to be post-launch test orders, now hidden. The first real orders are SMP-1208 and SMP-1209. See Oct 21–22 below.)* There is still no sandbox — **Preview** builds share the production database and store, so a branch-build order is a real order (kept `SMP-TEST-`-prefixed deliberately). **Current state + next steps: `sample-site/docs/SAMPLE_CENTRAL_STATUS.md`**, which is kept more current than this file.

  **August 21–23 2026 — three more things shipped.** The **EOS Tracker** went live at `/eos` (ADR-047; `docs/EOS.md`), and its scorecard was reshaped in a pre-launch review: 13 measurables with goals, ranges rather than ceilings where days-on-hand needed a floor, and To-Dos that hang off a measurable and carry forward until ticked. The **Walmart Demand Planner** went live at `/demand-planner`, initially on a static 2026-08-13 snapshot; **on August 24 it went LIVE on real Walmart data** — POS, Walmart forecast, OTIF, DOT cut recovery and NetSuite orders read the `retail_link_*` / `dot_order_history` tables, fed by six weekly uploads, with a **Service health** panel leading on in-store fill rate and OTIF and a **Sources** tab giving provenance for every figure (ADR-053→062; all four migrations applied, all six exports uploaded). Only `production` remains on `SEED`, and there is no DOT on-hand feed at all — so **days-on-hand and recommended production are not yet trustworthy and are flagged as such** in `DEMAND_PLANNER_KNOWN_ISSUES.md`. See `docs/DEMAND_PLANNER_FORMULAS.md` → "As built". And **five pages were hidden pending rework** (Weekly Report, Product Orders, Payments, EOM Snapshot, Lot Trace) — routes intact, nav entries flagged `hidden: true`, internal landing moved to `/inventory`.

  **October 12–13 2026 — the first changes since Aug 24.** Seven quiet weeks in the repo while the app stayed in use: the daily Walmart order ingest kept running, Retail Link files were uploaded Oct 9 and Oct 12, and `purchase_orders` grew past the 1,000-row cap this plan had forecast for November (see the open ticket above — it is no longer a forecast). Shipped Oct 12: **a fourth Walmart SKU** (`BC` — Cortina item 1324 / Walmart prime item 686669913) which had been launching since week 202635 and was invisible on `/demand-planner`, dropped by a hardcoded three-SKU map along with 22,845 cases of orders and 266k units of Walmart forecast; the maps now **report any item number they cannot translate** rather than skipping it; and the banner's "as of" week stopped reading sixteen weeks into the future. **`BC`'s display name is provisional** — read off Walmart's own fields, not a Dirty Cookie product list. ADR-063. *(Resolved Oct 22 2026: official name confirmed. See below.)* The docs were reviewed against the live database the same day; several standing claims were wrong and are corrected (`PEOPLE.md` account state, `DATA_MODEL.md` on forward-week rows, ADR-024's description of a table that has since been dropped).

  **October 21–22 2026 — Sample Central reports; Walmart product spec.** PRs #59–#64; migrations `20261021120000`, `20261022150000`. Live and checked.

  *Done*
  - [x] Sample Central Reports: date-range filter, status sections, filters, CSV export, double-click detail with issue log, on-time / days-late delivery column — 2026-10-21/22
  - [x] Five test orders hidden; ship dates no longer show a day early — 2026-10-21
  - [x] Black Currant in the Spec Sheet (`WCBC-1OZ-BAK-C`: black currant stuffed with white chocolate, 1 oz × 7 per pouch, 10/case, 96/pallet, 9 months) — 2026-10-22
  - [x] Walmart products matched to Walmart's Item 360: official bettergoods names, case GTINs, 12/case, $4.88 — 2026-10-22
  - [x] Demand Planner: official names; BC converted at 10 units/case — 2026-10-22

  *Decisions*
  - Test orders are hidden (`excluded`), never deleted: deleting frees their shipment numbers for reuse.
  - Reports get a CSV export, reversing August's "no CSV".
  - Walmart SKUs are the 4-digit Cortina item numbers (1251/1252/1287/1324). Cortina's line number (BC 3888) is separate.
  - Only Walmart's PB&J (1251) is grape; all other PB&J is strawberry jelly.
  - BC is 1 oz × 7 per Caroline, overriding Walmart's "3 oz, 4 Count" listing.
  - The three Walmart doughs stay at 12/case until the new count is set.

  *To do*
  - [ ] Confirm the case count on the ~10× $/case Walmart order lines before changing data (`DEMAND_PLANNER_KNOWN_ISSUES.md` §9; start with PO 6185610199). *Oct 26: BC resolved by Cortina; 12 dough lines still 10× on price. See Oct 23–26.*
  - [x] Walmart order uploads stuck at `processing` — diagnosed 2026-10-23, fix still open (see Oct 23–26)
  - [ ] Re-measure ADR-063's BC figures (ask before amending)
  - [ ] New case count for the three doughs; BC's MOQ (waiting on Caroline)
  - [ ] Decide: issue logging before delivery? Rename "Freight" tile?
  - [x] Refresh `sample-site/CLAUDE.md` "Current state" (first real delivery: SMP-1208, UPS, Oct 21) — 2026-10-22
  - [x] Minor: the Supply Plan upload summary converts eaches ÷ 12 for every item. BC is 10 per case (`src/parsers/retailLinkSupplyPlan.js:141`, display only). — 2026-11-05: fixed on `fix/supply-plan-bc-cases`, merged to `main` (`2295154`) and live the same day (bundle `index-DE28wJ-8.js`). The summary also now warns, rather than silently using 12, for any item number with no case pack on file. The summary now divides each row by its item's pack (`EACHES_PER_CASE`: 686669913 → 10, everything else 12). Stored rows were always eaches, so no data changes and nothing to re-upload. Checked on a two-row test workbook (1,200 WC + 1,000 BC eaches → 200 cs, was 183) and a production build; no real Supply Plan file was on hand. The pack now lives in three places (this map, `SKU_PACK`, `ITEM_TO_SKU`); the parser's comment names the other two and `SKU_PACK`'s comment points back
  - [ ] **Doughs 12 → 8 per case** (raised 2026-11-05): all three frozen doughs (WC, PBG, CCF) move from a 12- to an 8-count case (the 8-CT SRP). The sell unit and the Walmart sell-unit item numbers stay the same; the case gets a new GTIN (not yet issued) and, per Caroline, a new SKU number, presumably the Cortina/NetSuite item number, to confirm. Cutover date unknown. Because the item number doesn't change, every place that converts eaches ↔ cases by item or short code (`SKU_PACK`, `EACHES_PER_CASE`, `DEFAULT_PARAMS.unitsPerCase`, MOQ 756 and 189 cases/pallet) will need a pack by date. Caroline asked for the Demand Planner to show **sell units** so the changeover can be forecast without the case count shifting under it. *Nov 5: the Cases / Sell units switch is on hold at Caroline's request; a static status banner (`PackChangeNotice`, Summary tab, under the placeholder notice) says where things stand. Update or remove it when the cutover date, GTIN or switch lands*
  - [ ] Minor (surfaced 2026-11-05): `UploadPipeline.jsx` shows every parser message as "N row issue(s) will be skipped — e.g. row 0: …", but some are warnings that skip nothing (the Supply Plan's duplicate-collapse and no-case-pack messages). Reword or split warnings from skipped rows

  **October 23–26 2026: Walmart ingest investigated.** No code or data changes.

  *Done*
  - [x] Stuck `processing` uploads diagnosed — 2026-10-23. The Oct 20 7 AM run missed that night's email, so two exports were waiting. Since then each run finishes the first waiting export, then is cut off (a time-out, no error) on the second. The next run retries it, and the backlog never clears. Happened again Oct 25. The backlog was cleared by manual runs on the evening of Oct 26 (not from this session); every export through `2026-10-26` is imported.
  - [x] ~10× lines re-measured on the 10-26 export — 2026-10-26. Cortina is correcting them in NetSuite. **BC: resolved**: no 10× lines left; 26 lines (PO 6185610199 among them) are now 0 cases / $0. **Doughs: half resolved**: the `0120…` POs now read 21 cases a line, so quantity *was* the error. But 12 lines on SO11465/70/72/76/81/89 (items 1251/1252) still carry a 10× Item Rate ($41.07 vs $4.107), so $7,761.60 a line instead of $776.16, overstated by ~$83.8k.

  *Decisions*
  - None. A manual re-run and an importer fix were proposed and never answered.

  *To do*
  - [ ] Ask Cortina to correct the Item Rate on those 12 dough lines (no data changes on our side)
  - [ ] Importer fix: when several `walmart_orders` emails are waiting, import only the newest (each export is full history) and mark the older ones replaced. Today it can also import an older file *after* a newer one (Oct 26: 10-26 → 10-25 → 10-26).
  - [ ] Why the Oct 20 run missed its email, and why no `Walmart_Orders_2026-10-23` email exists
  - [ ] Add the Item 360 finding and today's re-measure to `DEMAND_PLANNER_KNOWN_ISSUES.md` §9; re-measure ADR-063 now that BC is clean (ask before amending)
  - Note: Item Rate in the export is **not a case price**. It looks per-pound (inferred, unconfirmed): $4.1067 × 9 lb = $36.96 for the doughs, $7.7045 × 4.4 lb = $33.90 for BC. `walmart_unit_price` therefore isn't a case price; use `line_total / quantity_cases`.

  **October 27 2026 — Sample Central: an order that never reached ShipStation.** PR #65 and `feat/import-alert` (merged locally); migration `20261027120000`. *(Was ADR-064; folded in here Oct 29 2026.)*

  *Done*
  - [x] SMP-1213 (Oct 23) found missing from ShipStation: ship-to state saved as `New Jersey`, so the export skipped it. Address set to `NJ`, order re-queued; imported as `se-1047364146` with Deliver by Oct 27 — 2026-10-27
  - [x] Address form accepts a full state name or code (stored as the code) and refuses a bad state or zip at save (PR #65) — 2026-10-27
  - [x] Stress test for silent failures: fuzzed the export XML, checked live data, read the pipeline. Live data clean — 2026-10-27
  - [x] Control characters stripped from the export. One pasted U+000B made the whole document invalid and dropped the batch — 2026-10-27
  - [x] Import alert: sweep emails systems@ once when an open order has no ShipStation id after 60 min; site shows a "Not in ShipStation" flag. gmail-poll skips `[Sample Central]` mail — 2026-10-27
  - [x] Blank custom line no longer passes the item check; custom qty clamped 1–999; `qty >= 1` CHECK — 2026-10-27
  - [x] Migration applied with `db push` (ledger in sync); four functions deployed; 17:00 sweep verified clean (`import_alerted: []`, `failed: []`) — 2026-10-27

  *Decisions*
  - **The Deliver By sweep emails systems@dirtycookie.com once when an open, Dirty-Cookie-fulfilled order still has no `shipstation_order_id` 60 min after submission; the site shows a "Not in ShipStation" flag on the same rule.** The state fix (PR #65) closes SMP-1213's cause. The alert catches causes nobody has found yet: for four days the only trace was a function log and `not_yet_imported: 1` in a sweep response nobody reads.
  - Alert sends from systems@ via the existing Gmail grant (adds `gmail.send`), not a transactional provider: no vendor, no SPF/DKIM change. The August Resend scoping (amendment to ADR-044) stalled on a vendor account and an SPF merge on `dirtycookie.com`; Workspace needs neither.
  - Threshold 60 min, not 30: has to cover one ShipStation pull plus one 15-minute sweep without false alarms.
  - Only orders with no `shipstation_order_id` ever are alerted; an imported order whose record later vanished (ADR-039) is a different problem.
  - Once per order, via `not_imported_alerted_at`. Nothing latches on a failed send, so it retries next sweep. The latch write re-queues the order for export, which is intended (a free retry).

  *To do*
  - [ ] **Reset the systems@ password** (lost) in Google Workspace admin, then **reconnect Gmail** straight away. A password change revokes the Gmail grant, so the report import stops until reconnect.
  - [ ] After reconnect: check gmail-poll still runs, send one test alert
  - [x] Merged `feat/import-alert` to `main` (production already ran it) — 2026-10-27
  - [ ] Save order + items in one transaction (an item insert failure leaves an exported header; a pull between the two inserts imports it with no items). Mint `shipment_no` server-side in the same change.
  - [ ] Check in ShipStation: do split orders come back as `SMP-####-1` (shipnotify would not match)? Does a re-export overwrite co-man edits on an awaiting order?
  - [ ] Minor: address form allows blank street/city; account/notes truncate silently at 100/1,000 chars; `net._http_response` keeps only ~6 h

  **October 27–28 2026 — ingest data-quality fixes, and the DOT on-hand report exists after all.** Work ran in the claude.ai demand-planner session, not local Claude Code. Two root causes found while wiring that session's prototype to the live tables; both fixed in production.

  *Done*
  - [x] `po_line_items.cut_reason` / `.actual_delivery_date` were NULL on all 1,858 rows — fixed 2026-10-27/28. The nightly `gmail-extract` bundle predated migration 20260824150000, so delivery dates landed in `metadata` only and Cut Reason nowhere. Fixes: trigger + backfill migration `20261027160000_po_line_promoted_cols_guard.sql`, and `gmail-extract` redeployed (Caroline, 10-27 evening). **Deviation:** the migration was applied to prod via the dashboard SQL editor on 10-27, ahead of any `supabase db push` — it is idempotent, so a later `db push` is safe. Verified 2026-10-28 after the 7 AM run (`Walmart_Orders_2026-10-27.xlsx`, complete): **268 lines now carry cut_reason** (was 0), 1,557 a column-level delivery date.
  - [x] Weekly Retail Link restatements were ERASING `store_on_hand` history — fixed 2026-10-27. The workbook restates every week but carries on-hand only for its own week; the single bulk upsert wrote the union of payload columns, nulling all earlier weeks' readings (after the WK38 upload, only wk 202638 had one left). Fixed in `src/parsers/retailLink.js`: rows without a reading now upsert without those columns. Branch `fix/ingest-promoted-cols-and-oh`, PR merged 10-27.
  - [x] **The DOT on-hand report exists** — received 2026-10-27, overturning `DEMAND_PLANNER_KNOWN_ISSUES.md` §3. DOT's **Inventory Snapshot** (three tabs: Inventory Summary per lot with RG/EX status + Loaded/Picked; WH Summary per location — Mt. Sterling IL and Dyersburg; Aggregated Orders in-transit) carries real on-hand. First reading: good stock WC 1,531 / PBG 743 / CCF 1,544 / BC 1,257 cases; **1,086 expired cases sitting at DOT** (PBG 458) needing disposition; 1,005 cases committed to POs.
  - [x] Standalone prototype moved onto disk + Vercel — 2026-10-28. `~/Projects/dirty-cookie/demand-planner` (Vite app, own Vercel project): the claude.ai iteration surface, deliberately separate from `/demand-planner` in this app.

  *To do*
  - [x] Inventory Snapshot parser + upload card → a real DOT on-hand feed — built 2026-10-28/29 on `feat/dot-on-hand` (see below). §1 still needs the production feed
  - [ ] Re-upload older WK## Retail Link files — now non-destructive — to restore the erased store on-hand history
  - [ ] Ask Caroline Collins (Bentonville Merchants) to add item 686669913 (BC) to the WK## Retail Link pull so it gets POS
  - [ ] Harshita: disposition decision on the 1,086 expired cases at DOT
  - [x] Decided: fold the prototype's UX into `/demand-planner` as part B, one planned piece at a time (Caroline, Oct 28). B1 funnel shipped Oct 29 — see below — 2026-10-29

  **October 28–29 2026 — DOT on-hand is a live upload.** Branch `feat/dot-on-hand` (cut from `docs/session-2026-10-28-demand-ingest`); migration `20261028150000`.

  *Done*
  - [x] Parser `src/parsers/dotInventorySnapshot.js`: Inventory Summary per lot → per SKU by case GTIN; good (RG, committed included) / committed (Loaded + Picked) / expired (EX) / expiring ≤60 days; WH Summary and Aggregated Orders as cross-checks; unknown GTINs, missing SKUs and broken row identities reported, not swallowed. Refuses the Assemblers "Inventory Snapshot Report" with a pointer to its card — 2026-10-29
  - [x] Table `dot_on_hand`, PK `(sku, wm_week)`, RLS as `dot_order_history`; `upload_log` accepts `dot_inventory_snapshot`. The importer never overwrites a newer reading with an older file — 2026-10-29
  - [x] Upload card 7 at `/uploads` — 2026-10-29
  - [x] `useDemandFeeds` reads it (via `fetchAll`) as the engine's `dot` series; the Tracker's *DOT actual OH (feed)* row is real and unflagged; banner, Sources tab and placeholder notice say what is measured and what is modelled. No engine formula changed — 2026-10-29
  - [x] `scripts/test-dot-inventory-snapshot.mjs`: 13 tests pass, and the real Oct 27 file reproduces good 1,531 / 743 / 1,544 / 1,257, expired 1,086, committed 1,005 → W39. `smoke-render.mjs` 9/9 (new "live + DOT reading" shape); `vite build` clean — 2026-10-29
  - [x] Docs: KNOWN_ISSUES §1 and §3, DATA_MODEL, FORMULAS (§4 and As built), RUNBOOK (card note and weekly check), README, ADR-059 marked superseded — 2026-10-29

  *Decisions* (supersede ADR-059's "there is no DOT on-hand report")
  - **New table `dot_on_hand`, not `dot_inventory`.** `dot_inventory` was built in May for a DOT file nobody had seen (incoming / in-transit / allocated buckets, insert-only, no key), and `useAlerts`, `useEomSnapshot` and the Inventory page read it, so filling it would have changed those pages without anyone deciding to. `dot.js` / `dot_inventory` left for a separate retirement decision.
  - **Good / committed / expired, keyed by case GTIN.** Good = Total Inventory on RG lots, *including* committed; committed = Loaded + Picked on RG lots; expired = EX lots, kept out of good. The engine reads good cases. GTIN → SKU map lives in the parser (same values as `master_cases.gtin14`); an unknown GTIN is reported on upload, never dropped (the ADR-063 lesson).
  - **As-of = the workbook's CreatedDate, read in US Central time; a reading is the CLOSING stock of the Walmart week containing it** (Caroline, Oct 28). The sheets carry no date. Fallback: the file's modified time, with a warning; with neither, the file is refused rather than given a guessed week. A Tuesday reading taken as the week's close is ~3 days off; preferred over the prior week's close (~4 days).
  - **One row per (sku, wm_week), never backwards.** A same-week re-upload replaces the row unless the stored reading is newer; those rows are skipped, and a file older on every row is refused. Closes, from the start, the out-of-order bug the walmart_orders importer still has (Oct 23–26).
  - **What stays a model:** weeks after the latest reading (modelled on SEED production, so DOT closing / DOT DOH / recommended production keep the placeholder flag, KNOWN_ISSUES §1), and weeks before the first reading or a SKU missing from a file (still open from the 250-case `dotOpeningAnchor`). Only *DOT actual OH (feed)* lost its placeholder flag; no engine formula changed.
  - **Decisions are recorded here, not as ADRs** (Caroline, Oct 29). `DECISIONS.md` stays as the history to ADR-063; ADR-064 folded into the Oct 27 entry (Oct 29). No new ADRs.

  *To do*
  - [x] `main` merged into the branch; ADR-064 folded into the Oct 27 entry and removed from `DECISIONS.md` — 2026-10-29
  - [x] Reviewed by Caroline and merged to `main` (fast-forward, three deploys: A, then two rounds of review fixes) — 2026-10-29
  - [x] Migration `20261028150000` applied with `supabase db push` (run from the feature worktree, so the uncommitted Supplies migration was not pushed); ledger in sync, `dot_on_hand` answers via the API — 2026-10-29. **Deviation:** the push also re-ran `20261027160000`, which had been pasted into the SQL editor on Oct 27 and so was missing from the ledger. It is idempotent; cut_reason lines still 268 afterwards
  - [x] Deployed to production by fast-forwarding `main` to this branch (Caroline, Oct 29: local login unavailable, so the upload is tested live) — 2026-10-29
  - [x] `Inventory Snapshot.xlsx` uploaded on card 7 (live site): 4 rows in W39 dated Oct 27, good 1,531 / 743 / 1,544 / 1,257, expired 1,086, committed 1,005, upload_log `complete` with no warnings — 2026-10-29
  - [x] Header fixed — 2026-10-29. It was hardcoded to the Aug 13 snapshot since the page was built ("Today · WM Week 28", "data thru wk 202627", "NetSuite batch 8/13"). It now shows today's week, the newest POS week and the newest DOT reading, as week-ending Sunday with W##. Also fixed: a missing space in the banner (from A) and a literal `\u2014` in the OTIF label (older). `smoke-render.mjs` now resolves the page's other relative imports, which the new `walmartWeekOf` import exposed. Same pass, from Caroline's review screenshot: the chart legend's hardcoded "today W28" now reads the last POS week; the legend is one entry per line; the x-axis no longer prints "undefined" for week 53 (live POS carries 202653, the fiscal-month table stopped at 52); y-axis ###,###; card subtitles in week-ending-Sunday format. The funnel / action panel / Sunday dates everywhere / per-SKU packs stay B, gated on a per-piece plan
  - New from the first file: 851 good cases expire by Dec 26 (WC 229, PBG 182, CCF 440, over a quarter of CCF's good stock), on top of the 1,086 already expired. Input for B's action panel
  - [ ] Weekly routine: add the DOT Inventory Snapshot to the uploads (RUNBOOK check added)
  - [ ] Decide: retire `dot_inventory` + `src/parsers/dot.js`
  - [ ] B: fold the prototype UX in. **B1 funnel done Oct 29** (below). **B2 actions panel built and live Nov 2** (below). Still to plan, one piece at a time: B3 week-ending-Sunday dates across the page (header, legend and card subtitles already done), B4 per-SKU case packs

  **October 29 2026 — B1: the inventory funnel on `/demand-planner`.** Branch `feat/dp-funnel`. No migration, no engine change.

  *Done*
  - [x] "Where every case sits" panel on each SKU card, folded in from the prototype: Expired / Sellable at DOT, In transit to Walmart, At Walmart DCs, On store shelves, Sold this week (toggle: All time). Bars coloured by stage group; one entry per line; ###,###; dated (DOT as of … W##, Walmart thru wk ending Sun … W##). Card layout now matches the prototype: stats row on top, chart with the funnel beside it — 2026-10-29
  - [x] `useDemandFeeds` reads `whse_on_hand` (through `fetchAll`) and passes it along on each POS row as `whOh`; the engine ignores it — 2026-10-29
  - [x] Rendered on live data and read back: WC 246 / 1,195 / 336 / 42 / 2,037 / 417; PBG 458 / 554 / 189 / 20 / 1,538 / 103; CCF 382 / 1,292 / 252 / 36 / 2,338 / 333; BC 0 / 1,029 / 228 / no feed ×3. `smoke-render.mjs` 9/9, `vite build` clean — 2026-10-29

  *Decisions* (Caroline, Oct 29)
  - **At Walmart DCs = measured** Retail Link *Curr Whse On Hand* ÷ pack, labelled with that formula and "Walmart's own warehouses, not DOT". The prototype's implied figure (all deliveries − all POS − shelves) was rejected: on live data it read WC 5,582 / PBG 7,095 / CCF 4,197 cs against Walmart's own 42 / 20 / 36, a year of shrink, markdowns and data gaps, not stock. Units are assumed (same sheet and basis as store on-hand); the label shows the ÷ pack so it can be checked.
  - **Keep the toggle, default "This wk".** "All time" sold (WC 13,169) is ~10× every stock row and would shrink the bars to slivers. The toggle moves only the Sold row.
  - **Prototype layout.** Stats row on top; chart and funnel side by side; stacked on phones.
  - **A row with no source says "no feed", never 0** (BC isn't in the Retail Link WK## pull yet).
  - **Header is stock in the chain** (sellable + transit + DCs + shelves) with expired beside it. No "cases accounted for" total: stock and a sales flow don't add up.
  - **Colour by stage group, not by row** (rows are named in text). DOT `#3E8E5A`, Walmart network `#E8A33D`, shopper `#6B3F8C`, all passing the dataviz palette validator (amber's sub-3:1 contrast relieved by the label + value on every row). The prototype's six colours failed it (the two greens are indistinguishable). Expired is a state: DOT green with a 45° hatch, ⚠ and the word.

  - [x] Chart reworked (Caroline's review, Oct 29): the DC → DOT and DOT → depot supply lines are removed from it and from the legend; it shows only POS and the Walmart forecast. A traited-stores bar panel sits directly under it on the same week axis, each bar labelled vertically "stores · units/store/week" (WC W38: 2,609 · 1.92) — 2026-10-29

  - [x] Second review pass (Caroline's screenshot, Oct 29): store labels are horizontal, two lines (velocity over the store count abbreviated "2.6K"; full figure in the hover, every other bar when bars are under 17px wide); the chart column stretches to the funnel's height (line chart 2/3, store panel 1/3); the funnel is redrawn as a ranked bar list (label + value, left-aligned bar on one scale, sources in the hover, only the DC row keeps its formula, expired as a ⚠ note under DOT instead of a hatched bar). The prototype's centred trapezoids read as confusing — 2026-10-29

  *Decisions* (chart, Caroline, Oct 29)
  - **Bars = Retail Link Traited Stores**, labelled as such. Retail Link has no stores-selling count.
  - **Velocity = POS units ÷ traited stores**, printed with the store count on each bar, not drawn as its own series. It's identical to Walmart's "Units per Store per Week (w/zeros)" (checked WC W32–W38). It is *not* the engine's `velocity`, which uses OOS-adjusted true demand.
  - **Stacked panel on a shared week axis, not a second y-axis** (~2,600 stores vs ~400 cases). Hover is linked across the two.

  *To do*
  - [x] Pushed to `main` after each of Caroline's two screenshot reviews (`6c0e65f`, `7311dd9`, plus the chart rework in `ee1505c`/`c09ae6c`). Live bundle checked each time for a string only the new version contains — 2026-10-29
  - [ ] Caroline: final look at the redrawn funnel, the full-height chart and the two-line store labels on the live page (not yet seen drawn; offscreen renders can't draw Recharts)
  - [ ] Confirm with Caroline Collins that *Curr Whse On Hand* is units, not cases
  - [ ] Ask Caroline Collins whether Retail Link can add a stores-with-sales count to the WK## pull (the bars would switch to it)
  - [x] B2 plan: "This week's actions" panel — planned 2026-11-02, see below

  *Session notes (Oct 28–29), for the next session*
  - **Local review doesn't work.** On `localhost` the magic link returns to production (Supabase only redirects to allow-listed URLs), and the Password tab didn't work for Caroline either (cause not checked; most likely no password is set on the account). Fix one: add `http://localhost:5180/**` to Supabase → Auth → URL Configuration → Redirect URLs, or set a password. The dev-only `VITE_AUTH_BYPASS=true` exists but reads only (writes are refused by RLS), and needs Caroline's OK each time. This session reviewed on the live site instead.
  - **Claude in Chrome** is installed in the systems@dirtycookie.com Chrome profile, but it only connects at session start: launch with `claude --chrome`.
  - **`main` moved under this branch four times** (Supplies V1 #67, V1.1 #68, V1.2 #69 and EOS #70, from other sessions). All merged in cleanly; check `git log HEAD..origin/main` before every push.
  - **Migrations:** `db push` is now the way (ledger in sync through `20261028150000`, Supplies `20261028120000` applied too); `.claude/instructions.md` still says "SQL editor".
  - [ ] Update `.claude/instructions.md`: migrations go in with `supabase db push`, not the SQL editor

  **November 2 2026 — B2: "This week's actions" on `/demand-planner`. Planned, built, live.** Branch `feat/dp-actions` (same as `main`). Commits `dd08eb3`, `48a7c1b`, merge `d7c63dc`. No migration, no engine change.

  *Plan*
  - Panel at the top of the Summary tab, above Service health (below the unmapped-items and placeholder notices). One line per action: tone dot, text with its number, owner chip, and the source and date of the figure (e.g. "DOT · Tue Oct 27 · W39"). Read-only: nothing to tick off.
  - Flags, all from measured figures:
    1. **Expired at DOT** (red, Harshita · Cortina/DOT): latest `dot_on_hand` reading, expired cases across SKUs, with the per-SKU split. Today: 1,086 (PBG 458).
    2. **Expiring ≤60 days** (amber per SKU; red above 30% of that SKU's good stock; Harshita · Cortina/DOT): `expiring60`, with `earliestExpiry`. Today: WC 229, PBG 182, CCF 440 — all amber (CCF 28%).
    3. **Forecast gap** (amber >15%, red >40%; Caroline Collins / David · Walmart): `n4wGap`, Walmart store forecast vs our internal forecast, next 4 weeks. Thresholds as the prototype.
    4. **Service** (red only; Caroline Collins / David · Walmart): latest in-store fill rate below 65% or OTIF below 90%, the Service health panel's red lines.
    5. **Stale data** (amber; Dirty Cookie ops): newest DOT reading or newest Retail Link POS week more than 2 Walmart weeks behind today's week. Upload card named.
  - Nothing fires → one green line, "No flags this week", still dated.
  - Copy the prototype's `ActionPanel` shape (`~/Projects/dirty-cookie/demand-planner/src/DemandPlanner.jsx:368`), rewritten on `funnelInputs` / `metrics` / `feeds`; a pure `buildActions()` so `smoke-render.mjs` can assert on it.
  - Check: `smoke-render.mjs` (new shapes: flags firing, none firing, no DOT reading), `vite build`, read back against live data, then Caroline's screenshot review before merge.

  *Decisions* (Caroline, Nov 2)
  - **No DOT days-of-cover flag.** The prototype's "DOT cover under 7 days" reads `dotDoh`, still a placeholder (KNOWN_ISSUES §1). It comes back when production has a real feed.
  - **Expiring fires on any case ≤60 days**, not the prototype's >30% of good (which would be silent today with 851 cases expiring by Dec 26). Over 30% turns it red.
  - **Owner chips name people**, as in the prototype.
  - **Placement: top of Summary**, above Service health. *Revised in review: above the placeholder notice too.*

  *Done*
  - [x] Built on `feat/dp-actions`: `buildActions()` + `ActionPanel` in `src/pages/DemandPlanner.jsx`, mounted above Service health. In-stock and OTIF rows factored out of `ServiceHealth` (`instockRows`, `otifRowsOf`) so the actions panel and Service health read one number — 2026-11-02
  - [x] `smoke-render.mjs` now also checks the Summary tab's action text per shape (a flag that stops firing still renders); 9/9. `vite build` clean — 2026-11-02
  - [x] Read back on live data (real `useDemandFeeds`, rendered offscreen): 8 actions. Red: 1,086 expired (PBG 458 · CCF 382 · WC 246); PBG forecast +66.7%; CCF +46.2%; OTIF W37 87.7% (185 cs unfilled). Amber: expiring WC 229 (15%) / PBG 182 (24%) / CCF 440 (28%); WC forecast +23.9%. No stale flag (POS W38, DOT W39, today W40). DOT and OTIF figures match the tables queried directly — 2026-11-02
  - Note: the forecast-gap flags divide by our internal forecast, which leans on in-stock — the figure Walmart restated (KNOWN_ISSUES §6). PBG's +66.7% is the one most exposed to it.

  *To do*
  - [x] Committed (`dd08eb3`), branch pushed, `main` fast-forwarded and pushed; live bundle `index-cCeq-449.js` checked for the panel's text — 2026-11-02
  - [x] First review pass (Caroline's screenshot, Nov 2): the panel moves above the "Do not plan production" notice (only three actions were above the fold); forecast lines shortened to "Walmart is +66.7% vs ours, next 4 weeks" so they fit one line; the banner's "through week 202638" now reads week-ending Sunday + W## like the header — 2026-11-02
  - [x] Review fixes committed (`48a7c1b`) and live: bundle `index-CRAbeeid.js` carries all three changes — 2026-11-02
  - [ ] Caroline: second look on the live page, including the amber rows (does amber read clearly against red?)
  - [ ] `smoke-render.mjs`: add a shape where nothing fires, to cover the green "No flags this week" line (see deviations)
  - [ ] Settle KNOWN_ISSUES §6 (which in-stock figure is right): the forecast-gap flags, PBG's +66.7% above all, rest on it

  *Deviations from the plan* (Nov 2)
  - **Placement.** Planned below the placeholder notice; moved above it after Caroline's first screenshot, because only three of eight actions were above the fold.
  - **Forecast wording** shortened from the prototype's "vs our velocity-based view" to "vs ours", so the line fits one row.
  - **Banner.** Not in the plan: "Live Retail Link data through week 202638" changed to week-ending Sunday + W##, to match the header. Spotted on the same screenshot.
  - **Smoke test.** The plan named three new shapes (flags firing, none firing, no DOT reading). Only text checks on the existing three shapes were added: `live` and `empty` cover "no DOT reading", `dot` covers expired and expiring. The green "No flags this week" path has no test (to do above).
  - **Deploy of the review fixes.** The first push was refused because `main` had moved (Supplies V2.1, PR #71, from another session). Merged `origin/main` (`d7c63dc`, no conflicts), re-ran smoke 9/9 and `vite build`, then pushed. So that deploy also carried Supplies V2.1.
  - **Review was by screenshot.** Claude in Chrome was open in the browser but not connected to this session: it only attaches at session start (`claude --chrome`).
  - Note for next time: the deploy-check loop gave a false "not yet live" (it grepped a large bundle held in a shell variable); `curl … | grep` on the asset directly confirmed it. Check that way.

  **November 5 2026 — DOT "Customer Order Details" assessed; the Walmart orders email has stopped landing; email pipeline documented.** No code or data changes (docs only).

  *Done*
  - [x] Assessed DOT's **Customer Order Details** export (received by email Nov 5; one sheet "Details", 131 order lines + 64 lot lines, 127 Walmart POs to 79 DCs, all from Mt. Sterling; order dates Oct 5 – Nov 4). It is **all** order lines, not exception-filtered like the Order History, and adds what the Inventory Snapshot cannot: (1) orders by DOT stage per SKU: Open 1,486 cs (WC 525 · PBG 105 · CCF 168 · **BC 688**), Picking 159, Loaded 471, Delivered 321. The snapshot's "committed" is Loaded + Picked only, so Open orders still count as sellable there; (2) the lot and expiry picked per order: near-dated lots are shipping (CCF 147 cs expiring Dec 16–23, WC 21 cs Dec 24 + 124 cs Dec 31, PBG 33 cs Dec 23), about six weeks of life at ship; (3) DOT-side timing per PO (appointment, departure, DC arrival, reconciled). No cuts in this window; no stock levels — a complement to the snapshot, not a replacement — 2026-11-05
  - [x] Found while matching it: **none of the 1,486 Open cases are in the app, and `purchase_orders` has not changed since 2026-10-28 11:00 UTC** (the daily job's time). POs DOT shows as Delivered are still `pending` in the app. So the Walmart orders email import has not landed for 8 days and the Demand Planner's NetSuite orders series is frozen at Oct 28 (POS, forecast, OTIF and DOT are manual uploads, unaffected). Cause not checked: `upload_log` / `gmail_sync_state` are not readable with the anon key. Caroline: "there might have been an issue with the email" — 2026-11-05
  - [x] Email pipeline traced and documented in RUNBOOK §9.3 (the Walmart orders row was missing from its table) and new §9.6a (pause / resume, the 2-day look-back gap, how to tell if it is running) — 2026-11-05

  *Decisions* (Caroline, Nov 5)
  - **Pause pulling from email — documented, not done yet.** Caroline will run the SQL herself (RUNBOOK §9.6a). The "Check for new" button has no off switch; turning it off is a code change, not made.
  - **Focus on the Demand Planner.** The row-cap review of `/orders` and `/payments` is on hold (see the ticket).

  *To do*
  - [ ] Caroline: pause the daily email job (RUNBOOK §9.6a), if still wanted
  - [ ] Find why the Walmart orders import stopped after Oct 28 (email not sent? Gmail grant revoked by a systems@ password change, §9.2? stuck `processing`?). With an admin login: `upload_log where source='email'`, `gmail_sync_state`
    - *Clarified Nov 5:* the stalled feed is the **NetSuite / Cortina `Walmart_Orders_…` export** (card 6), not Retail Link: Retail Link tables are separate and current (POS W38, OTIF W37). It normally arrives **nightly**, so 8 days is not timing. Caroline will refresh once the next email arrives. First check: search systems@ for `Walmart_Orders` after Oct 28 — there → our Gmail connection (reconnect on `/uploads`, then Check for new); absent → Cortina stopped sending (ask DMorales, or upload the latest file on card 6, which carries the full history). A broken Gmail connection would also block Caroline's weekly Retail Link email
  - [ ] Decide: make Customer Order Details an upload (like the Inventory Snapshot) — would split DOT sellable into open-ordered vs free in the funnel, add a "near-dated lots shipping" check to the actions panel, and show orders as soon as DOT has them
  - [ ] Ask Cortina: do Walmart DCs accept cases with ~6 weeks of shelf life left (the Dec 16–31 lots shipping now)?

  *Email agent narrowed* (branch `feat/email-weekly-retail-link`; same day)
  - [x] `gmail-poll` classifies **by rule only**: weekly Retail Link email (subject `Dirty Cookie | Weekly Reporting | WK##`, now from **caroline@bentonvillemerchants.com**) and Cortina's `Walmart_Orders_…`; everything else `other`. Haiku classifier removed, so no email content goes to Anthropic — 2026-11-05
  - [x] `gmail-extract`: the weekly email's .xlsx attachments are **auto-imported through upload cards 1–4's parsers**, each routed by its contents (`_shared/retailLinkDetect.ts`), not its filename, because the reports may change. An unrecognised file is reported in `gmail_messages.error`, the rest still import. Walmart orders unchanged. **Removed:** Assemblers report handling (leaving that co-packer) and PO / BOL / supplier-confirmation extraction (later phase); both in git history before this branch. The weekly body scorecard / screenshots (`weekly_reports`) are no longer imported — 2026-11-05
  - [x] Tests: `deno check` on both functions; routing test on the real OTIF 1-week and 3-week exports (both → OTIF, parsed in Deno: 96 POs / 3,157 cs / 185 unfilled for W37, matching the live figure; 299 POs for W34–37), synthetic WK## and Supply Plan layouts, and four real non-Retail-Link workbooks (Spec Sheet, product list, sales trend, DOT Customer Order Details → none). `vite build` clean — 2026-11-05
  - [x] `/uploads` inbox card text and RUNBOOK §2.7 / §9 updated — 2026-11-05
  - Decisions (Caroline, Nov 5): auto-import all four weekly files; reports may change, so route by contents. Remove everything Assemblers (screens and imports; data kept; raw materials stay under a generic co-packer). Remove the AI sorting step.
  - Suggested to Caroline for the Retail Link pull (the reports may change): flat item × week extracts with stable headers, units stated, all four items incl. BC, rolling 52 weeks; first ask: POS + store / DC on-hand **as weekly history** + stores with sales; then dated store / DC forecasts, DC inventory by DC, store × item monthly, markdowns / claims
  - [x] **AI sorting removed entirely**: `_shared/anthropic.ts` deleted (Caroline, Nov 5: "remove the AI sorting step") — 2026-11-05
  - [x] **Everything Assemblers removed, data kept** (Caroline, Nov 5: "Remove anything related to assemblers"; Dirty Cookie still holds raw materials at its next co-packer, same flow). Deleted: `src/parsers/production.js` + `assemblers.js` (and their `/uploads` card), the production-run **Reorder Calculator** tab (`ReorderCalculator.jsx`, `useScenarios`, `useIngredientInventory`), and **Lot Trace** (`LotTrace.jsx`, `useLotTrace`, route, nav entry, the "Trace ↗" links on PO lots). Renamed to a generic co-packer: `useAssemblersInventory` → `useCoPackerInventory`, Inventory's "Assemblers Chicago" block → "Co-packer", the By Product location, the transition checklist step ("Co-packer adjusted"), empty-state texts (stock now moves only through Incoming and adjustments). Kept: `useProductionData` / `utils/bom` (Reference's raw-materials overview still reads the historical runs), all tables and data, the Supplies seed's "Assemblers LLC" vendor row (a real supplier record). DOT snapshot upload still refuses an Assemblers file, now saying it is no longer imported — 2026-11-05
  - **Deviation:** reverses the README's "Hidden is not dead — do not delete these pages or their parsers" (Caroline, Aug 23 2026) for Lot Trace and the Assemblers parsers; README and RUNBOOK updated. **Earlier the same day** the Assemblers upload card was kept (a default taken while unanswered); superseded by this.
  - [x] Checks: `deno check` both functions; DOT snapshot tests 12 pass / 0 fail (1 skipped: needs the real file); `smoke-render.mjs` 9/9; `vite build` clean; no remaining imports of deleted files — 2026-11-05
  - [x] Committed `97d3c8c`, merged to `main` (fast-forward) and pushed; site bundle `index-DO48gYNP.js` matches a local build. `gmail-poll` v6 and `gmail-extract` v17 deployed 22:35 UTC — 2026-11-05
  - [ ] First live weekly email after deploy: check four `source='email'` upload rows and `gmail_messages.error` empty
  - [ ] Not tested on a real Supply Plan or Dirty Cookie WK## file (none on disk); the first email is that test
  - Note: the daily job reads only the last 2 days. If Caroline's latest weekly email is older than that, it will not be picked up on deploy — reset `gmail_sync_state.last_polled_at` (RUNBOOK §9.6a) or upload by hand

  *Raised at the end of the session (Nov 5)*
  - [ ] **DOT Customer Order Details — upload card 9** (branch `feat/dot-customer-orders`, built 2026-11-05). DOT's order-status snapshot: every Walmart line DOT is working (Open / Picking / Loaded / Delivered), requested + appointment dates, cut reason, lot + expiry picked. Parser `src/parsers/dotCustomerOrders.js` (test: `node scripts/test-dot-customer-orders.mjs <file>`, matches the first file: 131 lines, 127 orders, 2,437 cs, no cuts), table `dot_customer_orders` (migration `20261105130000`, lots as jsonb). **Stored only — the Demand Planner does not read it yet.** Candidates: open pipeline by requested week (what DOT ships next), remaining shelf life at ship from the expiry picked, cut-reason breakdown once a cut appears. To go live: dry-run should list only `20261105130000`; push; merge
  - [ ] **DOT Consignment Sales History — upload card 8** (branch `feat/dot-consignment-sales`, built 2026-11-05). DOT's every-shipment, by-item outbound export: parser `src/parsers/dotConsignmentSales.js` (test: `node scripts/test-dot-consignment-sales.mjs <file>`, matches the first file exactly), table `dot_consignment_sales` (migration `20261105120000`), hook groups per Walmart PO × SKU so re-placed DOT orders are not counted as cuts. Wired into cut recovery (replaces Order History for the weeks it covers; per-SKU cut table), a per-SKU DOT cut action (>5% amber, >15% red, last 4 ship weeks), the Tracker's DOT shipped / cut rows, the Data-through strip and Sources. **Live 2026-11-05:** ledger repaired for `20261102120000` (SQL-editor drift), `20261105120000` pushed via `db push --remote` (ledger in sync, table reachable via the API), merged (`d625119`) and pushed to `main`. **Still to do: Caroline uploads the Nov 5 file on card 8** and checks the cut-recovery panel and BC action on the live page. Then ask DOT for it weekly, ideally with a cut-reason column
  - [x] **Demand Planner UI and charts review** — 2026-11-05 (`feat/dp-ui-header-freshness`). Header cleaned (pack chip removed; the Walmart week is named only there, every other label is "wk ending <date>", calendar months on axes and Tracker bands); a **Data through** strip, one tile per feed with computed staleness, replaced the green status paragraph; the two amber caveats collapse to one line each; nothing under 11px except chart ticks; modelled figures hidden on the Summary tab behind `PRODUCTION_LIVE = false` (DOT buffer chip). **DOT days on hand is now measured** (sellable at DOT in the newest snapshot ÷ last-4-wk POS per day). Product card chart split into a demand panel and a store-base panel with their own axes (stores left, units/store/wk right); the single-week funnel became **Where every case sits, by week** (stacked by stage on a date axis, POS as a line, partial weeks starred). Verified with the render smoke test and a headless render on live data, not yet at phone width. Remaining review items: OTIF chart drops missing weeks without a gap; forecast-gap actions not consolidated; BC +2049% shown as a % on a tiny base; sidebar text still 8px
  - [ ] Caroline's second look at B2's amber rows (still open from Nov 2) — fold into the UI review
  - [ ] Inventory's DOT block (`WarehouseView` / `ProductView` via `useDotInventory`) reads `dot_inventory`, which has always been empty; the real DOT stock is `dot_on_hand`. Point it there (ties into "retire `dot_inventory`", Oct 28–29)
  - [ ] Recommended next build after the UI review: Customer Order Details as an upload (see to-do above)
  - [ ] Optional: turn the Retail Link report suggestions into a page Caroline can send to Caroline Collins

  **October 28–29 2026 — Supplies & Vendors (`docs/SUPPLIES_SPEC.md`).** PRs #67 (V1), #68 (V1.1), #69 (V1.2), all merged and live. Full build notes in the spec's status log.

  *Done*
  - [x] V1 (PR #67): migration `20261028120000_supplies.sql` (6 tables, `v_sku_pricing`, private `supply-docs` bucket, RLS, audit), seed generator, PDF upload script, read-only `/supplies` + `/vendors` — built 2026-10-28; live 2026-10-29 (migration pushed, seed pasted: 32 vendors · 49 items · 95 SKUs · 88 price points; 11 PDFs uploaded)
  - [x] V1.1 (PR #68): Supplies | Vendors tabs on one page (`/vendors` redirects), drill-downs open under the clicked row, items list shows latest PO (black) + best open quote (grey) with ▸ history — 2026-10-29
  - [x] Assemblers LLC closed (exiting as co-man); Fresh Coast noted as the co-man — live 2026-10-29
  - [x] Packing slip 522657 filed: the "AAI dry ingredient (TBD)" placeholder is AAI's MoisturLOK (item 23666) on PO SP029-2026; slip in `supply-docs`, AAI primary for Moisturlok — 2026-10-29
  - [x] V1.2 (PR #69): migration `20261029120000_supplies_po_landed.sql` — `supply_pos` (picked up / delivered, packing slip, ship date, freight), freight split by weight, actual = latest PO landed with ingredient vs freight broken out, `assumed_cost` per item, red ⚑ at ±5%, yellow ⚑ freight pending; editing behind the Spec Sheet lock — 2026-10-29

  *Decisions* (Caroline, Oct 28–29)
  - **Vendor data stays out of git — the repo is public.** Rev 6 contacts, account numbers and pricing live in the gitignored `scripts/supplies-data.local.mjs`; the generated `supplies_seed.sql` is gitignored too. Exception to ADR-019 (seeds committed).
  - **Seed = catalogue rev 6 + the Assembler ingredient sheet**, because rev 6 has no Brown Sugar and none of the ERP codes the spec names. 32 vendors, not 11.
  - **V1 migration applied with `--include-all`:** `20261028150000_dot_on_hand` reached the live DB first, so the earlier-dated supplies migration had to go in out of order. Additive and independent, so safe.
  - **PDFs uploaded by hand** in the dashboard: `upload-supply-docs.mjs` didn't land anything on Caroline's run (cause found 2026-11-05: a pasted command line was read as the key; re-run succeeded, see To do); the packing slip went up with `supabase storage cp`.
  - **Freight counts for pickup and delivered POs**, split across a PO's lines by weight, always shown separately from the ingredient price. Actual cost = the latest PO, landed.
  - **Assumed cost is typed** ($/lb ingredients, $/1,000 packaging) — the one hand-entered cost figure, since it's an assumption, not a document price. Red ⚑ when ≥5% off actual; yellow ⚑ when a PO lacks pickup/delivered or freight (enter 0 for none).
  - **Part of V2 pulled forward:** the edit lock plus assumed-cost and PO forms shipped in V1.2. Supplies got its own small modal; extracting the shared `EditModal` (V2.1) is still to do.
  - **Seed re-runs leave app edits alone:** POs insert-only, `po_id` fill-only, `assumed_cost` not seeded; `RETIRED_ITEMS` deletes renamed placeholders.

  *To do*
  - [x] Back up `scripts/supplies-data.local.mjs` outside the repo (it exists only on this Mac) — *Nov 2: now also `scripts/marc-supplies.local.xlsx`* — 2026-11-05: both copied by Caroline to the **systems@dirtycookie.com** Google Drive (unshared folder). Not via the Drive connector, which is signed into her personal Gmail. Re-copy after either file changes
  - [ ] Enter freight on Batory SP026 and AAI SP029 once the trucks are booked; McCormick SP028 pickup / delivered + freight (all three yellow-flagged)
  - [ ] Set assumed costs per item
  - [ ] AAI Moisturlok unit price off PO SP029 (slip has none); who books the EXW Stockton cold-storage pickup
  - [x] ~~Confirm ERP 121002 = Great River dough-puck tray; decide whether the undated Assembler-sheet prices stay "active" quotes~~ — superseded 2026-11-02: the Assembler sheet was replaced by Marc's sheet, whose prices are a de-emphasized "reference" tier, not quotes; 121002 isn't on Marc's sheet, so the code was dropped (see Nov 2 below)
  - [ ] Click through `/supplies` in the real app (verified only by server renders); compare against the v13 prototype — *Nov 5: still to do; the PDFs are now in `supply-docs`, so the quote document links can be checked too*
  - [x] Find why `upload-supply-docs.mjs` didn't upload on Caroline's run — 2026-11-05: the script was fine (all 11 PDFs build with `--out`). Pasting the `read -s` key prompt together with the next command line made the prompt take that line as the key, so Storage answered "Invalid Compact JWS" for every file. With `read -s` run on its own and the service_role key checked (`eyJ…`, 2 dots), Caroline re-ran it and reports all 11 uploaded to `supply-docs`
  - [ ] Rest of V2 — *Nov 2: V2.1 shared EditModal done (#71); V2.2 add/edit vendors, items, SKUs, quotes, PDF upload still to do* — then V3a / V3b

  **November 2 2026 — Supplies: chip merge, V2.1 shared modal, Marc's sheet as the base.** Notes in `docs/SUPPLIES_SPEC.md` status log.

  *Done*
  - [x] White Chocolate Chips 1000ct/4000ct and Peanut Butter Chips 1000ct/4000ct merged into one item each; 1K/4K (chips per lb) on each SKU's order unit, $/lb side by side (`ITEM_MERGES`, commit `32af9bc`, pushed straight to `main`) — 2026-11-02
  - [x] V2.1 (PR #71): shared `components/shared/EditModal.jsx`; Spec Sheet configs → `specsheet/specForms.js`, Supplies forms → `supplies/supplyForms.js`, `SupplyEditModal` removed. No behavior change (old vs new modal HTML diffed for every form, add + edit) — 2026-11-02
  - [x] Marc's sheet as the base, de-emphasized (branch `feat/supplies-marc-reference`): migration `20261102120000_supplies_reference_tier.sql` (`quotes.doc_type 'reference'`, `vendor_contacts.source 'marc_sheet'`); seed reads Marc's workbook; faint reference prices, "⚑ get a quote", undocumented-vendor badge, faint rolodex contacts. Verified in PGlite (old → new seed, idempotent, guards) and by rendering both tabs — built 2026-11-02; merged to `main` (`d48a900`, no PR — none was opened and `gh` isn't installed) and **live 2026-11-02**: migration and seed run in the SQL editor, bundle `index-B7yMX9a8.js` checked for the new UI text

  *Decisions* (Caroline, Nov 2)
  - **1K / 4K is a unit, not a different item.** Kept as a SKU attribute on the order unit; compare on $/lb. (1K/4K is chip count per lb — Walmart uses 1K WCC, Kroger 4K.)
  - **Marc's sheet replaces the Assembler sheet** (it is a newer copy of it). The 26 Assembler-only SKUs/prices are retired (`LEGACY_SHEET`, frozen), guarded: anything with a PO link or a typed assumed cost stays.
  - **Marc's data is shown, but de-emphasized**, to push people toward real quotes and POs: never the best quote or actual cost, always below documents; items with no document get "⚑ get a quote". Chosen over hiding it behind a toggle.
  - **Marc's workbook stays out of git** (contacts + pricing; repo is public): `scripts/marc-supplies.local.xlsx`, gitignored.

  *Deviations*
  - **Chip merge went straight to `main`, no PR** — `gh` isn't installed here, so it was pushed as a fast-forward. Later work went through PRs (#71) via the GitHub "new PR" link.
  - **V2.1 also moved the Supplies modal onto the shared one.** The spec only named the Spec Sheet; doing both now means V2.2's forms start on one modal.
  - **New, not in the plan: the "reference" tier.** Marc's sheet arrived mid-session; it needed a schema change (doc_type + contact source) before V2.2.

  *To do*
  - [x] Merged (`d48a900`); Marc's workbook copied to `cookie-central/scripts/marc-supplies.local.xlsx`; migration `20261102120000` and the rebuilt seed (34 vendors · 34 contacts · 47 items · 82 SKUs) run in the SQL editor — 2026-11-02. *Deviation: migration pasted in the SQL editor, not `supabase db push` — the CLI wasn't on PATH. It is missing from the migration ledger, so the next `db push` will re-run it; it is idempotent (DROP/ADD constraint, ADD COLUMN IF NOT EXISTS), so that is harmless — same as `20261027160000` on Oct 29.*
  - [x] Chip merge applied — same seed run — 2026-11-02
  - [ ] Caroline: click through the reference tier on the live page (faint lines, flags, rolodex badges) — data verified only by a database test, not on the live page (Supplies data is readable only when signed in) — *Nov 5: still to do; can be done together with the item above. Also check the new 12 → 8 banner on the Demand Planner Summary tab (verified only by the render smoke test)*
  - [x] Clean up: `git worktree remove ../cookie-central-chips`; delete branch `feat/supplies-marc-reference` on GitHub — done 2026-11-02 at the end of that session, along with the merged `feat/supplies-merge-chips`, `feat/supplies-v2.1-edit-modal`, `supplies-v1`, `supplies-v1.1` and `supplies-v1.2`
  - [ ] V2.2, in this order: Add quote + PDF upload (so "⚑ get a quote" leads somewhere), vendors + contacts (incl. "confirm" for Marc's contacts), items + SKUs, deletes
  - [ ] Check name mappings assumed from Marc's sheet: "Salina" = Solina, distributor "Moisturlok" = Anderson Advanced, "See Fresh Coast Bakery" = Fresh Coast
  - [ ] Decide: delete `prototype/Assembler_Ingredient_Data.csv` (nothing reads it now)
  - [ ] Install `gh` so PRs can be opened from the session

  **October 29 2026 — EOS: the Rocks tab went blank at the quarter turn.** No migration, no data change.

  *Done*
  - [x] Diagnosed: the Rocks tab always opened on the current quarter, which became `2026-Q4` on Oct 1, while all six Rocks are `2026-Q3`. Nothing was deleted (no migration or code path removes Rocks), and Q3 stayed reachable from the picker — 2026-10-29
  - [x] `Rocks.jsx` now opens on the current quarter if it has Rocks, otherwise the latest earlier quarter that does; a manual pick wins — 2026-10-29

  *Decisions*
  - **Fixed the default in code, not by copying Q3 into Q4.** Rocks are set fresh each quarter in EOS, so carrying Q3's into Q4 would invent commitments nobody made.
  - **Not verified against the live DB:** EOS tables are RLS-gated to signed-in internal roles, so the anon key returns nothing. Only the build was verified.

  *To do*
  - [ ] Confirm the six Q3 Rocks show in the app (sign in → `/eos` → Rocks)
  - [ ] Close out Q3 (mark each Rock done / dropped) and set the Q4 Rocks; the tab then opens on Q4

- **Phase 2 — Operations:** upcoming (weeks following Phase 1 ship).
- **Phase 3 — Financials + Rollout:** late summer 2026.

## Standing decisions (Spec Sheet, Sample Central, ShipStation)

Rules set in the July 2026 senior review and build plan. They still hold. Full reasoning is in `DECISIONS.md`, ADR-024 to ADR-046. *(From Oct 29 2026, new decisions go in the timeline entry's* Decisions *list below, not in `DECISIONS.md`. That file is the record to ADR-063.)*
- **Compute derived values, never store them:** storage (from prep), case net weight, shipment temperature and the price list are views or render-time calculations.
- **Reference by code or id, never by display text:** line items, templates and case compositions point at `products.code` and friends.
- **ShipStation automation rules use tags, never item SKUs.** SKU rules silently skip multi-item orders, and sample orders are usually multi-item.
- **ShipStation owns fulfilment and status:** box, service, label and email routing. The site sends intent and reads status back; it never sets status itself (ADR-032).
- **One product spine:** Sample Central reads Spec Sheet products (`sample_eligible`) and keeps no product list of its own.
- **Branch per change; Caroline reviews before merge.** Any deviation from a plan gets a dated note in that entry's *Decisions* list (Oct 29 2026: no longer an ADR).

*Folded in Oct 22 2026 (all in git history):* `EXTENSION_BUILD_PLAN.md`, `CLAUDE_CODE_TASKS.md` and `SENIOR_REVIEW.md` (the July plan, task list and review; that work is done, see Timeline) and `DATA_MODEL_ADDITIONS.md` (now the as-built section of `DATA_MODEL.md`). `PRELAUNCH.md`'s open items moved to the Launch checklist below.

## 🟢 FIXED (Nov 5 2026), pending deploy and review — Row-cap truncation. *Crossed on or before Oct 12 2026*

**Raised:** Aug 24 2026, during the Demand Planner live-data work.
**Status:** ✅ **Fixed on `fix/row-cap`, Nov 5 2026** — see "Built" below. Was ⚠️ ACTIVE from Oct 12: the forecast below came true early.
**Severity:** silent data loss on pages the team trusts. No error, no empty state.
**Owner:** Claude Code, branch `fix/row-cap` (planned Nov 5 2026).

### Measured Nov 5 2026 (exact counts via the API)

```
po_changes         5,496   read per PO only (eq po_id) — not affected
po_line_items      1,858   nested under purchase_orders — complete once the parent is paged
purchase_orders    1,502   unpaged select returns 1,000 → 502 POs and 629 order lines missing
cortina_invoices   1,148   unpaged select returns 1,000 → 148 invoices missing  ← NEW, not in the table below
retail_link_forecast 828   already paged (useDemandFeeds)
retail_link_otif     654   already paged (useDemandFeeds)
```

Two corrections to the "Impact" table below: **`usePayments` no longer reads `payments`**; its list hook `useCortinaInvoices` reads `cortina_invoices`, which has now crossed too. Edge functions (`gmail-extract` etc.) read one PO at a time and are not affected. `useEomSnapshot` filters by month.

### Plan (Nov 5 2026)

1. Move `fetchAll` from `src/hooks/useDemandFeeds.js` to `src/lib/fetchAll.js`; `useDemandFeeds` imports it (no behaviour change).
2. Page through it, each with `.order('id')` so pages neither overlap nor skip: `usePurchaseOrders` (list, nested `po_line_items`), `useAlerts` (`purchase_orders`, and its small `payments` read while there), `useCortinaInvoices`. Client-side sorting (urgency, unpaid/date) stays as is.
3. `scripts/row-counts.mjs`: exact count of every table `src/` reads, flagging any over 800. RUNBOOK §6.2's row-count watch runs it instead of the single `purchase_orders` check.
4. Check: `vite build`; `smoke-render.mjs` (shares `fetchAll`); each hook's loaded totals on live data match the exact counts (1,502 POs / 1,858 lines / 1,148 invoices); Caroline reviews `/orders` and `/payments` by URL.

*Decisions* (Caroline, Nov 5)
- **Count script + runbook**, not paging every whole-table read now: the script flags the next table before it crosses.
- **Product Orders and Payments stay hidden.** This fixes their data only; un-hiding is part of their rework.

### Built (Nov 5 2026)

- [x] `src/lib/fetchAll.js` (moved from `useDemandFeeds`, which imports it; Demand Planner smoke 9/9) — 2026-11-05
- [x] Paged, each `.order('id')`: `usePurchaseOrders` list, `useCortinaInvoices`, `useAlerts` (`purchase_orders` + `payments`) — 2026-11-05
- [x] `scripts/row-counts.mjs`; RUNBOOK §6.2 runs it, §5.9 marked fixed — 2026-11-05
- [x] Read back on live data by running the real hooks offscreen, against `main`'s versions:

  | Hook | `main` (unpaged) | `fix/row-cap` | Exact count |
  |---|---|---|---|
  | `usePurchaseOrders` | 1,000 POs · 1,207 lines | 1,502 · 1,858 | 1,502 · 1,858 |
  | `useCortinaInvoices` | 1,000 | 1,148 | 1,148 |
  | `useAlerts` | 218 alerts | **388 alerts** | — |

  170 alerts were silently missing. The unpaged line count also drifts between runs (1,229 earlier the same day): without an `ORDER BY`, *which* 1,000 POs come back is not stable. `vite build` clean — 2026-11-05

*Deviations from the plan* (Nov 5)
- `row-counts.mjs` also reads `useSupplies`' table list (it calls `supabase.from(table)` with a variable, invisible to a `.from('…')` grep).
- With the anon key, internal-only tables (Supplies) count **0**, not an error. The three tables this ticket is about are readable by all (`USING (true)`), so their counts are exact. The script takes `SUPABASE_SERVICE_ROLE_KEY` for exact counts everywhere and says so when it runs on anon.
- New, not fixed: `useSupplies` reads nine tables/views unpaged. All are under 100 rows today; the script will flag them.

*To do*
- [x] Committed `7e1ed72`, merged to `main` (fast-forward) and pushed; live bundle `index-zhO-AuBr.js` identical to a local build of that commit — 2026-11-05
- [ ] Caroline checks `/orders` and `/payments` by URL (both stay hidden). **On hold (Caroline, Nov 5): Demand Planner first.**
- [ ] Then close this ticket (move it out of the open section)

### The problem

Supabase/PostgREST returns **at most 1,000 rows per query** and gives **no indication** when it truncates — the response is simply short. Any hook that reads a whole table without paging silently stops seeing rows past 1,000.

**`purchase_orders` was at 892 rows** (Aug 24 2026), growing **~45–50/month** from the nightly Cortina export, projected to cross 1,000 around **November 2026**.

### Current state — measured Oct 12 2026

```
purchase_orders   1,265 rows   → an unpaged select returns exactly 1,000
po_line_items     1,606 rows   → an unpaged select returns exactly 1,000
```

Both are truncating **now**, confirmed by measurement rather than inference: the response is 1,000 rows long, HTTP 200, no warning. It arrived ahead of the November estimate because the daily `walmart_orders` email ingest upserts the full ~1,229-line Walmart order book every day, which grows `purchase_orders` faster than the ~45–50/month figure assumed.

✅ **What is limiting the damage:** all three affected surfaces are currently hidden from the sidebar (`hidden: true` in `src/components/Sidebar.jsx`), and `AlertsPanel` is mounted only in `ProductOrders.jsx` and `WeeklyReport.jsx` — both hidden. Nobody is being shown short data *through the nav*. The routes still resolve, though, so typing `/orders` or `/payments` gets truncated numbers with no indication.

⚠️ **Product Orders is due back around Oct 2026. That makes this a blocker for that work, not a background chore.** Bringing the page back without paging its hook ships a page that silently drops 265 POs on day one.

### Impact when it crosses

| Page | Hook | What breaks |
|---|---|---|
| Product Orders | `src/hooks/usePurchaseOrders.js` | POs stop appearing in the list and KPIs |
| Payments | `src/hooks/usePayments.js` | invoices/payments go missing |
| Alerts | `src/hooks/useAlerts.js` | at-risk POs stop being flagged — the alert simply never fires |

The Alerts case is the worst: a missing alert is indistinguishable from "nothing is wrong."

### This is not hypothetical — it already happened

On the Demand Planner's first live day, `po_line_items` (1,194 rows) was truncated: **~16% of the order book was missing** and nothing surfaced it. Caught only by reconciling the computed series against its own source file — `req` scored 37/49 truncated vs 49/49 paged.

### The fix

Copy `fetchAll` from `src/hooks/useDemandFeeds.js` — it pages in 1,000-row chunks and is already in production. Apply to the three hooks above.

⚠️ **Paging requires a stable `ORDER BY`.** Without one, Postgres may return rows in a different order per page and the pages will overlap and skip. `useDemandFeeds` orders every paged query for exactly this reason.

### How to check any table's count

```bash
curl -sI "$VITE_SUPABASE_URL/rest/v1/<table>?select=id" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  -H "Prefer: count=exact" -H "Range: 0-0" | grep -i content-range
```

### Acceptance

- [x] The three hooks page rather than single-shot, each with a stable `ORDER BY` — 2026-11-05
- [ ] A count check on `purchase_orders` and `po_line_items` matches what the page displays. *Hook level done Nov 5 (1,502 / 1,858); page level waits on Caroline's review.*
- [x] `RUNBOOK.md` §6.2's weekly row-count watch is replaced by `scripts/row-counts.mjs` (run weekly, not automatic) — 2026-11-05

**Also worth deciding:** whether to page every hook pre-emptively rather than wait for each table to cross 1,000 one at a time. Tables currently well under: `raw_material_lots` 158, `lot_shipments` 129, `raw_materials` 32.

---

## Blockers (Phase 1)
- [x] systems@dirtycookie.com access — DONE
- [x] Shahira sign-off on prototype — DONE
- [x] Assemblers **inventory** report sample received — parser reconciled
- [x] Assemblers **production** report format — confirmed; one multi-sheet workbook covers Production / Reject / Inventory / Shipment + N Job sheets. Parsed end-to-end. Outbound (Shipment sheet) folded in. Raw-ingredient **landing/BOL** is captured separately via the Inventory → Reorder → Landing flow.
- [x] Cortina NetSuite PO export — parser built behind column-mapping seam; interim Cortina PO **PDF** parser added for manual upload until the NetSuite API lands (demo POs since removed)
- [x] DOT portal sample — parser built behind column-mapping seam; format still pending
- [x] EOM summary — built from live PO + adjustment + weekly_report data, no separate export needed
- [x] QBO sample — parser built behind column-mapping seam pending real file

## Phase 1 outcome (as of 2026-06-01)

**Status:** demo modules shipped + live on Vercel + populated against the seeded Assemblers workbook. AI email reader (Day 10) ✅ and lot-traceability chain UI (Day 11) ✅ now done. Last outstanding ship blocker: Cortina NetSuite real-file reconciliation (waiting on Harshita's sample); DOT/QBO real-file reconciliation remain non-blocking. 15 migrations applied; 7 prototype POs + Assemblers Production workbook seeded.

Module-by-module:

- **Day 1 — Foundation:** ✅ complete (1.1–1.9).
- **Day 2 — Parsers + upload pipeline:** ✅ pipeline + upload log + parsers. Assemblers report (one workbook) is the canonical Assemblers upload — Inventory delegated through to the original assemblers.js parser; DOT/QBO/NetSuite behind column-mapping seams ("format unconfirmed").
- **Day 3 — Product Orders:** ✅ list (3.1) + detail (3.2) + Fulfillment Timeline + 3 DOT-leg columns. Email thread renders `po_emails` (3.3). **AI Insight card (3.4)** now reads live `po_emails.extracted_data` from the systems@ agent (with a PO-state fallback before any email lands).
- **Day 4 — Inventory Warehouse:** ✅ 3-view toggle (4.1), DOT (4.2), Assemblers raw + packaging (4.3 + 4.4), raw→Reference deep-link (4.5), per-warehouse upload links + timestamps (4.6).
- **Day 5 — Reorder + landing + product view:** ✅ reorder preview (5.3) with distributor/brand select (5.5) + Marc override (5.4). **Product view (5.1)** + **Adjust Inventory (5.2)** built — shrink/expired/damaged/disposed with audit-log writes. Landing flow added (lot origin: land date + 1:many lots). Allocation view (5.6) pending real production-consumption data.
- **Day 6 — Payments / Reference / Weekly:** ✅ Payments list (6.1) + detail (6.2) with 3-stage timeline. Reference > Products (6.3) from Walmart item master. **Reference > Raw Materials (6.4)** with distributor / FIFO / orders / usage + inline + Add Distributor / + Add Order. **Reference > Transitions (6.5)** with interactive checklist + new-transition form. Weekly Report shell + WK16 Bentonville parser (6.6).
- **Day 7 — EOM / Alerts / Audit / Demo:** ✅ **EOM Snapshot (7.1)** month-pinned with vs-prev deltas. **Alerts engine (7.2)** computed over live state, surfaced on Product Orders + Weekly Report. **Audit Log viewer (7.3)** with table/action/user/range filters, RLS-gated to admin/finance. Real-data testing (7.4) covered by the live Assemblers upload. Loading/error states (7.5) in place. Demo (7.6) delivered.
- **Day 8–9 — Phase 1 wrap-up:** Weekly Report email parser (8.2) and Bentonville attachments parser landed earlier; "Check for new" (8.3) + week archive (8.4) wired off the parsed `weekly_reports` table. NetSuite API (8.1) deferred to Phase 2.

### Added beyond the original Day-1-7 plan
- `raw_material_lots.raw_material_order_id` FK (lot→order provenance)
- DOT-leg dates on `purchase_orders` (3 new columns)
- `po_changes` + `po_lot_numbers` + `bol_number` for delivery traceability
- `user_role_seeds` + `handle_new_auth_user` trigger for auto-provisioning roles on first sign-in
- Password sign-in fallback (sidesteps email-rate-limit failures)
- 5 production tables (`production_runs`, `production_pallets`, `production_subcomponents`, `production_rejects`, `lot_shipments`) — the Assemblers production workbook's full breakdown
- ~~Demo seed pattern (`supabase/seeds/`) — idempotent prototype data~~ — removed June 2026 as real Cortina data (PDF upload) landed
- Consolidated Assemblers upload (single card, one workbook covers all sheets)

## Launch checklist

**Ship blockers (must close before declaring Phase 1 shipped):**
- [x] **AI email reader** — Day 10.1–10.5 — built + deployed (3 Edge Functions, OAuth connected to systems@, 6-way classification, structured extraction + attachment auto-import + parked-email back-fill). See RUNBOOK §9.
- [ ] **Cortina NetSuite real-file reconciliation** — Harshita sample → column-mapping pass against parser
- [x] **Lot Traceability chain UI** — Day 11.1–11.4 — built: `/trace` page resolves any lot code (raw / FG / outbound) both directions, "Trace ↗" deep-links from Delivery & Lots + Reference FIFO, in-memory normalised join (handles 11.3 format drift), recall report with CSV copy. See `src/pages/LotTrace.jsx` + `src/hooks/useLotTrace.js`.

**Already done:**
- [x] Eight demo modules functional + live on Vercel
- [x] All migrations applied (15 total) and in `main`
- [x] Demo seed data removed once real Cortina data (PDF upload) landed
- [x] systems@dirtycookie.com admin sign-in provisioned (magic link + password fallback)
- [x] RLS policies cover INSERT/UPDATE/DELETE on every write-path table
- [x] Audit log gated to admin/finance; ops users see explicit "restricted" panel
- [x] Cascade-delete FK so user lifecycle ops don't error
- [x] Production deploy to Vercel
- [x] Supabase Auth Site URL + Redirect URLs pointed at the Vercel domain
- [ ] **Talk to David about the QBO connection** — confirm the QBO API access path he can grant, and whether Phase 1 stays on CSV upload or jumps straight to API
- [ ] **Cortina NetSuite PO export sample** — still waiting on Harshita; reconcile real file against the parser's column-mapping seam once received
- [ ] Real DOT portal CSV reconciled against the parser
- [ ] **Phase 1 invites** — Marc (ops), David (admin), Paul (admin). Pre-provision in Auth dashboard with password + Auto-confirm, share Vercel URL.
- [ ] **Shahira invite** — deferred until Phase 2 is fully shipped (post-AI-agent).
- [ ] **Kroger reporting source** — parked for now (Walmart's Bentonville feed covers `/weekly`; Kroger equivalent TBD).
- [ ] **Ingredient master data** (`raw_material_suppliers`: distributor, brand, cost/unit, MOQ, lead time per ingredient) — needs population. Two paths to confirm with Marc: (a) one-time spreadsheet entry, or (b) let the Day 10 AI agent backfill from order confirmation emails as they arrive. Option (b) is incremental + lower upfront effort but slower to a complete picture.
- [ ] **Subdomain on dirtycookie.com** — hidden + protected entry. David owns the website infra; conversation needed on which subdomain (`ops.`/`central.`/something else), how to gate access beyond Supabase Auth (IP allowlist? Vercel password protection? basic auth at the edge?), and who manages DNS + the cert.
- [x] **Anthropic console + ANTHROPIC_API_KEY** — provisioned + stored in Supabase Vault.
- [x] **Gmail OAuth for systems@dirtycookie.com** — OAuth client provisioned; systems@ granted refresh-token consent; token stored in Vault. Agent connected and processing live mail.
- [ ] **Rotate the Supabase `service_role` key.** It was shared into a dev session on 2026-06-02. That was precautionary, with no sign of exposure. Supabase → Project Settings → API → roll `service_role`. If `EDGE_CRON_BEARER` holds the same key, re-point it: `select public.set_secret('EDGE_CRON_BEARER', '<new key>');`. *(Moved from PRELAUNCH.md.)*
- [x] **Demo and simulated POs removed:** PO14201…PO14400 and PO14451 are gone from `purchase_orders` (checked 2026-10-22). *(From PRELAUNCH.md.)*
- [x] **Demand Planner supply-side numbers flagged as placeholder** in the UI — 2026-08-24. Still worth telling the team out loud. *(From PRELAUNCH.md.)*
- [ ] **Add the DOT Order History to the weekly upload routine.** The last upload was 2026-08-24, still true on 2026-10-22. On the next one, check whether it contains orders with zero cuts. *(From PRELAUNCH.md.)*
- [ ] **Don't raise the "CCF ×5.0 forecast" with Bentonville.** That figure was retracted; the defensible one is CCF 26,549 vs 5,355 at week 202629. *(From PRELAUNCH.md.)*
- [ ] **Decide on Walmart's PB&J in-stock restatement** (weeks 21–27 revised from 0.62–0.69 up to 0.87–0.98). It moves the forecast. *(From PRELAUNCH.md.)*
- [ ] **Run `node scripts/smoke-render.mjs` before any Demand Planner deploy.** The page shipped blank three times without it. *(From PRELAUNCH.md.)*
- [x] **BC's name and short code confirmed** — 2026-10-22 (see Timeline). The Walmart products now exist in the Spec Sheet, keyed by Cortina item number. The Demand Planner still translates item numbers with hardcoded maps in `useDemandFeeds.js`; reading them from the Spec Sheet would stop a new SKU from disappearing silently. *(From PRELAUNCH.md.)*
- [x] **AI Agent build (Day 10.1 – 10.5)** — Gmail OAuth, polling Edge Function (daily cron + button), six-way classification, structured extraction into `po_emails` + `po_lot_numbers` + `po_changes`, PO-detail AI Insight card swapped to live extraction, supplier-confirmation + emailed-Assemblers/weekly auto-capture. Deployed. (Cron migration `..150000` applied separately; see RUNBOOK §9.1.)

---

## PHASE 1 — Visibility (~58 hrs, 8–9 working days)

### Day 1 (Wed May 21): Foundation
| # | Task | Est | Notes |
|---|------|-----|-------|
| 1.1 | Init Vite + React project, Tailwind, folder structure | 0.5h | |
| 1.2 | Link Supabase project (already connected to GitHub), configure env vars | 0.5h | `supabase link`, copy URL + anon key to .env.local |
| 1.3 | Push initial migration — `npx supabase db push` | 0.5h | All 20 tables, indexes, RLS, triggers auto-deploy via GitHub |
| 1.4 | Set up Supabase Auth with magic link | 0.5h | Roles: admin, finance, ops |
| 1.5 | Seed user_profiles table with initial users | 0.5h | Shahira, Marc, David, Paul, Maria, Caroline |
| 1.6 | Deploy to Vercel, connect GitHub for auto-deploy | 0.5h | |
| 1.7 | Build sidebar navigation + layout shell | 1h | Match prototype sidebar exactly |
| 1.8 | Build UOM context provider | 1h | Cases/CU/Cookies/Pallets conversion |
| 1.9 | Build retailer filter context | 0.5h | All/Walmart/Kroger, persists across pages |

### Day 2 (Thu May 22): Parsers + Upload Pipeline
| # | Task | Est | Notes |
|---|------|-----|-------|
| 2.1 | Upload pipeline component (drag-drop, validate, preview) | 2h | Reusable across all upload types |
| 2.2 | Upload log table + UI | 0.5h | Shows all uploads with timestamps |
| 2.3 | Assemblers report parser | 3h | 389 rows → categorize raw/packaging/FG, flag expired |
| 2.4 | DOT portal CSV parser | 1.5h | Pallet-level → SKU aggregate |
| 2.5 | ~~QBO CSV parser~~ → moved to Phase 2 (P2.0) | — | Parser already built; integration deferred until David confirms feed |

### Day 3 (Fri May 23): Product Orders
| # | Task | Est | Notes |
|---|------|-----|-------|
| 3.1 | Product Orders list view | 2h | Retailer badges, Days column, urgency sort, KPIs, alerts |
| 3.2 | PO detail view | 2h | Info cards, line items, NOVA changes |
| 3.3 | Email thread display | 1h | Timeline UI with extracted data tags |
| 3.4 | AI agent insight card | 0.5h | Was a Phase-1 stub; now reads live `po_emails.extracted_data` (Day 10 agent) |
| 3.5 | NetSuite CSV parser (if sample received) | 3h | Map Harshita's fields to schema |

### Day 4 (Mon May 26): Inventory — Warehouse View
| # | Task | Est | Notes |
|---|------|-----|-------|
| 4.1 | Inventory page with 3-view toggle | 0.5h | Warehouse / Product / Reorder |
| 4.2 | DOT warehouse section (collapsible) | 2h | Waterfall: on-hand → incoming → transit → alloc → avail → weeks |
| 4.3 | Assemblers warehouse section (collapsible) | 2h | Raw materials with Makes/Wks columns, lead time flag |
| 4.4 | Packaging section | 0.5h | Simple table |
| 4.5 | Raw material click → Reference detail routing | 0.5h | |
| 4.6 | Upload buttons per warehouse with timestamps | 0.5h | |

### Day 5 (Tue May 27): Inventory — Product View + Reorder
| # | Task | Est | Notes |
|---|------|-----|-------|
| 5.1 | Product view with expand/collapse per item | 2h | Location breakdown, velocity, allocation |
| 5.2 | Inventory adjustment (shrink/expired/damaged) | 1.5h | Reason codes, audit log, feeds EOM |
| 5.3 | Reorder preview mode | 3h | Velocity calc, stockout, suggested qty, urgency sort |
| 5.4 | Marc's editable override column | 0.5h | |
| 5.5 | Distributor/brand selection on reorder | 1h | Dropdown populated from raw_material_suppliers |
| 5.6 | Confirm → summary + allocation view | 1.5h | POs against DOT inventory, shortfall detection |

### Day 6 (Wed May 28): Payments + Reference + Weekly Report
| # | Task | Est | Notes |
|---|------|-----|-------|
| 6.1 | Payments list with retailer filter | 1.5h | Two-stage tracking, terms column |
| 6.2 | Payment detail view | 1.5h | Line items, NOVA, paid vs outstanding, timeline |
| 6.3 | Reference — Products & UOM | 1.5h | Conversion chain, product table, product detail with BOM |
| 6.4 | Reference — Raw Materials master | 2h | Distributor/brand table, + Add Distributor, + Add Order, FIFO, audit |
| 6.5 | Reference — Transitions | 1h | From/to SKU, launch/cutoff, checklist |
| 6.6 | Weekly Report shell + WK15 data | 2h | KPIs, findings, EOS sections |

### Day 7 (Thu May 29): Polish + Demo
| # | Task | Est | Notes |
|---|------|-----|-------|
| 7.1 | EOM Snapshot | 1.5h | Monthly KPIs with vs-last-month deltas |
| 7.2 | Alerts engine | 2h | MABD risk, low inventory, expiring, unpaid, lead time |
| 7.3 | Audit log table + viewer | 1h | Filterable by user, date, table |
| 7.4 | Real data testing — first uploads | 2h | Fix parser edge cases |
| 7.5 | Loading states, error handling, responsive | 1h | |
| 7.6 | **Demo to Marc + David** | — | All modules functional |

### Day 8–9 (Fri May 30 – Mon Jun 2): Remaining Phase 1
| # | Task | Est | Notes |
|---|------|-----|-------|
| 8.1 | NetSuite API connection (if API ready) | 4h | OAuth, pagination, Edge Function |
| 8.2 | Weekly Report email parser | 3h | Parse Bentonville Merchants email format |
| 8.3 | "Check for new" manual refresh | 1h | |
| 8.4 | Week archive navigation | 1h | |
| 8.5 | Bug fixes from demo feedback | 2h | |

### Day 10+ (Phase 1 extension): AI Agent over systems@ — ✅ DELIVERED
The agent reads systems@dirtycookie.com via Gmail API, classifies each message into six categories, and extracts structured data into the existing PO tables — replacing the Phase 1 state-derived AI Insight stub with real extraction. Built as three Edge Functions (`gmail-oauth-callback`, `gmail-poll`, `gmail-extract`) + 5 migrations (`20260602*`); deployed and processing live mail. Anthropic key + Gmail OAuth creds in Vault. Beyond the original scope: also auto-imports emailed Assemblers production workbooks and the Bentonville weekly through the existing parsers, and back-fills parked PO emails when their NetSuite PO loads. See `docs/RUNBOOK.md` §9 and ADR-021/022/023.
| # | Task | Est | Notes |
|---|------|-----|-------|
| 10.1 | Gmail OAuth + refresh-token storage | 3h | Google Cloud Console project, OAuth client, systems@ grants consent. Tokens in Supabase Vault next to ANTHROPIC_API_KEY. |
| 10.2 | Edge Function: poll Gmail + thread classification | 5h | Cron-scheduled. Per thread: identify retailer/PO/topic; attach to `po_emails` and link to `purchase_orders` by extracted PO number. |
| 10.3 | Edge Function: structured extraction | 8h | Per thread: dates, costs, carrier, BOL, FG lot numbers. Writes to `po_emails.extracted_data`, `po_lot_numbers`, `po_changes`. |
| 10.4 | Swap PO-detail AI Insight card from stub → live extraction | 1h | Same component, reads `extracted_data` + recent agent runs rather than deriving from PO state. |
| 10.5 | Auto-capture supplier confirmations → update pending orders | 4h | Extracted ship-date / cost / BOL → update matching `raw_material_orders` or PO. Audit-logged. |

### Day 11 (Phase 1 ship blocker): Lot Traceability chain UI — ✅ DELIVERED
The tables hold the full traceability chain — raw_material_lots → production_subcomponents.raw_lot_code → production_runs.fg_lot_code → production_pallets → lot_shipments → po_lot_numbers — but nothing in the UI surfaced it. Recall scenarios + cost rollup + FIFO discipline all need this view to be useful, so it was a Phase 1 ship blocker. Built as `src/pages/LotTrace.jsx` (route `/trace`) + `src/hooks/useLotTrace.js`; nav item added; "Trace ↗" deep-links wired from Delivery & Lots and Reference FIFO.
| # | Task | Est | Notes |
|---|------|-----|-------|
| 11.1 | ✅ `/trace` page: enter any lot code, render full chain both directions | 5h | Backward from FG lot → raw lots that fed the batch (subcomponents joined to raw_material_lots). Forward → pallets, shipments, and the PO it arrived against (po_lot_numbers). Direction inferred from which table the code is found in; chain anchored on FG lot codes so raw / FG / outbound entry points all resolve. |
| 11.2 | ✅ "Trace this lot" deep-link from Delivery & Lots and Reference > Raw Materials FIFO table | 1h | Each lot row gets a `Trace ↗` link → `/trace?lot=<code>`. (PO-detail's lots live in the Delivery & Lots card, so it's covered there.) |
| 11.3 | ✅ Reconcile production_subcomponents.raw_lot_code text against raw_material_lots.lot_number | 3h | Handled in the join layer: `useLotTrace` pulls each table once and joins in memory on a normalised key (`normLot` = trim + uppercase + drop whitespace) so the trace doesn't drop rows on format drift. Promote to a FK in a later migration if volume demands it. |
| 11.4 | ✅ Recall report — "every PO/customer touching raw lot X" | 2h | On-page recall panel listing every distinct PO/retailer/destination reachable from the queried lot, with "Copy as CSV". |

---

## PHASE 2 — Operations (~40 hrs, weeks 3–6)

| # | Task | Est | Deps |
|---|------|-----|------|
| P2.0 | **QBO CSV integration** — adopt the existing parser, reconcile against David's first export, surface in `/payments` reconciliation | 2h once file lands | L14 (David conversation) |
| P2.1 | Honeymoon validation (Marc compares forecasts to actuals) | Ongoing | 2–3 weeks |
| P2.2 | Activate reorder Confirm — PDF generation | 3h | |
| P2.3 | Pending refills in inventory (italic → confirmed on email) | 4h | Day 10 agent live |
| P2.4 | Production plan surface (allocate runs against POs) | 8h | |
| P2.5 | QBO API connection (replace CSV) | 6h | P2.0 reconciled, QBO API creds |
| P2.9 | Forecasting foundation — historical velocity model | 4h | |

---

## PHASE 3 — Financials + Rollout (~35 hrs, weeks 6–9)

| # | Task | Est | Deps |
|---|------|-----|------|
| P3.1 | Margin per PO (revenue – cost from QBO) | 4h | QBO API |
| P3.2 | Cash on hand from QBO | 2h | |
| P3.3 | Chargeback tracking linked to POs | 3h | |
| P3.4 | EOM Snapshot auto-generation with real financials | 3h | |
| P3.5 | Trend views (revenue/month, chargebacks, fill rate) | 5h | |
| P3.6 | Committed revenue forecast (30/60/90d) | 4h | |
| P3.7 | Slack integration — notify owners on assignments/changes | 6h | |
| P3.8 | Raw material spend tracking from order history | 3h | |
| P3.9 | Bug fixes + UX refinement | 4h | |
| P3.10 | Scope e-commerce/corporate rollout | Planning | |

---

## Done (Design Phase)
- [x] Architecture designed + scoping locked (David + Marc)
- [x] Cortina meeting — NetSuite confirmed as data source
- [x] Field list sent to Harshita for NetSuite
- [x] systems@dirtycookie.com access confirmed
- [x] Full navigable prototype approved by Shahira
- [x] Real PO data integrated (PO14326, PO14331, PO14371, PO14400)
- [x] Real WK15 Retail Link data from Bentonville Merchants
- [x] Assemblers inventory report analyzed (389 rows → 28 items)
- [x] Kroger scope discovered and integrated (retailer filter)
- [x] EOS structure designed (Scorecard, Rocks, To-Dos, Issues)
- [x] Distributor/brand structure designed (St Charles, Dawn)
- [x] Audit log + role-based pricing changes designed
- [x] Shrink/expired reconciliation designed
- [x] Transition timeline designed (WCCB 12ct → 8ct)
- [x] AI agent architecture scoped
- [x] QBO analysis completed
- [x] Reorder calculator with honeymoon designed
