# Cookie Central — Architecture Decisions

## ADR-001: White label scope only (Phase 1-3)
**Date:** May 2026
**Decision:** Cookie Central tracks white-label retail POs only. E-commerce and corporate sales are post-Phase 3.
**Rationale:** White label is the critical operational need. E-comm/corporate have different fulfillment patterns.

## ADR-002: Read-mostly app with selective write-backs
**Date:** May 2026
**Decision:** Cookie Central is primarily a visibility tool. Write-backs limited to: reorder confirmations, inventory adjustments, manual order entry.
**Rationale:** Production orders to Assemblers go via email/PDF (Marc's existing workflow). Cookie Central generates the document; Marc sends it.

## ADR-003: Multi-retailer with filter (not retailer-specific)
**Date:** May 20, 2026
**Decision:** Show all retailers (Walmart + Kroger) in one dashboard with a retailer filter. Not separate apps or views.
**Rationale:** Inventory, production, and raw materials are shared across retailers. Separating would create blind spots. Discovered when Kroger POs (PO14371, PO14400) appeared in the same Cortina/NetSuite pipeline.

## ADR-004: "Cortina" not "National"
**Date:** May 20, 2026
**Decision:** Use "Cortina" exclusively in all UI, docs, and code. Never "National" or "National Food Trading."
**Rationale:** Consistency. The entity name is Cortina Foods.

## ADR-005: Reorder calculator with honeymoon period
**Date:** May 2026
**Decision:** Reorder tab visible from Phase 1 in preview mode. Active (Confirm enabled) only after 2-3 weeks of Marc validating forecasts against actual orders.
**Rationale:** Build trust in the data before Marc depends on it. Preview mode lets Marc compare suggestions to what he's actually ordering via email.

## ADR-006: Raw materials have multiple distributors/brands
**Date:** May 20, 2026
**Decision:** Each ingredient can have multiple rows in raw_material_suppliers, one per distributor/brand combination. Each has its own cost, MOQ, and lead time.
**Rationale:** St Charles and Dawn carry different brands of the same ingredient at different prices. Marc needs to see options when reordering. Future forecasting will compare suppliers.

## ADR-007: Audit log on all mutations, pricing requires Finance role
**Date:** May 20, 2026
**Decision:** Every data change logs to audit_log. Pricing edits (COG, revenue, cost_per_unit) require finance or admin role and a confirmation dialog.
**Rationale:** Shahira meeting requirement. Prevents accidental pricing changes and provides accountability.

## ADR-008: EOS integration in Weekly Report
**Date:** May 2026
**Decision:** Weekly Report structures data for Level 10 meetings: Scorecard (fixed metrics), Rocks (placeholder until quarterly planning), To-Dos (7-day commitments from IDS), Issues List (auto-populated from alerts).
**Rationale:** Company transitioning to EOS. Cookie Central should support the L10 workflow, not create a parallel one.

## ADR-009: Weekly Report from Bentonville Merchants email
**Date:** May 2026
**Decision:** Weekly ops summary auto-generated from blayn@bentonvillemerchants.com email. Subject: "Dirty Cookie | Weekly Reporting | WK##". Scheduled Monday 9:30 AM CT. Manual "Check for new" button. Archive by week.
**Rationale:** This is the existing data source for Walmart Retail Link performance. Kroger reporting source TBD.

## ADR-010: Slack notifications in Phase 3
**Date:** May 20, 2026
**Decision:** Phase 3 adds Slack integration. Owners assigned to Findings, To-Dos, and Issues receive automatic notifications. Tied to login credentials.
**Rationale:** Approved by Shahira. Deferred to Phase 3 to prioritize core functionality first.

## ADR-011: Payment terms are per-retailer
**Date:** May 20, 2026
**Decision:** Payment terms stored per PO. Walmart: Net 30/60 (Cortina pays DC at 30d, Walmart pays Cortina at 60d). Kroger: Due on receipt. Payment timeline UI adapts labels per retailer.
**Rationale:** Discovered from Kroger PO PDFs showing "Due on receipt" vs Walmart's established 30/60 terms.

## ADR-012: DOT is retailer-agnostic
**Date:** May 2026
**Decision:** DOT Foods inventory view does not filter by retailer. DOT is a redistributor — product flows through to whichever retailer DC it's allocated to. The subtitle says "Redistributor" not "Pipeline to Walmart."
**Rationale:** Same WCCB inventory at DOT serves both Walmart and Kroger POs.

## ADR-013: Shrink/expired product reconciliation
**Date:** May 20, 2026
**Decision:** Inventory adjustment capability with reason codes (shrink, expired, damaged, disposed, other). Logged to audit trail. Feeds into EOM Snapshot as a line item.
**Rationale:** Marc needs to write down inventory when product is lost or expires. Currently tracked informally.

## ADR-015: Assemblers report parser — column mapping
**Date:** May 26, 2026
**Decision:** Parse the Assemblers "Inventory Snapshot Report" (.xlsx) by reading ALL sheets and merging — the export splits items across two sheets with identical headers (Sheet1 holds 3 codes, incl. the Kroger finished-goods SKUs, missing from the main sheet). 384 pallet-level rows aggregate to 28 items by `Item code`. Category is derived from `Item type` (FINISHED → finished_good) and base UOM (RAW + `ea` → packaging for Trays/Films/Master-cases; RAW + `lb` → raw_material). Expired quantity comes from the explicit `Inventory status = Expired` value, not inferred from dates; dates only drive `almost_expired` (≤60 days).
**Rationale:** Validated against the real 2026-05-06 export. `Item type` has no PACKAGING value, so packaging is distinguished by `ea` UOM. `Inventory status` is authoritative for expiry. `Regulatory Hold` / `Inventory Freeze` are quality holds (65k units in the sample) with no schema field yet — surfaced in the upload summary; a `held_quantity` column on `raw_materials` is a candidate follow-up if hold stock must be excluded from availability.

## ADR-016: XLSX upload support (lazy-loaded SheetJS)
**Date:** May 26, 2026
**Decision:** The upload pipeline accepts `.xlsx`/`.xls` (Assemblers) in addition to CSV (DOT/QBO). `parseFile()` dispatches on extension; SheetJS (`xlsx`) is dynamically imported only when an Excel file is uploaded, keeping the ~330 KB lib out of the initial bundle (separate `xlsx-*.js` chunk).
**Rationale:** The real Assemblers export is Excel with multiple sheets. CSV-only would force a manual export step. Lazy-loading avoids penalizing the common case.

## ADR-014: Supabase connected to GitHub
**Date:** May 20, 2026
**Decision:** Supabase project linked to the cookie-central GitHub repo. Database migrations managed through `supabase/migrations/` with sequential numbering. Initial schema is `001_initial_schema.sql`. All subsequent changes are new migration files, never editing applied migrations.
**Rationale:** Version-controlled schema changes, team visibility, rollback capability.
**Update (June 2026):** GitHub auto-deploy is currently off; migrations are applied manually by pasting each file's contents into the Supabase SQL editor in filename order. The naming convention + forward-only discipline still hold; only the apply mechanism changed.

## ADR-017: Single Assemblers upload card (one workbook, all sheets)
**Date:** June 1, 2026
**Decision:** The Assemblers upload section on `/uploads` is one card pointing at the Production parser. That parser dispatches per sheet — Production / Reject / Shipment / Job <id> sheets into the 5 production_* + lot_shipments tables, and the Inventory sheet through the original assemblers.js parser/importer into raw_materials + raw_material_lots. Outbound + BOL planned cards removed (Outbound is the Shipment sheet; raw-ingredient landing is the Inventory → Reorder → Landing flow).
**Rationale:** Reconciled against the real Assemblers export: one workbook covers everything they send. Four separate cards implied separate files. Inventory delegation reuses the validated assemblers.js logic without duplicating it.

## ADR-018: Password sign-in fallback for the demo + SMTP outages
**Date:** June 1, 2026
**Decision:** The login form supports both Supabase magic link (default) and password (fallback). Password users are pre-provisioned in the Supabase dashboard with **Auto-confirm** ticked.
**Rationale:** Supabase's default SMTP throttles to ~3 emails/hour. The demo and early launch onboarding can't depend on a deliverable magic link. Password is opt-in per user and doesn't degrade security — gotrue still bcrypt-hashes server-side and the role check still routes through `user_profiles`.

## ADR-019: Demo seed data lives in supabase/seeds/, not migrations/
**Date:** June 1, 2026
**Decision:** One-time demo data (e.g. 7 prototype POs + line items + emails + payment events) lives in `supabase/seeds/` and is applied manually. It is **not** a migration. Idempotent via ON CONFLICT + NOT EXISTS so re-runs are safe.
**Rationale:** Migrations are forward-only schema definitions. Mixing seed data into migrations would force the demo POs into every environment forever; sometimes you want a clean slate. The separate path makes it obvious what's removable.
**Update (June 2026):** the demo seed (`supabase/seeds/demo_purchase_orders.sql`) has been **removed** now that real Cortina POs are uploaded (via the PO PDF parser). The `supabase/seeds/` path stays documented here as the pattern for any future one-time seed data.

## ADR-020: systems@dirtycookie.com is the canonical admin sign-in
**Date:** June 1, 2026
**Decision:** Caroline (builder) accesses Cookie Central through `systems@dirtycookie.com` rather than her personal email. The systems account is seeded as admin via `user_role_seeds`; Shahira / David / Paul are each seeded as their own admin account.
**Rationale:** `systems@` is already the operational email — POs, BOLs, AI agent ingestion all converge there. Building it into the auth surface concentrates admin actions on the account that's actually monitored, and reduces the maintenance surface (one canonical session, not two).

## ADR-021: Gmail AI email agent — Edge Functions, 6 classes, advisory extraction
**Date:** June 2, 2026
**Decision:** Phase 2 connects `systems@dirtycookie.com` (Gmail OAuth, `gmail.readonly`) to three Supabase Edge Functions — `gmail-oauth-callback`, `gmail-poll`, `gmail-extract`. Poll = an on-demand "Check for new" button on `/uploads` **plus** a once-daily `pg_cron` job. Every message is classified by Haiku 4.5 into one of six classes — **PO, BOL, supplier_confirmation, assemblers_report, weekly_report, other** — then acted on:
- **PO / BOL / supplier_confirmation** → Sonnet 4.6 structured extraction (forced tool-use) → `po_emails` + `po_lot_numbers` + **advisory** `po_changes` (`change_source='email'`). Extraction does **not** mutate `purchase_orders` columns.
- **assemblers_report / weekly_report** → the email's attachment/body runs through the **existing** `production.js` / `weeklyEmail.js` parsers (client dependency-injected so they run under Deno), writing the same tables a manual `/uploads` drop would, tagged `upload_log.source='email'`.

Secrets live in **Vault**; Edge Functions read/write them via two `SECURITY DEFINER` RPCs (`get_secret`/`set_secret`, service-role only) since the `vault` schema isn't exposed to PostgREST. The OAuth refresh token is written back to Vault as `GMAIL_REFRESH_TOKEN`.

**Rationale:** The schema was built for this (`po_emails.extracted_data`, `po_lot_numbers.source='email'` + `extracted_from_email_id`, `po_changes.change_source='email'`, `weekly_reports.auto_generated`), and `weeklyEmail.js` was explicitly written dependency-free "for the future server-side connect." **Advisory** extraction (no direct PO writes) keeps AI-derived values reviewable in the existing Original-vs-Current / Delivery & Lots UI and avoids double-logging against the `track_po_changes` trigger (which stamps `change_source='internal'`). **Reusing** the production/weekly parsers instead of reimplementing them means email auto-import and manual upload stay byte-for-byte identical — the only difference is the trigger (an email vs. Marc's drag-drop) and the `source` tag. Haiku-classify / Sonnet-extract balances cost (classify runs on every email) against fidelity (extract runs only on the three structured classes), within the ~$50/mo Anthropic cap (RUNBOOK §8.1).

## ADR-022: Parked email extractions back-fill when their PO loads
**Date:** June 2, 2026
**Decision:** The agent matches PO/BOL emails to `purchase_orders` by `po_number`. When an email arrives before NetSuite has loaded that PO, it's stored **parked** — `po_emails.po_id` (and `po_lot_numbers.po_id`) null, `po_number` preserved in `extracted_data`. A `SECURITY DEFINER` RPC `link_parked_po_emails(po_id, po_number)` attaches parked emails + their lots to a PO; the NetSuite parser (`netsuite.js importRecords`) calls it for every PO it upserts, so parked rows auto-link the moment their PO lands.
**Rationale:** The email agent and NetSuite load are independent feeds with no ordering guarantee, so parking + back-fill avoids dropping data either way. SECURITY DEFINER keeps the linker out of broad table-level UPDATE policies — the browser parser invokes it, but it can only link null→matching-PO by `po_number`, never mutate already-linked rows. Lots are persisted up front with `po_id` null (rather than discarded when unmatched) specifically so the same RPC can back-fill them via `extracted_from_email_id`. Out of scope: advisory `po_changes` aren't back-filled (they need a PO to diff against, which didn't exist when parked).

## ADR-023: /weekly renders from the weekly_reports table, not the static seed
**Date:** June 2, 2026
**Decision:** The Weekly Report page reads from the `weekly_reports` table (via `useWeeklyReports`), merged with the legacy static seed (`src/data/weeklyReports.js`) — DB rows win per week, seed fills weeks the DB lacks, sorted newest-first. The newest week is selected by default.
**Rationale:** The page originally rendered only from the hardcoded seed (WK13–16), so agent-written rows (e.g. WK17, `auto_generated=true`) never appeared. Merging keeps the curated historical seed (which carries attachment `detail` the table doesn't capture yet) while surfacing every live agent-ingested week. No `auto_generated` filter — auto and manual weeks render identically (auto shows an "Auto from email" badge).

## ADR-024: Finished-goods (`products`) replaced by the Cookulator product model
**Date:** July 14, 2026
**Status:** Accepted (Task 0 discovery). Records the reconciliation for the Spec Sheet / Sample Central extension; Phase 1 schema work proceeds on branch `feat/spec-sheet-and-sample-central` after this ADR.

**Context — the "finished-goods table":** There is no table named `finished_goods`. The finished-goods spine is the existing **`products`** table (`20260521000000_initial_schema.sql`), later extended with `cortina_item_number` (`20260602170000`/`20260615130000`), `aliases text[]` + GIN index (`20260617140000`), and interim Cortina→internal→display name mapping (`20260617130000`). Two *separate* artifacts represent finished goods today:
1. **DB `products` table — 4 rows**, keyed by Cortina/Walmart SKU strings: `WMWHTCHCCHPCOOKIESTUFCBDC` (WCCB, cortina# 1252), `WMPBCOOKIESTUFGRPJLYDC` (PBG, 1251), `WMCHOCCHPCOOKIESTUFCHOCDC` (CCF, 1287, alias `C-F-S`), `C-WCCB-12-13-KF` (WCCB-KF, Kroger). This is the FK target of `po_line_items`, `dot_inventory`, `bill_of_materials`.
2. **Static `src/data/itemMaster.js` — 2 rows** (`679640563` DC WHITE CHOC CKE, `679640564` DC PB COOKIE), the `/reference` → "Finished Goods" display seed only. A JS constant; nothing FK-references it. (These Walmart *item numbers* are what "delete 679640563/564" referred to — they live here, not in the DB `products` rows.)

**Naming collision:** The extension plan introduces a *new* table also named `products` — but semantically different: the **cookie atom / BOM base** (`code` PK, flavor/tier/form/prep/dough_oz/`sample_eligible`). The existing `products` is the **sellable retail SKU**, which in the Cookulator model corresponds to **`master_cases`**, not the new atom `products`. The two cannot coexist under one name.

**Decision:**
1. Existing finished-goods data is **demo/disposable** — replace, do not migrate. **Clean-delete** the 4 DB `products` rows and remove the static `itemMaster.js` seed; rebuild from the Cookulator prototype.
2. Build the full Cookulator spine per `DATA_MODEL_ADDITIONS.md`: `products` (cookie atom), `eaches`, `inners`, `master_cases`, `stuffings`, plus a thin `product_prices` table and a `price_list` **VIEW** (no stored derived values).
3. **`/orders` and `/payments` re-point is owned by Caroline**, not this workstream — she wires those sections to the Cookulator products once the Cookulator is built. Task 1.4 re-point scope here is therefore limited to the two live display joins (`useDotInventory.js:18`, `useRawMaterialDetail.js:28`) and the `/reference` `ProductsView` static seed.
4. FK columns on `po_line_items.product_id` and `dot_inventory.product_id` are **unpopulated** (parsers key off text SKU / `cortina_item_number`), so the delete cascades to **no real dependent rows**. Old `products` is dropped **last**, after re-point is verified (`*_drop_finished_goods.sql`).

**Dependency map (what references DB `products`):**
| Reference | Location | Kind | Populated? |
|---|---|---|---|
| `dot_inventory.product_id` → products(id) | schema FK | FK column | No — `dot.js` writes `sku` text only |
| `po_line_items.product_id` → products(id) | schema FK | FK column | No — netsuite/cortinaPO/walmartOrders use text SKU / `cortina_item_number` |
| `bill_of_materials.product_id` → products(id) | schema FK | FK column | BOM link (seed status unconfirmed) |
| `dot_inventory → products(short_name, full_name)` | `useDotInventory.js:18` | embedded join | join null (product_id unset); UI falls back to `d.sku` (`WarehouseView.jsx:97`, `ProductView.jsx:293`) |
| `bill_of_materials → products(sku, short_name, full_name)` | `useRawMaterialDetail.js:28` | embedded join | — |
| name / alias display | `usePurchaseOrders.js`, `walmartOrders.js`, `Pill.jsx`, `csvParser.js` | `short_name`/`aliases`/`cortina_item_number` | live |
| `/reference` "Finished Goods" | `Reference.jsx` `ProductsView` | reads static `itemMaster.js`, **not** the DB table | live (static) |

**Not coupled:** `/trace`, `production_runs`/`_pallets`/`_subcomponents`, `lot_shipments` key off `item_code`/`fg_item_code` **text** — no `products` FK.

**V1–V7 reconciliation:**
- V1 ✅ FG table = `products` (maps to new `master_cases`, not the new atom `products`).
- V2 ⚠️ FK columns exist but are unpopulated; `/trace`, production, `lot_shipments` are **not** FK-coupled.
- V3 ✅ `/reference` item-master is a separate static seed (`itemMaster.js`).
- V4 ✅ RLS role-based via `user_profiles` (`admin`/`finance`/`ops`); read `USING(true)`, writes gated by role EXISTS-check. **No `Cortina` role exists** — Task 2.7 must add it.
- V5 ✅ **No `addresses` table** — Sample Central must create it.
- V6 ✅ Migrations `YYYYMMDDHHMMSS_*.sql`, manual SQL-editor apply, forward-only (latest `20260618120000`).
- V7 ✅ One-file-per-route `src/pages`, data via `src/hooks`; no waffle switcher / `active_in_dropdown` / `sample_eligible` yet.

**Open items carried forward:** (a) add a `Cortina` role for Task 2.7's role gate; (b) create `addresses` in Phase 2; (c) decide the fate of `itemMaster.js` + `ProductsView` (repoint to `master_cases` view or retire); (d) confirm `bill_of_materials` seed rows before dropping old `products`.

**Rationale:** The data is demo, so a clean schema replacement + reseed is simpler and lower-risk than an in-place FK migration — and the FKs are unpopulated anyway. Modeling the cookie atom as `products` (per the plan) with `master_cases` as the sellable unit matches the Cookulator's real composition hierarchy; the old flat `products`-as-retail-SKU conflated two levels. Caroline owning the `/orders`+`/payments` re-point keeps the finance-critical surfaces under her control while this workstream focuses on the product spine and Sample Central.

## ADR-025: Phase 1 built — Cookulator product spine + Spec Sheet UI (as-built)
**Date:** July 15, 2026
**Status:** Accepted. Implements ADR-024. Branch `feat/spec-sheet-and-sample-central`; migrations applied manually by Caroline in filename order before the UI renders live.

**What shipped (Phase 1, Tasks 1.1–1.6):**
- **Product spine** (`20260714120000_create_product_spine.sql`): `products` (cookie atom), `eaches`, `inners`, `master_cases`, `stuffings`. RLS mirrors the existing pattern — all authenticated read; **admin/ops** write.
- **WIP/dough layer** (`20260715140000_wip_dough_layer.sql`): `raw_doughs` + `wip_doughs`. ADR-024 flagged this layer as optional; it was **added** so the Spec Sheet's WIP tab is table-backed at the "full parity" bar Caroline set. `products.tier`/`form` are also stored, but the Cookies tab **inherits** Form/Tier from the dough (matching the prototype), falling back to the stored columns.
- **Pricing** (`20260715120000_price_list_view.sql`): thin `product_prices` table (only stored pricing, `list_price` NULL = TBD, **finance/admin** write) + a `price_list` **VIEW** (`security_invoker`) resolving the polymorphic composition chain via guarded LEFT JOINs.
- **Seed** (`supabase/seeds/product_spine_cookulator.sql`, per ADR-019): 5 raw doughs, 13 WIP doughs, 27 cookies (1 duplicate code deduped), 5 stuffings, 3 eaches, 4 inners, 15 master cases; **8 cookies** flagged `sample_eligible`. tier/form derived from `wip_dough` at seed time.
- **Legacy drop** (`20260715130000_drop_finished_goods.sql`): dropped `products_legacy` + the three dead, unpopulated FK columns (`po_line_items`/`dot_inventory`/`bill_of_materials`.`product_id`).
- **UI** (`/spec-sheet`): all 6 Cookulator tabs, read-only default + edit-mode lock (role-gated), reusable `SpecTable` (sort/filter/level-grouped column chooser), config-driven add/edit/delete modal, sample-eligibility chip/toggle, Price Lists over the `price_list` view.

**Key implementation decisions (deviations from / refinements to ADR-024 + `DATA_MODEL_ADDITIONS.md`):**
1. **`cases_per_pallet` is stored**, not derived. `DATA_MODEL_ADDITIONS` lists it as a `master_cases` column and flags **only** net weight as derived for master cases. The view/app fall back to `ti × hi` when it's unset.
2. **Only master-case net weight + storage are derived** (never stored): net weight rolls down to cookie `dough_oz` (÷16 for lb), storage from `prep` (Raw→Frozen, else Ambient, `storage_override` wins). Computed both in `price_list` and in `utils/cookulator.js`.
3. **WIP/dough layer promoted to real tables** (see above) — a scope addition beyond the ADR-024 "5-table spine," justified by the full-parity requirement.
4. **Re-point = removal, not FK rewrite.** The only live code refs to the old table were two null-returning embeds (`useDotInventory`, `useRawMaterialDetail`), removed in Task 1.4. The DB FK columns were dead/unpopulated and dropped with the table. There was nothing meaningful to "re-point" at the FK level.
5. **DTC shipping boxes deferred** to the e-commerce phase (out of scope per `EXTENSION_BUILD_PLAN` "what NOT to do").

**Carried forward:** (a) migrations are **not yet applied** — Caroline applies them manually in filename order, then the seed, then verifies; (b) `/orders`+`/payments` catalog linkage to the new spine is Caroline's (dead `product_id` columns dropped — she adds correct `master_cases`/`eaches` linkage when wiring); (c) Caroline authorized purging **all non-Cookulator data** (Cookulator = master data) — to be executed as a separate, discrete cleanup step; (d) Phase 2 (Sample Central) still needs a `Cortina` role + `addresses` table (ADR-024 open items).

**Rationale:** Keeping every level table-backed (including WIP) makes the whole Cookulator data-driven and consistent with the rest of the app, and lets Sample Central read `products.sample_eligible` directly. Deriving net weight/storage in a view keeps the "no stored derived values" rule intact while the UI still renders them live. Storing `cases_per_pallet` follows the authoring doc rather than over-applying the derived rule to a figure real pallets can deviate on.

## ADR-026: Phase 2 built — Sample Central (as-built)
**Date:** July 16, 2026
**Status:** Accepted. Branch `feat/sample-central` (stacked on `feat/spec-sheet-and-sample-central` since Phase 1 isn't merged yet; its PR will show only the Phase 2 diff once Phase 1 lands). Migrations applied manually.

**What shipped (Phase 2, Tasks 2.1–2.7):**
- **Tables** (`20260715160000_sample_central_tables.sql`): `addresses`, `sample_shipments`, `sample_shipment_items`, `sample_templates`. Salesperson stored by user id; items reference `products` by **code** (custom lines carry null `product_code` + `custom_spec` + `project_no`). `sample_shipments.shipstation_order_id` is present for the Phase 3 push.
- **Dropdown flag** (`20260715170000_user_active_in_dropdown.sql`): `user_profiles.active_in_dropdown` (default true).
- **Cortina role** (`20260715180000_cortina_role.sql`): added to the `user_profiles` + `user_role_seeds` role CHECK.
- **UI** (`/sample-central`): catalog (Prep→Tier→Size over `sample_eligible`), shipment builder (derived-temp badge + override, collateral incl. Warming instructions, custom lines w/ project #, inline address add), mission control (stat tiles, salesperson filter, status pipeline), quick start (templates + duplicate-past-shipment). Waffle **AppSwitcher** + **role gate**.

**Key decisions / deviations:**
1. **`sample_shipments` / `sample_shipment_items`**, not `shipments` / `shipment_items` (`DATA_MODEL_ADDITIONS` names): a PO-level `shipments` table already exists (the `/orders` domain). Same collision-avoidance pattern as products→master_cases (ADR-024).
2. **Role gate is app-side + DB-side.** App: `InternalOnly` route wrapper redirects Cortina to `/sample-central`, and the Sidebar/AppSwitcher hide internal apps for that role. DB: sample-table RLS names `admin/finance/ops/cortina`; the `cortina` role value is added by `20260715180000`. Sample-table policies **forward-declared** `cortina` (harmless before the role exists) to avoid re-editing them.
3. **Derived `temp` is stored as a snapshot.** Cold if any Raw/frozen line, else Ambient; `temp_override` wins. This is a historical fact of the shipment (not a live product attribute), so storing the decision is correct — consistent with the "no stored *derived-from-live-data*" rule.
4. **ShipStation / DTC deferred to Phase 3** (`shipstation_order_id` column stubbed now; the push/webhook Edge Functions are Phase 3).

**Carried forward:** (a) migrations applied manually — apply `20260715160000` → `170000` → `180000` (order-independent among these three) after Phase 1; (b) to onboard a Cortina user, seed them in `user_role_seeds` with `role='cortina'` before first sign-in; (c) Phase 3 wires ShipStation (order push + status webhook) per `SHIPSTATION_INTEGRATION.md`.

**Rationale:** Sample Central sits directly on the Phase 1 spine (`products.sample_eligible`), so no duplicate catalog. Storing salesperson by id keeps history stable across dropdown changes; referencing products by code keeps line items durable. The role gate is enforced in both the router and RLS so a Cortina user can neither navigate to nor write outside Sample Central.

## ADR-027: ShipStation tag contract (Phase 3, Task 3.1)
**Date:** July 16, 2026
**Status:** **Superseded (mechanism) by ADR-028.** The V1 order-push mechanism is dropped; the **tag/collateral/custom-item vocabulary** below is retained and re-expressed in Custom Store fields (CustomFields + ShippingMethod + product tags). Read ADR-028 for the live design.

**Boundary:** the app pushes *intent* (a clean order + tags); ShipStation resolves *fulfillment* (box, service, labels, emails). No fulfillment logic is duplicated app-side.

**The tag vocabulary (this IS the integration — both sides must agree):**
| Tag | Meaning | Set by | ShipStation rule it drives |
|---|---|---|---|
| `cold-chain` | needs refrigerated handling | **product tag** on Raw SKUs (co-man tags the product record once) | order includes cold-chain → refrigerated service + insulated box |
| `rush` | expedite | **order tag** pushed by app when `sample_shipments.rush` | next-day service + priority alert |
| `custom-box` | branded packaging | **order tag** pushed by app when `box_spec = 'Custom / Branded'` | branded mailer package |
| `dc-box` | standard box | **order tag** pushed by app when `box_spec = 'Dirty Cookie'` | standard package |
| `custom-request` | contains a bespoke no-SKU item | **order tag** pushed by app when any line has `custom = true` | route to manual review (no auto-fulfill) |

**Split rule:** product-inherent attributes (cold chain) = **ShipStation product tags** (co-man-owned); order-level choices (rush, box, custom) = **order tags the app pushes**.

**Two-step indirection (the critical pitfall):** ShipStation's *Item SKU* automation criteria silently ignore any multi-item order — and sample manifests are almost always multi-item. So we NEVER rule on raw SKU. Instead: (1) the co-man tags each Raw **product record** with `cold-chain` once; ShipStation auto-applies it to any order containing that product on import; (2) automation rules run against the **order tag** `cold-chain`.

**SKU→tag map:** every product with `prep = 'Raw'` gets the `cold-chain` product tag in ShipStation. (Today the 8 `sample_eligible` cookies are all Baked, so none carry it yet — the map still must be defined for when raw samples are enabled. `sample_shipment_items.product_code` is the SKU pushed; it must match the co-man's stock exactly.)

**Gotchas locked into the design (webhook/edit discipline):** no "order update" webhook (edits after push must be re-pushed deliberately); rules run once on import (edits to Awaiting-Shipment orders don't re-trigger); immutable once shipped/cancelled. Collateral (incl. Warming instructions) rides an order **Notes** field (not a Custom Field — 100-char truncation), printed via a packing-slip Field-Replacement token. Custom items ride as a note + `project_no` + the `custom-request` tag; never as a SKU line.

**What Caroline coordinates before code:** (a) duplicate/sandbox ShipStation store; (b) ratify this vocabulary + SKU→tag map with the co-man and have them apply the `cold-chain` product tags; (c) load V1 API keys into Vault via `set_secret` (`SHIPSTATION_API_KEY`, `SHIPSTATION_API_SECRET` — V1/V2 keys are not interchangeable; order-create maturity is V1). Server-side only — never `VITE_*`.

**Rationale:** The tag vocabulary is the contract surface between two systems; fixing it first (and in an ADR) prevents the classic multi-item-SKU-rule failure and keeps the app/ShipStation split clean. `sample_shipments` already carries `box_spec`, `rush`, `collateral`, and `shipstation_order_id`, so the push maps straight from existing columns.

## ADR-028: ShipStation integration via Custom Store pattern (supersedes ADR-027 mechanism)
**Date:** July 16, 2026
**Status:** Accepted. Branch `feat/shipstation`. Supersedes ADR-027's V1 order-push mechanism; **retains** ADR-027's tag vocabulary + collateral/custom-item rules, re-expressed in Custom Store fields.

**Decision.** Integrate the Sample Site with ShipStation using ShipStation's **Custom Store** connection — **not** the V1 order-push API and **not** the V2 Sales Orders API (beta, not sandbox-testable). The Sample Site exposes one Web Endpoint (a Supabase Edge Function, `shipstation-customstore`) that ShipStation connects to as a Custom Store. ShipStation **GET**s sample orders (imported into Dirty Cookie's dashboard for the co-man to fulfil) and **POST**s `shipnotify` back with carrier + tracking number when shipped.

**Flow (3 steps).** (1) Cortina places a sample order in the Sample Site → row in `sample_shipments` (+ items). (2) ShipStation's scheduled/manual store import GETs our export XML; the order lands in Dirty Cookie's ShipStation dashboard where the co-man (a user in Dirty Cookie's one account) views it, prints the pack list, picks dimensions, and ships. (3) ShipStation POSTs `shipnotify` with tracking → we update the shipment and advance the pipeline.

**Rationale.** Matches our exact 3-step flow; mature/documented/non-beta; the intended pattern for a custom order source with no pre-built integration. One ShipStation account (Dirty Cookie's); the co-man is a user in it.

**Auth / contract.** ShipStation calls our endpoint with **Basic HTTP Auth** (creds in Vault: `SHIPSTATION_CUSTOMSTORE_USER` / `SHIPSTATION_CUSTOMSTORE_PASS`, read via the `get_secret` RPC per ADR-021; a non-matching Basic Auth → 401). Our endpoint emits/validates ShipStation's **Custom Store XML** (Orders export on GET `action=export`; `ShipNotice` on POST `action=shipnotify`). Status mapping is configured in the Custom Store connection UI; **Paid = ready-to-ship = what the co-man works**.

**Tag/collateral carry-over from ADR-027, re-expressed (confirmed field assignment):**
- **cold-chain** — still the "any Raw line ⇒ whole order cold" rule, achieved via the **ShipStation product tag** on Raw SKUs (co-man applies it once; ShipStation auto-applies to any order containing that product on import — the ADR-027 two-step indirection). **The app does not push cold-chain.** A ShipStation **automation** keys on the cold-chain tag to apply refrigerated handling + insulated box **and bump the order to a next-day service recommendation** — so speed for cold orders is decided in ShipStation, never by the app. (`sample_shipments.temp` remains the app-side snapshot; it rides `InternalNotes` as informational only.)
- **requested service (supersedes `rush`)** — the Sample Site presents a **curated dropdown of real ShipStation services** (display name shown, `serviceCode` stored in `sample_shipments.requested_service`; salesperson picks per order, default **UPS Ground**). The export sends that `serviceCode` as **`<ShippingMethod>`**, which the Custom Store's shipping-service mapping resolves **1:1** — no free-text, no reverse-mapping. The old `rush` boolean is **retired**: speed is now either the service the salesperson picks or the cold-chain automation above. Curated launch set: `ups_ground`, `ups_next_day_air`, `fedex_ground`, `fedex_priority_overnight`, `usps_priority_mail`, `usps_priority_mail_express` (source: `docs/Shipstation Shipping Doc/API Service Codes- CarrierCode_08-22.xlsx`, US domestic — this is the serviceCode source-of-truth).
- **box** — **`CustomField1`** = `dc-box` | `custom-box` (from `box_spec`).
- **custom-request** — **`CustomField2`** = `custom-request` when any line has `custom = true`. Kept on a **CustomField** (not notes-only) so it's **Orders-grid-visible and rule-matchable**; the bespoke item's `custom_spec` + `project_no` are additionally detailed in `InternalNotes`.
- **`CustomField3`** — free/unused (reserved).
- **collateral** (incl. Warming instructions) + `notes` + `required_by` + handling snapshot → **`InternalNotes`** (1000-char limit; use it, not the 100-char CustomFields, for lists).

**Field mapping** is in `docs/SHIPSTATION_INTEGRATION.md` (reconciled against the real `sample_shipments` / `sample_shipment_items` / `addresses` columns — ADR-026 names). `Country` is exported as **`US`** — ShipStation's `ShipTo` schema **requires** it and rejects the whole batch if it's missing (samples are US-only). `UnitPrice` = `0.00` (samples unpriced). `OrderDate` = `created_at`.

**Schema addition (one migration).** The `shipnotify` writeback needs landing columns that don't exist yet: `sample_shipments` gains nullable `tracking_number`, `carrier`, `service`, `shipped_at`. The requested-service dropdown adds `requested_service text` (a ShipStation `serviceCode`; default `ups_ground`), **replacing** the `rush` boolean (dropped — superseded by service selection + the cold-chain automation). Forward-only migration, manual apply. `shipstation_order_id` (added for the superseded V1 push) is **unused** under Custom Store — orders key on `OrderNumber` = `shipment_no`.

**Status mapping.** The export emits the app's **own status verbatim** (samples are free — no "paid" token). ShipStation's Marketplace status mapping routes it: `submitted`/`processing` → **Awaiting Shipment** (the co-man's work queue), `shipped`/`delivered` → **Shipped**. So ShipStation "Awaiting Shipment Statuses" = `submitted, processing`; "Shipment Statuses" = `shipped, delivered`. ShipStation has no "delivered" bucket.

**Known limitations (recorded deliberately):**
1. **No import acknowledgment.** The Custom Store is a **pull** model — the app cannot confirm an order actually reached ShipStation. The only signal is ShipStation hitting our GET export; there is no per-order ack. (A future enhancement could reconcile via ShipStation's order list.)
2. **`delivered` is not wired.** The pipeline effectively ends at **shipped** — ShipStation's shipnotify covers shipment, not delivery, and we do no carrier delivery-event polling yet.
3. **Automation rules are launch-blocking.** The rush→handling and cold-chain→refrigerated behaviours depend on ShipStation **automation rules + the method-mapping** existing *before* the first real order. They're documented as launch-blocking in `SHIPSTATION_SETUP_CHECKLIST.md`.
4. **Silent import rejection.** ShipStation may silently reject an order with a malformed `State` (must be 2-char) or `PostalCode`; the pull model surfaces no error. The export **validates** these and skips+logs a bad row rather than poisoning the batch.
5. **Unmatched shipnotify is logged, not dropped.** If a `shipnotify` `OrderNumber` doesn't match a `shipment_no`, the function logs it and returns 200-with-warning rather than silently discarding the tracking update.

**Superseded:** ADR-027's `/orders/createorder` V1 push, its V1 key requirement, and any V1/V2 key or Sales Orders API path.
