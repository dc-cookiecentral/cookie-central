# Cookie Central — Extension Build Plan: Spec Sheet + Sample Central

**Purpose:** Add two modules to the existing live Cookie Central app (React + Vite + Tailwind + Supabase + Vercel):
1. **Spec Sheet** (the Cookulator) — the product/BOM engine. **Replaces the current finished-goods table** as the product spine.
2. **Sample Central** — the Cortina sample-ordering module, with the ShipStation push.

**Context:** This is an *extension of an existing app*, not a greenfield build. The repo already has 20+ tables, RLS, triggers, 10 live modules, forward-only manual migrations, an ADR discipline, and `.claude/instructions.md`. These modules must follow those conventions, not invent new ones.

**Data reality:** Existing data is mostly demo/disposable → the finished-goods swap is a **clean schema replacement + reseed**, not a data migration. No production records to preserve.

---

## ⚠️ CLAUDE CODE: verify these against the real repo before building

This plan is written without direct access to the repo internals. Every item below is an **assumption to confirm first**. Read the actual files and reconcile before writing code.

| # | Assumption in this plan | Verify by reading | If wrong |
|---|---|---|---|
| V1 | The finished-goods table exists and is the product spine | `docs/DATA_MODEL.md`, `supabase/migrations/20260521000000_initial_schema.sql` | Adapt table/column names throughout |
| V2 | `/orders`, `/inventory`, `/trace`, `/reference` reference finished-goods via FK | grep `src/` for the FG table name; check `po_line_items`, `dot_inventory`, `lot_shipments`, `production_runs` | Expand the "modules to update" list |
| V3 | `/reference` "Walmart item master" is separate from FG (retail SKUs, not the product spine) | `src/pages` reference page + its hook | May merge item-master into product model |
| V4 | RLS uses role-based policies (admin/ops/finance) via `user_profiles` | existing migrations' RLS blocks | Match whatever pattern exists |
| V5 | Addresses / customer model exists that Sample Central can reuse | `docs/DATA_MODEL.md` | Create addresses table if none |
| V6 | Migration naming = `YYYYMMDDHHMMSS_description.sql`, applied manually via SQL editor | `README.md` Migrations section | Match actual convention |
| V7 | Pages are one-file-per-route in `src/pages`, data via `src/hooks` | `src/` tree | Match actual structure |

**Rule: if reality differs from an assumption, follow reality and note the deviation in `docs/DECISIONS.md` as a new ADR.**

---

## Guardrails (from the senior review — enforce everywhere)

1. **Compute derived values, never store them.** Storage/temp (from prep), case net weight (from composition), shipment temp (from line items), and the entire price list are **database views or query-time computations** — never stored columns. Storing them = silent drift.
2. **Tag-based ShipStation rules, never raw-SKU rules.** SKU criteria break on multi-item orders. See `SHIPSTATION_INTEGRATION.md`.
3. **Reference by code/id, never by display string.** Line items, template items, composition refs are all foreign keys.
4. **Match the existing app's conventions** — migrations, RLS, ADRs, page/hook structure. Don't invent parallel patterns.

---

## Phasing (branch-first, one module at a time)

**Git safety:** Every phase is a branch off `main`. `main` keeps serving the live site. Merge only after review. Never build on `main`.

### Phase 0 — Discovery & safety (Claude Code, ~30 min, no schema changes)
- Confirm all V1–V7 above; write findings to `docs/DECISIONS.md`.
- **Map everything that references the finished-goods table** (the critical grep — data is demo, but the *code references* are real).
- Confirm branch created: `git checkout -b feat/product-spine-cookulator`.
- **Output:** a short reconciliation note to Caroline before any code. Stop and confirm.

### Phase 1 — Product spine (Spec Sheet / Cookulator) — replaces finished-goods
See `DATA_MODEL_ADDITIONS.md` for the schema. In order:
1. New migration: create `products` + `eaches` + `inners` + `master_cases` + `stuffings` tables (the Cookulator model), with RLS matching existing patterns.
2. New migration: create the **price list VIEW** (not a table) + a thin `product_prices` table holding only the (TBD) prices.
3. Reseed from the Cookulator prototype data (`prototype/` reference).
4. **Re-point the modules that referenced finished-goods** (from Phase 0 map) to the new `products` spine — one module, one commit, test each.
5. Drop the old finished-goods table **last**, once nothing references it.
6. Build the Spec Sheet UI pages in `src/pages` (read-only default + edit-mode lock), matching the prototype.
7. ADR in `docs/DECISIONS.md`: "Finished-goods replaced by Cookulator product model."

### Phase 2 — Sample Central
Depends on Phase 1 (reads `products.sample_eligible`). See `DATA_MODEL_ADDITIONS.md`.
1. Migration: `shipments` + `shipment_items` + `sample_templates` + `addresses` (if V5 shows none exists). Salesperson stored by **user id**; items reference product by **code**.
2. Migration: add `sample_eligible` (bool) + `ingredients` + `nutrition` to `products` if not added in Phase 1.
3. Migration: add `active_in_dropdown` (bool) to the users/`user_profiles` table (see Build Notes — controls salesperson dropdown; email pulled for confirmations).
4. Build Sample Central pages: catalog (Prep→Tier→Size, reads `sample_eligible`), shipment builder, mission control, address book.
5. Wire the waffle app-switcher between Spec Sheet and Sample Central (role-aware — see V4).

### Phase 3 — ShipStation integration (last; sandbox planned, later abandoned — see ADR-029)
See `SHIPSTATION_INTEGRATION.md` in full.
1. Supabase Edge Function for the order push (keys server-side, never client).
2. Tag vocabulary + product-tag/order-tag strategy locked with co-man first.
3. Webhook receiver (Edge Function) for status back → updates `shipments.status`.
4. ShipStation-side config documented for Caroline to set: box mapping (packages + rules), CC of `samplesmngmt@cortinafoods.com` (Blind Copy + order-confirmation recipient), packing-slip token for collateral/warming instructions.

---

## Definition of done per module
- Migrations apply cleanly in filename order via SQL editor.
- RLS matches existing role patterns; no table left world-readable by accident.
- Derived values are views/computed — grep confirms no stored `storage`, `net_weight`, `temp`, or price-list columns.
- Existing modules that referenced finished-goods still work against the new spine.
- New pages match the prototype and the app's existing look/interaction.
- An ADR recorded for each significant decision.
- Nothing merged to `main` until Caroline reviews the branch.

---

## What NOT to do (keep it simple)
- Don't preserve the demo finished-goods data — reseed clean.
- Don't build custom auth — extend the existing Supabase Auth + role model.
- Don't start Phase 2/3 channel integrations (QBO, e-comm) — out of scope.
- Don't duplicate ShipStation logic app-side — app pushes tags, ShipStation resolves fulfillment.
- Don't store any derived value. (Yes, this is listed three times. That's intentional.)
