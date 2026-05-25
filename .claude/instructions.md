# Cookie Central — Claude Code Instructions

## What this project is
Cookie Central is an operational dashboard for Dirty Cookie's white-label retail business. It tracks purchase orders, inventory, payments, and weekly performance across Walmart and Kroger, flowing through Cortina Foods (the EDI conduit and financier).

## Prototype
The approved UI prototype is at `prototype/CookieCentral_Complete.jsx`. This is the build spec — every module, layout, data structure, and interaction in the prototype should be replicated in the real app. The prototype uses demo data; the real app connects to Supabase.

## Stack
- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Supabase (Postgres + Auth + Edge Functions + Storage)
- **Database:** Supabase Postgres, managed via CLI migrations
- **Hosting:** Vercel
- **Auth:** Supabase magic link (email-based, no passwords)
- **Design:** Dirty Cookie brand — pink/magenta palette. See prototype for exact colors.

## Supabase + GitHub Integration
- Supabase is connected to this GitHub repo
- Migrations live in `supabase/migrations/` and auto-deploy on push to main
- Use `npx supabase migration new <name>` for new schema changes
- Use `npx supabase db push` to deploy migrations
- Initial schema is in `supabase/migrations/20260521000000_initial_schema.sql`
- NEVER edit migrations that have been pushed — create new ones instead

## Key architecture rules
1. **Read-mostly app.** Most data enters via uploads (CSV) or API ingestion. The primary write-backs are: reorder confirmations, inventory adjustments, and manual order entry.
2. **Supabase RLS required.** Every table needs row-level security. Roles: admin, finance, ops.
3. **Audit log.** Every mutation logs to the `audit_log` table: user, timestamp, table, record_id, action, old_value, new_value.
4. **Pricing changes require confirmation.** Any edit to cost, COG, or revenue fields must show a confirmation dialog and requires finance or admin role.
5. **UOM conversion is global.** A context provider handles unit-of-measure conversion (Cases, CU, Cookies, Pallets) using the subcategory conversion table.
6. **Retailer filter is global.** Product Orders and Payments filter by retailer (All / Walmart / Kroger). Inventory is retailer-agnostic.
7. **Raw materials have multiple distributors/brands.** Each ingredient can have multiple rows in `raw_material_suppliers`, each with its own distributor, brand, cost, MOQ, and lead time. Marc selects distributor + brand when reordering.

## Database
- Full schema at `supabase/migrations/20260521000000_initial_schema.sql`
- Data model docs at `docs/DATA_MODEL.md`
- 20 tables total with RLS policies, indexes, and updated_at triggers

Key tables:
- `purchase_orders`, `po_line_items`, `shipments` — order tracking
- `invoices`, `payments` — payment reconciliation
- `dot_inventory` — DOT Foods finished goods (pipeline)
- `raw_materials`, `raw_material_suppliers`, `raw_material_orders`, `raw_material_lots` — full ingredient lifecycle
- `bill_of_materials` — links products to ingredients
- `inventory_adjustments` — shrink, expired, damaged reconciliation
- `weekly_reports` — auto-generated from broker email
- `audit_log` — all changes tracked
- `upload_log` — CSV upload history
- `transitions` — product lifecycle changes (SKU swaps, spec changes)

## File naming conventions
- Components: PascalCase (e.g., `ProductOrders.jsx`, `InventoryWarehouse.jsx`)
- Pages: PascalCase matching sidebar nav (e.g., `WeeklyReport.jsx`, `Payments.jsx`)
- Utils: camelCase (e.g., `uomConverter.js`, `csvParser.js`)
- Hooks: camelCase with `use` prefix (e.g., `useRetailerFilter.js`)
- Supabase functions: snake_case (e.g., `parse_netsuite_export`)

## When building
- Check `docs/BUILD_PLAN.md` for current task and priority
- Reference `docs/ARCHITECTURE.md` for data flow decisions
- Reference `docs/DATA_MODEL.md` for table schemas
- Reference `prototype/CookieCentral_Complete.jsx` for UI spec
- Log decisions in `docs/DECISIONS.md`
- Create new migrations (never edit pushed ones): `npx supabase migration new <name>`

## Org chart
- Shahira Marei — CEO/Founder — admin/finance role
- Marc Bouthillette — COO — ops role (primary daily user)
- David Landeck — Biz Exec — finance role
- Paul — Biz Exec — finance role
- Maria Restrepo — Ops — ops role
- Caroline Friedrich — Builder/Admin — admin role
