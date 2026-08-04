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
| ~~`rush`~~ | ~~expedite~~ | **Retired** — speed is no longer a tag. See ADR-028: the salesperson picks a 3-tier shipping speed, which the export sends as a UPS `serviceCode` in the dedicated `<ShippingMethod>` element. No tag, no automation rule. | — |
| `custom-box` | branded packaging | **order tag** pushed by app when `box_spec = 'Custom / Branded'` | branded mailer package |
| `dc-box` | standard box | **order tag** pushed by app when `box_spec = 'Dirty Cookie'` | standard package |
| `custom-request` | contains a bespoke no-SKU item | **order tag** pushed by app when any line has `custom = true` | route to manual review (no auto-fulfill) |

**Split rule:** product-inherent attributes (cold chain) = **ShipStation product tags** (co-man-owned); order-level choices (box, custom) = **order tags the app pushes**. Shipping **speed** is neither — it has a native XML element (`<ShippingMethod>`), so it never became a tag (ADR-028).

**Two-step indirection (the critical pitfall):** ShipStation's *Item SKU* automation criteria silently ignore any multi-item order — and sample manifests are almost always multi-item. So we NEVER rule on raw SKU. Instead: (1) the co-man tags each Raw **product record** with `cold-chain` once; ShipStation auto-applies it to any order containing that product on import; (2) automation rules run against the **order tag** `cold-chain`.

**SKU→tag map:** every product with `prep = 'Raw'` gets the `cold-chain` product tag in ShipStation. (Today the 8 `sample_eligible` cookies are all Baked, so none carry it yet — the map still must be defined for when raw samples are enabled. `sample_shipment_items.product_code` is the SKU pushed; it must match the co-man's stock exactly.)

**Gotchas locked into the design (webhook/edit discipline):** no "order update" webhook (edits after push must be re-pushed deliberately); rules run once on import (edits to Awaiting-Shipment orders don't re-trigger); immutable once shipped/cancelled. Collateral (incl. Warming instructions) rides an order **Notes** field (not a Custom Field — 100-char truncation), printed via a packing-slip Field-Replacement token. Custom items ride as a note + `project_no` + the `custom-request` tag; never as a SKU line.

**What Caroline coordinates before code:** (a) duplicate/sandbox ShipStation store; (b) ratify this vocabulary + SKU→tag map with the co-man and have them apply the `cold-chain` product tags; (c) load V1 API keys into Vault via `set_secret` (`SHIPSTATION_API_KEY`, `SHIPSTATION_API_SECRET` — V1/V2 keys are not interchangeable; order-create maturity is V1). Server-side only — never `VITE_*`.

**Rationale:** The tag vocabulary is the contract surface between two systems; fixing it first (and in an ADR) prevents the classic multi-item-SKU-rule failure and keeps the app/ShipStation split clean. `sample_shipments` already carries `box_spec`, `collateral`, and `shipstation_order_id`, so the push maps straight from existing columns.

## ADR-028: ShipStation integration via Custom Store pattern (supersedes ADR-027 mechanism)
**Date:** July 16, 2026
**Status:** Accepted. Branch `feat/shipstation`. Supersedes ADR-027's V1 order-push mechanism; **retains** ADR-027's tag vocabulary + collateral/custom-item rules, re-expressed in Custom Store fields.

**Decision.** Integrate the Sample Site with ShipStation using ShipStation's **Custom Store** connection — **not** the V1 order-push API and **not** the V2 Sales Orders API (beta, not sandbox-testable). The Sample Site exposes one Web Endpoint (a Supabase Edge Function, `shipstation-customstore`) that ShipStation connects to as a Custom Store. ShipStation **GET**s sample orders (imported into Dirty Cookie's dashboard for the co-man to fulfil) and **POST**s `shipnotify` back with carrier + tracking number when shipped.

**Flow (3 steps).** (1) Cortina places a sample order in the Sample Site → row in `sample_shipments` (+ items). (2) ShipStation's scheduled/manual store import GETs our export XML; the order lands in Dirty Cookie's ShipStation dashboard where the co-man (a user in Dirty Cookie's one account) views it, prints the pack list, picks dimensions, and ships. (3) ShipStation POSTs `shipnotify` with tracking → we update the shipment and advance the pipeline.

**Rationale.** Matches our exact 3-step flow; mature/documented/non-beta; the intended pattern for a custom order source with no pre-built integration. One ShipStation account (Dirty Cookie's); the co-man is a user in it.

**Auth / contract.** ShipStation calls our endpoint with **Basic HTTP Auth** (creds in Vault: `SHIPSTATION_CUSTOMSTORE_USER` / `SHIPSTATION_CUSTOMSTORE_PASS`, read via the `get_secret` RPC per ADR-021; a non-matching Basic Auth → 401). Our endpoint emits/validates ShipStation's **Custom Store XML** (Orders export on GET `action=export`; `ShipNotice` on POST `action=shipnotify`). Status mapping is configured in the Custom Store connection UI; **Paid = ready-to-ship = what the co-man works**.

**Tag/collateral carry-over from ADR-027, re-expressed (confirmed field assignment):**
- **cold-chain** — still the "any Raw line ⇒ whole order cold" rule, achieved via the **ShipStation product tag** on Raw SKUs (co-man applies it once; ShipStation auto-applies to any order containing that product on import — the ADR-027 two-step indirection). **The app does not push cold-chain.** A ShipStation **automation** keys on the cold-chain tag to apply refrigerated handling + insulated box **and bump the order to a next-day service recommendation** — so speed for cold orders is decided in ShipStation, never by the app. (`sample_shipments.temp` remains the app-side snapshot; it rides `InternalNotes` as informational only.)
- **shipping speed (supersedes `rush`, and supersedes the friendly-label service dropdown)** — *amended July 27, 2026; see "Amendment: 3-tier shipping speed" below.* The Sample Site presents a **3-tier speed selector** — **Ground** (default) · **2-Day** · **Overnight** — stored as `sample_shipments.shipping_speed` (`ground` | `2day` | `overnight`). The export resolves the tier to a real UPS **`serviceCode`** and sends it as **`<ShippingMethod>`**, which the Custom Store's shipping-service mapping resolves **1:1** — no free-text, no reverse-mapping. The old `rush` boolean is **retired**: speed is now either the tier the salesperson picks or the cold-chain automation above.
- **box** — **`CustomField1`** = `dc-box` | `custom-box` (from `box_spec`).
- **custom-request** — **`CustomField2`** = `custom-request` when any line has `custom = true`. Kept on a **CustomField** (not notes-only) so it's **Orders-grid-visible and rule-matchable**; the bespoke item's `custom_spec` + `project_no` are additionally detailed in `InternalNotes`.
- **`CustomField3`** — free/unused (reserved).
- **collateral** (incl. Warming instructions) + `notes` + `required_by` + handling snapshot → **`InternalNotes`** (1000-char limit; use it, not the 100-char CustomFields, for lists).

**Field mapping** is in `docs/SHIPSTATION_INTEGRATION.md` (reconciled against the real `sample_shipments` / `sample_shipment_items` / `addresses` columns — ADR-026 names). `Country` is exported as **`US`** — ShipStation's `ShipTo` schema **requires** it and rejects the whole batch if it's missing (samples are US-only). `UnitPrice` = `0.00` (samples unpriced). `OrderDate` = `created_at`.

**Schema addition (two migrations).** The `shipnotify` writeback needs landing columns that don't exist yet: `sample_shipments` gains nullable `tracking_number`, `carrier`, `service`, `shipped_at` (migration `20260726120000`, which also dropped the retired `rush` boolean). The speed selector adds `shipping_speed text NOT NULL DEFAULT 'ground'` with a CHECK on `ground|2day|overnight` (migration `20260727120000`, which drops the interim `requested_service` column — see the amendment below). Forward-only migrations, manual apply. `shipstation_order_id` (added for the superseded V1 push) is **unused** under Custom Store — orders key on `OrderNumber` = `shipment_no`.

**Amendment (July 27, 2026): 3-tier shipping speed + direct UPS service-code mapping.**
Supersedes the interim design in which the salesperson picked from a curated six-service dropdown of **friendly labels** across three carriers (`ups_ground`, `ups_next_day_air`, `fedex_ground`, `fedex_priority_overnight`, `usps_priority_mail`, `usps_priority_mail_express`) stored in `requested_service`.

*Why it changed.* That dropdown made the salesperson choose a **carrier** as a side effect of choosing a **speed**. Carrier selection belongs to fulfilment and to app config (Dirty Cookie ships on one connected carrier), not to a per-order sales decision — and offering FedEx/USPS options that no connected carrier could actually buy was a silent-failure path. Speed is the only dimension the salesperson genuinely knows at order time, so speed is what we store.

*The mapping.* `<ShippingMethod>` carries the UPS `serviceCode` **directly** — no friendly label, no reverse-mapping:

| `shipping_speed` | UI label | `<ShippingMethod>` serviceCode |
|---|---|---|
| `ground` *(default)* | Ground | `ups_ground` |
| `2day` | 2-Day | `ups_2nd_day_air` |
| `overnight` | Overnight | `ups_next_day_air` |

`carrierCode` = **`ups`** — **confirmed July 28, 2026**: the account has **UPS and USPS** connected. USPS is deliberately unused by the tier map (speed is the salesperson's choice, carrier is not); the co-man may still buy a USPS label at fulfilment, since `ShippingMethod` is a requested service rather than a mandate. All three codes verified against `docs/Shipstation Shipping Doc/Shipping Services - 07-23.xlsx` (the serviceCode source-of-truth, US domestic).

*Carrier choice now lives in app config*, not in the schema and not in the UI: `SHIPPING_CARRIER` + the `SHIPPING_SPEEDS` map in `src/utils/sampleCentral.js`, mirrored in `supabase/functions/_shared/shipstation.ts`. Changing carrier means rewriting that map (the codes are carrier-specific), not editing per-order data.

*No CustomField is consumed* — speed uses the dedicated `<ShippingMethod>` element. CustomField assignment is unchanged: **CF1** = box, **CF2** = custom-request, **CF3** free/reserved.

**Status mapping.** The export emits the app's **own status verbatim** (samples are free — no "paid" token). ShipStation's Marketplace status mapping routes it: `submitted`/`processing` → **Awaiting Shipment** (the co-man's work queue), `shipped`/`delivered` → **Shipped**. So ShipStation "Awaiting Shipment Statuses" = `submitted, processing`; "Shipment Statuses" = `shipped, delivered`. ShipStation has no "delivered" bucket.

**Known limitations (recorded deliberately):**
1. **No import acknowledgment.** The Custom Store is a **pull** model — the app cannot confirm an order actually reached ShipStation. The only signal is ShipStation hitting our GET export; there is no per-order ack. (A future enhancement could reconcile via ShipStation's order list.)
2. **`delivered` is not wired.** The pipeline effectively ends at **shipped** — ShipStation's shipnotify covers shipment, not delivery, and we do no carrier delivery-event polling yet.
3. **Automation rules + the method-mapping are launch-blocking.** The box→package, custom-request→manual-review and cold-chain→refrigerated behaviours depend on ShipStation **automation rules** existing *before* the first real order, and speed depends on the three `serviceCode`s being mapped. They're documented as launch-blocking in `SHIPSTATION_SETUP_CHECKLIST.md`.
4. **Silent import rejection.** ShipStation may silently reject an order with a malformed `State` (must be 2-char) or `PostalCode`; the pull model surfaces no error. The export **validates** these and skips+logs a bad row rather than poisoning the batch.
5. **Unmatched shipnotify is logged, not dropped.** If a `shipnotify` `OrderNumber` doesn't match a `shipment_no`, the function logs it and returns 200-with-warning rather than silently discarding the tracking update.

**Superseded:** ADR-027's `/orders/createorder` V1 push, its V1 key requirement, and any V1/V2 key or Sales Orders API path.

## ADR-029: Phase 3 built — ShipStation Custom Store (as-built)
**Date:** July 27, 2026
**Status:** Built & **verified end-to-end** against the live ShipStation account (`support@dirtycookie.com`). Branch `feat/shipstation`. Realizes ADR-028.

**What shipped.** (3.2) migration `20260726120000` — `sample_shipments` gains `tracking_number`/`carrier`/`service`/`shipped_at` + `requested_service` (CHECK on the 6 serviceCodes, default `ups_ground`), drops `rush`. (3.2b) `SampleCentral.jsx` — Rush checkbox/badge → curated service dropdown. *(Both since superseded by the 3-tier speed selector — migration `20260727120000` + the ADR-028 amendment; `requested_service` is backfilled into `shipping_speed`, then dropped.)* (3.3) Edge Function `shipstation-customstore` — GET `action=export` (Orders XML) + POST `action=shipnotify` (tracking writeback), Basic-Auth against Vault, pure helpers in `_shared/shipstation.ts`. (3.4) `SHIPSTATION_SETUP_CHECKLIST.md`.

**Correction (July 27, 2026):** this entry originally claimed the helpers shipped with "54 unit tests". **No test file was ever committed** — `git log --all -S "Deno.test"` returns nothing, and `package.json` had no test runner. The helpers were validated manually during the build; the ADR recorded a throwaway scratch suite as a shipped artifact. A real suite (`_shared/shipstation_test.ts`, 87 `Deno.test` cases, run with `deno test`) was added alongside the 3-tier shipping-speed change — which is precisely the change that would otherwise have had nothing guarding it, since a wrong `serviceCode` produces valid-looking XML that ShipStation silently mis-maps.

**Verified.** A test order exported → imported into ShipStation's **Awaiting Shipment** queue with all fields mapped; a `shipnotify` POST wrote tracking back and advanced `status → shipped`. Both directions confirmed through ShipStation's real UI, not just curl.

**Changed from ADR-028 during build (the corrections that matter):**
1. **`<Country>US</Country>` is REQUIRED** — ADR-028 said omit it ("store default"); ShipStation's Custom Store **XSD makes it mandatory** (`StringExactly2`) and rejects the whole batch without it. Emit `US` (US-only).
2. **`<OrderTotal>` is REQUIRED** (`xs:decimal`) — emit `0.00` (samples are free). Not in the original mapping.
3. **Status is exported VERBATIM, not mapped to Paid/Shipped** — samples are free, so there is no "paid". The export sends `sample_shipments.status` as-is; ShipStation's **Marketplace status mapping** routes it (Awaiting Shipment Statuses = `submitted, processing`; Shipment Statuses = `shipped, delivered`).
4. **PostgREST embeds need the explicit `table!fk` form** (`address:addresses!address_id`, `salesperson:user_profiles!salesperson_user_id`) — the FK-column short form returned null, so ship-to came back empty and every order was silently dropped by the State/zip validation.

**Schema facts locked in (from the account's XSD).** `<Order>`/`ShipTo` are `<xs:all>` → element order is free, but required fields must all be present. Required: Order = OrderNumber/OrderDate/OrderStatus/LastModified/OrderTotal/Customer/Items; ShipTo = Name/Address1/City/PostalCode/Country (State is optional). `DateTime` = `MM/dd/yyyy HH:mm` (our output matches the XSD pattern); the export **also parses AM/PM** in the `start_date`/`end_date` window ShipStation sends. Custom lines still ride `InternalNotes` + `CustomField2`, never a null-SKU `<Item>`.

**Sandbox abandoned (July 28, 2026).** ADR-028 and the integration spec both said to build against a duplicate/sandbox store first (ShipStation's own advice). In practice most of what needed exercising — real carrier services, the connected carrier's rates, live automation behaviour — **isn't available in a sandbox store**, so it couldn't answer the questions we had. Integration work runs against the **production store**, and the safety net moved app-side: `VITE_SAMPLE_TEST_MODE=true` prefixes generated numbers as `SMP-TEST-####` and shows a banner, so internal stress-test orders are self-labelling and greppable for purge. That is a weaker guarantee than store isolation — test orders **do** reach the co-man's real queue — and it is accepted deliberately. Go-live must clear the flag and purge `SMP-TEST-%` on both sides (`SHIPSTATION_SETUP_CHECKLIST.md` §8b/§9).

**Operational as-built.** The function is deployed with **`verify_jwt = false`** (ShipStation authenticates with **Basic Auth**, not a Supabase JWT). The Custom Store URL is the **Edge Function URL** (`…supabase.co/functions/v1/shipstation-customstore`), not the app subdomain, and needs **no ShipStation V1/V2 API key** — the Basic-Auth user/pass are self-defined, stored in Vault (`SHIPSTATION_CUSTOMSTORE_USER`/`_PASS`) and entered identically in the Custom Store connection. `getSecret` retries on a transient **"JWT issued at future"** clock-skew that PostgREST occasionally throws validating the service-role token. Each export logs its requested window + match/export counts (the pull model surfaces nothing otherwise).

**Carried forward.** (a) **Launch-blocking** ShipStation config remains Caroline's to set (`SHIPSTATION_SETUP_CHECKLIST.md` §2 serviceCode 1:1 mapping — now just the **three UPS codes**, §3 automation rules incl. cold-chain→next-day, §4 cold-chain product tags) — orders import without them, but the automations don't fire. (b) ~~Confirm `carrierCode = ups`~~ — **done July 28, 2026**: UPS + USPS connected; the tier map stays all-UPS by design. (c) ~~Frontend deploy~~ — **done July 28, 2026**; migration applied, Edge Function redeployed, `main` deployed, and a submit verified against the live schema. (d) `delivered` is not wired — the pipeline ends at **shipped** (no carrier delivery polling).

## ADR-030: Sample Central adopts the prototype's shell (own chrome, 3 tabs, builder drawer)
**Date:** July 28, 2026
**Status:** Accepted. Realizes the visual design in `prototype/sample_central_prototype.html` (deployed at `samplecentral-1.vercel.app`), which had been the reference for Phase 2 but was only loosely followed by the React build.

**Decision.** Sample Central is routed **outside the shared `Layout`** and carries the prototype's own chrome instead of the app sidebar:
- **Aubergine top nav** (60px, sticky, `--aubergine` = `dk`) with the pink brand dot, `Sample Central / DIRTY COOKIE`, the waffle app-switcher, and a wide pink **Build Shipment** button carrying a cart-count badge.
- **Three tabs** — Order Samples · **Pending Shipments** · Address Book — down from five. "Mission Control" is renamed to the prototype's label.
- **The shipment builder is a slide-out drawer**, not a tab: 460px from the right, dimmed overlay, pinned Submit footer.
- **Quick Start moves into that drawer**, positioned directly below the ship-to block, as compact chips (saved assortments, save-current-cart, recent shipments to duplicate). It is **relocated, not removed** — `sample_templates` and duplicate-past-shipment both survive.
- **Type scale realigned** to the prototype's (10–13.5px component range on a 26px `h1`), replacing a 7–12px scale that had drifted much smaller.
- **Page background** is the prototype's warm cream `#FAF7F3`, applied page-locally rather than changing the global `bg` token.

**Why outside `Layout`.** The aubergine nav and the left sidebar are alternative shells, not layers — keeping both would show a sidebar *and* a purple bar, which is not the design. Routing Sample Central on its own also matches the product: the role gate (ADR-026) already sends Cortina users here and nowhere else, so a sidebar listing internal apps is noise for the people the app is built for. Internal users navigate back via the waffle, which is why `AppSwitcher` gained a `dark` variant for the trigger.

**Trade-off accepted:** internal users lose the sidebar while on this page.

**Catalog opened to the full spine (migration `20260728120000`).** Sample Central reads `products WHERE sample_eligible = true`, and only 8 of 27 rows carried the flag — all of them Baked — so the catalog's Raw band rendered empty and no cold-chain sample could be ordered. `products` already held exactly the prototype's 27 items (18 Baked + 9 Raw); only the flag differed. All 27 are now sample-eligible.

⚠️ **This makes cold-chain live.** `derivedTemp` marks any cart containing a Raw line as Cold, so a frozen shipment is now orderable. That flips checklist **§4 (cold-chain product tags) from "not blocking today" to LAUNCH-BLOCKING**: without the tags plus the §3 automation rule, a frozen sample imports as an ordinary ambient order and ships unrefrigerated — silently, since the pull model surfaces no error.

**Emoji removed** from the per-product catalog rows (the `familyEmoji` helper is deleted) and from the temp badges, per direct feedback. The prep-band storage labels (`ships frozen` / `ships ambient`) still carry theirs — they come from `groupCatalog` in the shared utils.

## ADR-031: Rush flag replaces the shipping-speed selector
**Date:** July 28, 2026
**Status:** Accepted. Supersedes the 3-tier `shipping_speed` selector (ADR-028 amendment, July 27) — one day old at the time of reversal.

**Decision.** The app no longer expresses a shipping service at all. `shipping_speed` is dropped, `<ShippingMethod>` is **omitted from the export** (the XSD marks it `minOccurs="0"`), and ShipStation owns service selection outright. In its place `sample_shipments.rush boolean` carries an **internal urgency flag**, exported as **`CustomField1`**.

**Why the reversal.** The tier only ever expressed a *preference*: the export sent it, ShipStation's method-mapping resolved it, and the co-man still chose the actual service at label purchase. The app was asking the salesperson to make a decision that bound nothing downstream — and offering a carrier-shaped choice at that. What the salesperson uniquely knows, and nobody downstream can infer, is whether an order is **urgent**. `rush` captures exactly that and nothing else.

**Rush is not speed.** A 2-day order can be urgent and an overnight one routine. `rush` is a signal to the *team* (drives a notification), not an instruction to the *carrier*. This is why re-introducing a `rush` column is not a return to the pre-ADR-028 design: the original `rush` meant "ship fast" and was correctly replaced by an explicit service; this one means "tell the team."

**Column lineage** (all forward-only, all within three days — recorded so the churn reads as intent rather than thrash):

| Migration | Change |
|---|---|
| `20260726120000` | `rush` (bool) dropped → superseded by `requested_service` |
| `20260727120000` | `requested_service` dropped → superseded by `shipping_speed` |
| `20260728130000` | `shipping_speed` + `box_spec` dropped → `rush` (bool) returns |

**`box_spec` retired** in the same migration: box choice moves to ShipStation entirely, and the field was occupying `CustomField1`, which `rush` now needs.

**Consequences.**
- Checklist **§2 (serviceCode 1:1 mapping) is no longer needed** — nothing to map, since no `ShippingMethod` is sent. One launch-blocker removed.
- The UPS/USPS carrier confirmation (ADR-029 carried item b) is moot for the app; it remains relevant to whoever buys labels.
- `SHIPPING_SPEEDS` / `SHIPPING_CARRIER` / `speedServiceCode` / `boxTag` are deleted from both `src/utils/sampleCentral.js` and `supabase/functions/_shared/shipstation.ts`.
- The checkout shows a Rush checkbox stating that selecting it emails the team.

**The notification is live (July 28, 2026).** Built as a **ShipStation automation rule** keyed on `CustomField1 = rush` — which settles the open question above: ShipStation's rule actions *can* send the email, so no app-side sender was needed and the deliberately read-only Gmail integration stays read-only. The checkout copy ("Flags the order as urgent and emails the team") is therefore accurate.

One consequence worth knowing: the email fires when ShipStation **imports** the order, not when the salesperson submits it. With a scheduled import that is a lag of up to the import interval, and ADR-027's rule-timing gotcha applies — rules run once on import, so flagging an order as rush *after* it has already imported will not re-trigger the email.

## ADR-032: Third-party shipping billing, and status ownership
**Date:** July 28, 2026
**Status:** Accepted.

**Third-party billing.** Some accounts want samples billed to *their* carrier account. The checkout gains a "Bill shipping to a third-party account" checkbox that reveals carrier / account number / account postal code, stored as `third_party_billing` + `tp_carrier` / `tp_account` / `tp_postal_code` (migration `20260728140000`).

⚠️ **Informational only.** The Custom Store XML has **no billing elements** — `billToParty` / `billToAccount` / `billToPostalCode` exist in ShipStation's REST API, not the store feed. So the export carries the details as text in **`InternalNotes`** (`BILL THIRD PARTY: FedEx acct 123456789 (zip 90210)`), which is where whoever buys the label is already looking. They must select third-party billing and key the account in **by hand**; nothing bills automatically.

**It deliberately does not consume a CustomField.** An earlier revision put it in `CustomField3` as well; that was dropped — no automation rule acts on the value, so grid visibility bought nothing, and a 100-char field is a poor home for text that only a human reads. **`CustomField3` stays free**, leaving one slot for a future rule-matchable flag. Allocation is CF1 `rush`, CF2 `custom-request`, CF3 unused.

**All three details are required together**, enforced app-side at submit and again in the export helper (which returns `''` on a partial set). A partial set is worse than none: it looks configured but cannot be billed. Enforcement is deliberately *not* a DB CHECK, so a later rule change can't invalidate historical rows.

**Status is owned by ShipStation.** The editable status dropdown is removed from Pending Shipments and `updateShipmentStatus` is deleted. `submitted` is set at creation; the `shipnotify` writeback advances it to `shipped`. Nothing in the app writes status, so there is no path for the two systems to disagree — an editable field was exactly that path.

*Consequence:* `processing` and `delivered` are now **unreachable**. Nothing sets `processing` (the Custom Store gives no import acknowledgment — ADR-028 limitation 1), and `delivered` was never wired (ADR-029). The pipeline is effectively **submitted → shipped**, and two of the four stat tiles in Pending Shipments will permanently read zero. Left in place because the four-step pipeline matches the prototype and the values remain valid in the DB CHECK; collapsing the display to the two live states is a reasonable follow-up.

**Pending Shipments detail.** Cards are now click-to-expand (prototype behaviour): status pipeline, ship-to, required-by, collateral, billing, tracking/carrier/service and ship date once shipnotify lands, full item list with custom-line project numbers, and notes.

## ADR-033: ShipNotify capture — and the limits of what ShipStation can push back
**Date:** July 28, 2026
**Status:** Accepted. Derived from the **Custom Store Development Guide** (POST Call + ShipNotify Field Definitions), reviewed in full.

**The finding that matters: the Custom Store has exactly two actions — `export` (GET) and `shipnotify` (POST).** The guide is explicit that the POST exists to "post shipment information back to your order source **when you ship orders**". There is **no delivery event and no order-status event**. Every occurrence of "deliver" in the document is a carrier name in the API-code table.

**Consequences for the status pipeline:**

| Status | Source | State |
|---|---|---|
| `submitted` | set by the app at creation | ✅ |
| `processing` | **nothing can set it** — the Custom Store gives no import acknowledgment (ADR-028 limitation 1) | ❌ unreachable |
| `shipped` | `shipnotify` on label creation | ✅ |
| `delivered` | **not in this contract** | ❌ unreachable |

So "ShipStation pushes status back" is true for exactly one transition. `delivered` requires a **different mechanism** — ShipStation's account-level **Webhooks** are a separate feature (linked from the guide but not documented in it), or carrier tracking polling. Neither is evaluated yet. This is *pending a mechanism*, not pending implementation — a distinction worth preserving on the roadmap so it isn't mistaken for nearly-done work.

**Newly captured from the ShipNotice payload** (migration `20260728150000`):
- **`label_created_at`** ← `<LabelCreateDate>`. `<ShipDate>` is **date-only** (`10/19/2019`), so `shipped_at` was silently losing time-of-day. LabelCreateDate is a full `MM/dd/yyyy HH:mm`.
- **`shipping_cost`** ← `<ShippingCost>`. Samples are unpriced by design (`UnitPrice 0.00`, `OrderTotal 0.00`), so **this is the only place the real cost of the sampling programme appears anywhere in the system.**

`parseAmount` tolerates currency symbols, thousands separators and blanks, returning `null` rather than `NaN` — a malformed cost must never poison a writeback that also carries the tracking number.

**Still unused from the payload:** `NotifyCustomer`, `NotesToCustomer`, `Recipient`, `Items`, and the `CustomField1–3` echo. None currently earn their keep.

## ADR-034: Deliver By is written to ShipStation's native field by an outbound V2 sweep (amends ADR-029)

**Date:** August 4, 2026
**Status:** Built, **not yet deployed or verified end-to-end.** Branch `feat/shipstation`.

**Decision.** The sample's deliver-by date is written to ShipStation's **native Deliver By field** via `PUT /v2/shipments/{shipment_id}`, by a **15-minute outbound sweep** (`shipstation-deliverby` + pg_cron `*/15 * * * *`). The Custom Store pull is unchanged; nothing about the XML export or the automation rules moves.

**Why a separate sweep and not the export.** The Custom Store is a *pull*: ShipStation fetches on its own schedule, and the V2 shipment row we write to **does not exist until after that import lands**. There is nothing to PUT to at submit time. The sweep closes the gap after the fact, which also makes it self-healing — it re-runs every 15 minutes and fixes anything that missed.

**This reverses a documented belief.** ADR-029 recorded the integration as needing **no ShipStation V1/V2 API key**, and prior research concluded the native Deliver By field was unreachable for Custom-Store orders — on the grounds that such orders are immutable V2 *Sales Orders* with no shipment until shipping. **That was wrong**, and it came from unverified search snippets rather than the live account. Tested against production on August 4, 2026: imported orders appear immediately as V2 shipments in `pending`, and `PUT` on `deliver_by_date` returns 200 and persists. The API-key statement in ADR-029 is now **superseded** — a V2 key is required, in Vault as `SHIPSTATION_V2_API_KEY`.

**API facts verified against the live account (all cost time to find):**
- Our `SMP-####` lives in **`shipment_number`**, *not* `order_number` — that key is absent entirely and `external_order_id` is null. It appears only in the **list** response, never the single-shipment GET, so the number→id mapping must go through the list.
- The update is a **read-modify-write**: GET the shipment, set the one field, PUT the whole object. Verified to preserve line items, `ship_to`, `internal_notes`, `service_code` and warehouse. Strip `shipment_id`/`created_at`/`modified_at`/`shipment_status` — server-owned.
- **`shipment_status` is a label-lifecycle enum, not a delivery one**: `pending`, `processing`, `label_purchased`, `on_hold`, `cancelled`. **`shipped` and `delivered` are rejected with 400.** So V2 shipment status cannot answer "has it arrived" — see *Carried forward*.
- Cancel is `PUT /v2/shipments/{id}/cancel` **with a body**; `DELETE` → 405, empty body → 411.
- `GET /v2/sales_orders` and `GET /v2/stores` do not exist (404). `GET /v2/tracking` exists but is **gated behind a billing-plan upgrade** on this account (401).
- Two UPS carriers are connected; `ups_ground` exists on **`se-1015304`** only. Pin `carrier_id` when a service is specified programmatically.

**Idempotent by comparison, not bookkeeping.** The sweep reads ShipStation's current `deliver_by_date` and skips anything already matching, so there is no local "pushed" flag to drift. Proven: a second consecutive run wrote nothing (`updated: 0, already_correct: 6`).

⚠️ **The site is the source of truth, and that has a consequence.** An earlier draft of this ADR claimed a date set by hand in the ShipStation UI would be *respected*. **That is wrong.** The first live sweep overwrote `SMP-TEST-1045`'s hand-entered `2026-07-28` because it differed from the app's value. Any manual Deliver By edit the co-man makes is reverted within 15 minutes unless the change is also made in Sample Central. That is the correct behaviour for a derived field, but it must be told to whoever works the queue — silently reverting someone's edit is worse than not supporting the edit at all.

**Naming.** The site's UI label and the ShipStation `InternalNotes` line both now read **"Deliver by"**. The database column, TypeScript field and all identifiers **remain `required_by`** — renaming them means a migration plus touching the Edge Function, shape types and insert path, for a cosmetic gain. Accepted cost: a permanent vocabulary split between code (`required_by`) and everything a human sees ("Deliver by").

**Carried forward.**
(a) **Not deployed.** Needs `npx supabase functions deploy shipstation-deliverby`, `select public.set_secret('SHIPSTATION_V2_API_KEY', …)`, then the cron migration applied last.
(b) ~~Rotate the test key~~ — **done August 4, 2026.** The plaintext test key was revoked (the old value now returns `Access denied`), a fresh key was written to Vault via `set_secret`, and the stale line was removed from `.env.local`. Nothing in the repo or the browser bundle holds a ShipStation key.
(c) ~~Unverified~~ — **VERIFIED end-to-end August 4, 2026.** Deployed, type-checks (`deno check`, which caught a real `TS7053` a runtime-only deploy would have shipped), 87-case `_shared` suite passes, and **two live sweeps ran against production**: the first updated all 6 open orders (`failed: []`), the second wrote nothing and reported all 6 already correct. Remaining gap: **nobody has confirmed the dates render in the dashboard's Deliver By column** — the API is authoritative that the field is set, but the grid is what the co-man actually sorts by.
(d) **`delivered` is still not wired**, and V2 shipment status cannot supply it (see above). The remaining routes are a ShipStation **webhook** (the webhook endpoint *is* reachable on this plan, unlike tracking) or **BCC'ing the Delivered customer-notification email** into the existing Gmail pipeline. Undecided.
(e) **`on_hold` and `cancelled` are newly observable** and currently invisible to the site — `sample_shipments.status` has no such values (CHECK allows `submitted|processing|shipped|delivered`). Reflecting them would need a migration.
(f) **`verify_jwt = true` is satisfied by the public anon key**, not only by an admin or the cron service-role bearer — so the sweep is triggerable by anyone holding the key that ships in the frontend bundle. This matches the existing `gmail-poll` posture rather than introducing a new one, and the blast radius is small (it writes only dates already in our own DB, onto orders that already match), but it is **not** a role check. Worth a `user_profiles` role guard if the endpoint ever does more.
