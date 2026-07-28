# Claude Code — Task Breakdown

Ordered, small, reversible tasks. Each is a commit on a feature branch. **Never build on `main`.** Read `EXTENSION_BUILD_PLAN.md` and `DATA_MODEL_ADDITIONS.md` first; reconcile every assumption against the real repo before writing code.

---

## Task 0 — Discovery (no code changes)
```
git checkout -b feat/product-spine-cookulator
```
Read and report back to Caroline BEFORE proceeding:
1. Read `docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md`, `.claude/instructions.md`, `README.md`.
2. Read `supabase/migrations/20260521000000_initial_schema.sql` — identify the **finished-goods table** (real name + columns).
3. Grep `src/` for every reference to that table (hooks, pages, parsers). Produce a **dependency map**: which modules read/write it.
4. Confirm: RLS pattern, migration naming, page/hook structure, whether an addresses table exists, whether `/reference` item-master is separate from finished-goods.
5. Write findings to `docs/DECISIONS.md` as ADR-0xx. **Stop. Report to Caroline. Await go.**

---

## Phase 1 — Product spine (Spec Sheet) — ✅ Completed July 15, 2026 (ADR-025)

### Task 1.1 — Product spine migration
Write migration `*_create_product_spine.sql`: `products`, `eaches`, `inners`, `master_cases`, `stuffings` per `DATA_MODEL_ADDITIONS.md`, with RLS matching existing role patterns. **No derived columns** (no stored storage/temp/net-weight). Apply via SQL editor; confirm.

### Task 1.2 — Price list view
Write migration `*_price_list_view.sql`: thin `product_prices` table + `price_list` VIEW joining master cases → composition → prices. Prices null = TBD.

### Task 1.3 — Seed from Cookulator prototype
Reseed product data from the prototype reference (`prototype/` or the provided `cookulator_prototype.html` data). Include `sample_eligible` seeds (the 8 baked cookies already flagged).

### Task 1.4 — Re-point modules (ONE per commit, test each)
For each module in the Task 0 dependency map that referenced finished-goods, update its hook/query to the new `products` spine. Commit + verify the module still renders after each. Order: least-critical first.

### Task 1.5 — Drop finished-goods
Only after 1.4 verified: migration `*_drop_finished_goods.sql`. Confirm nothing references it (grep clean).

### Task 1.6 — Spec Sheet UI
Build `src/pages` for the Cookulator tabs (WIP/Cookies/Eaches/Inner/Master/Price Lists) per the prototype. Read-only default + edit-mode lock. Sample-eligibility toggle visible only in edit mode. Level-grouped column choosers over the price_list view.

### Task 1.7 — ADR
Record "Finished-goods replaced by Cookulator product model" in `docs/DECISIONS.md`. Open PR. **Caroline reviews before merge.**

---

## Phase 2 — Sample Central — ✅ Completed July 16, 2026 (ADR-026)
Branch: `feat/sample-central` (off updated `main` after Phase 1 merges).

### Task 2.1 — Tables migration
`*_sample_central_tables.sql`: `addresses` (if none exists), `shipments`, `shipment_items`, `sample_templates`. Salesperson by user id; items by product code; custom fields (`custom`, `custom_spec`, `project_no`) on shipment_items.

### Task 2.2 — User dropdown flag
`*_user_active_in_dropdown.sql`: add `active_in_dropdown` to users/`user_profiles`. Confirm `email` present.

### Task 2.3 — Catalog page
Sample Central catalog reading `products WHERE sample_eligible = true`, grouped Prep→Tier→Size, UOM "1 cookie · EA", full descriptions.

### Task 2.4 — Shipment builder
Salesperson + account first; address book w/ inline add; derived-temp badge + deprioritized override; required-by + rush *(as-built; the brief said shipping speed — ADR-031)*; collateral checklist incl. Warming instructions; custom request lines with project #.

### Task 2.5 — Mission control
Pending shipments list, stat tiles, salesperson filter, status pipeline, custom-item badges + project #.

### Task 2.6 — Quick start
Saved assortment templates (user-manageable) + duplicate-past-shipment (filtered to salesperson).

### Task 2.7 — Waffle switcher + role gate
App switcher between Spec Sheet and Sample Central. Role-aware per existing auth: Cortina role sees only Sample Central; internal sees both. **Confirm role model from Task 0.**

### Task 2.8 — ADR + PR. Caroline reviews before merge.

---

## Phase 3 — ShipStation via Custom Store (see SHIPSTATION_INTEGRATION.md + ADR-028) — ✅ Built July 27, 2026 (ADR-029); refined July 28 (ADR-030→033)

> ⚠️ **The task descriptions below are the original brief and are partly SUPERSEDED.**
> They are kept as a record of what was asked, not of what exists. For the
> as-built state and the current next steps, read **`docs/SAMPLE_CENTRAL_STATUS.md`**.
> Headline reversals: the 3-tier shipping-speed selector (3.2b/3.2c) was replaced
> by a `rush` flag and no `ShippingMethod` is sent (ADR-031); `box_spec` was
> dropped (ADR-031); status is read-only (ADR-032).
Branch: `feat/shipstation`. **Custom Store pattern** — NOT the V1 order-push (superseded, ADR-027) and NOT the V2 Sales Orders API (beta, not sandbox-testable).

### Task 3.1 — Custom Store contract + ADR ✅ (done in planning)
ADR-028 records the Custom Store decision (GET export + POST shipnotify, Basic Auth, XML schema, field mapping, status/service mapping, known limitations). Retains ADR-027's tag vocabulary re-expressed: cold-chain = product tag on Raw SKUs (+ a ShipStation automation → next-day reco); **shipping_speed** = a 3-tier selector (Ground/2-Day/Overnight) → UPS `serviceCode` in `ShippingMethod` (mapped 1:1; `rush` **retired**, and the interim `requested_service` friendly-label dropdown superseded — see the ADR-028 amendment); box = CustomField1; custom-request = CustomField2; CustomField3 free. Caroline coordinates the co-man tag/rule ratification. (The sandbox store was later abandoned — not testable for what mattered; see ADR-029.)

### Task 3.2 — Writeback + service migration
`*_sample_shipment_tracking.sql`: add nullable `tracking_number`, `carrier`, `service`, `shipped_at` to `sample_shipments` (the shipnotify landing columns); add `requested_service text NOT NULL DEFAULT 'ups_ground'` and **drop** the retired `rush` column. Forward-only, manual apply.

### Task 3.2b — Sample builder: shipping-speed selector
`SampleCentral.jsx`: replace the **Rush checkbox** (builder) + **Rush badge** (mission control) with a **3-tier shipping-speed dropdown** — Ground (default) · 2-Day · Overnight; the tier is stored in `shipping_speed` and mission control shows the tier (expedited tiers highlighted). Update initial/reset state + insert payload. Salesperson picks a *speed*, never a carrier — carrier lives in app config (`SHIPPING_CARRIER` / `SHIPPING_SPEEDS` in `src/utils/sampleCentral.js`).
*(Superseded step: the interim six-service friendly-label dropdown storing `requested_service` — dropped by migration `20260727120000`.)*

### Task 3.2c — Shipping-speed migration
`*_sample_shipment_shipping_speed.sql`: add `shipping_speed text NOT NULL DEFAULT 'ground'` with a CHECK on `ground|2day|overnight`; backfill from `requested_service`; **drop** `requested_service`. Forward-only, manual apply.

### Task 3.3 — `shipstation-customstore` Edge Function
One module, two actions by `action` query param. `action=export` (GET): query `sample_shipments` + items + address for the `start_date`/`end_date` window, emit Custom Store **Orders XML** per the mapping (paging via `page`/`pages`; CDATA free-text; validate State 2-char + PostalCode or skip+log). `action=shipnotify` (POST): parse `ShipNotice`, update the matching `sample_shipments` (tracking/carrier/service/shipped_at, status→shipped); unmatched OrderNumber → log, don't drop. Basic Auth via Vault (`SHIPSTATION_CUSTOMSTORE_USER`/`_PASS`, `get_secret`); reject non-match 401. Mirror `gmail-*` conventions (Deno, injected client). Pure helpers live in `_shared/shipstation.ts` and are unit-tested in `_shared/shipstation_test.ts` (`deno test`) — the suite is now 87 cases covering auth, dates, field mapping, order XML and ShipNotice parsing.

### Task 3.4 — Account-side config doc ✅ (done in planning)
`docs/SHIPSTATION_SETUP_CHECKLIST.md`: connect Custom Store (endpoint URL + Basic Auth → Vault), status mapping, **launch-blocking** shipping-service mapping (serviceCode 1:1) + automation rules (incl. cold-chain → next-day), cold-chain product tags (co-man), box packages, packing-slip token, email BCC, mapping test via manual import (no label needed), plus test-mode guidance for the internal stress test (§8b) and the go-live cleanup (§9).

### Task 3.5 — Verify, then flip to production. ADR + PR. ✅ (as-built ADR-029)
Verified end-to-end against the live account: a test order imported into ShipStation's **Awaiting Shipment** queue with fields mapped, and a `shipnotify` POST wrote tracking back + advanced `status → shipped`. As-built recorded in **ADR-029** (incl. the XSD corrections: `<Country>US</Country>` + `<OrderTotal>` are required, status exported verbatim, PostgREST `table!fk` embeds). **Current state and next steps: `docs/SAMPLE_CENTRAL_STATUS.md`** — that file is authoritative; this one is history. In brief, as of Jul 28 2026: schema/function/frontend all deployed and verified, rush notification rule built, test mode live. Remaining blockers are §3 automation rules and §4 cold-chain tags (the latter now genuinely blocking, since the catalog opened to Raw products). `delivered` and `processing` are **unreachable** — the Custom Store has no such events (ADR-033).

---

## Standing rules for every task
- Branch, never `main`. One logical change per commit.
- Match existing conventions (migrations, RLS, hooks, pages, ADRs).
- No stored derived values — grep to confirm before each PR.
- Reference by code/id, never display string.
- After each phase: PR, Caroline reviews, then merge.
- Any deviation from these docs → record an ADR explaining why.
