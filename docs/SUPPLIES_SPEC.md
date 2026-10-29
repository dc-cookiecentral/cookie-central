# SUPPLIES_SPEC — Supplies & Vendors module for Cookie Central

**Purpose:** record supplier data — every ingredient and packaging component, who sells it, at what price and terms, with the original quote/invoice PDFs attached.
**UI reference:** `supplies_module_prototype_v13.html` (approved Oct 27) — brand tokens, drill-down interaction, rolodex.
**Seed data:** dc-supplies catalogue **rev 6** (LallyPak, Green Bay, PGI, PowPack, Sterling, Anderson Advanced, SH Bakery, STS, Great River, BTE, Fresh Coast, **Batory Foods, GNT USA/Exberry, McCormick, FormTight**) + ERP item codes.

---

## Conventions to reuse (verified in repo)

- **Edit lock = Spec Sheet pattern** (`src/pages/SpecSheet.jsx`):
  `canEdit = ['admin','ops'].includes(profile?.role)` · local `editMode` · `editing = canEdit && editMode` · same 🔒/🔓 toggle button copy and styling. Edit/Add controls render only when `editing`.
- **Forms = `components/specsheet/EditModal.jsx` pattern**: config map `F[kind] = { table, key, title, fields[] }`, field types `text|number|select|bool|textarea|csv`, `optionsFrom` cross-refs, upsert on natural key (the `saveSpecRow` pattern).
- **Writes RLS-gated** (admin/ops) + **audit_log** field-level trigger, same as spine tables.
- Routing under `InternalOnly` in `App.jsx`; Sidebar `NAV` entries. Tailwind tokens (`bg-pk`, `border-lt`), Outfit, pink section headers.

---

## Phase V1 — Read-only catalogue: items → vendors → quote docs

### V1.1 Migration `supabase/migrations/*_supplies.sql`
```sql
create table vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('raw','packaging','equipment','services')),
  status text not null default 'active' check (status in ('active','closed','prospect')),
  address text, website text, phone_main text, account_number text,
  fob text, default_terms text, freight_notes text, billing_entity text, notes text
);
create table vendor_contacts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  name text not null, role text, phone_office text, phone_cell text,
  email text, is_primary boolean default false
);
create table supply_items (          -- 'Brown Sugar', 'SRP 8-CT', every ingredient + packaging component
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null check (kind in ('ingredient','packaging')),
  primary_vendor_id uuid references vendors(id),
  notes text
);
create table supply_skus (           -- brand/SKU level, where pricing attaches
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references supply_items(id) on delete cascade,
  vendor_id uuid references vendors(id),
  brand_name text,
  item_code text,                    -- ERP codes (116070, 120005…) when known
  order_unit text not null,          -- '25 lb case', '35 lb pail', 'per 1,000 pouches'
  unit_weight_lbs numeric,           -- null for packaging
  units_per_thousand boolean default false,  -- packaging priced per 1,000
  spec_note text
);
create table quotes (                -- a quote OR an invoice/PO price point
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references supply_skus(id) on delete cascade,
  vendor_id uuid not null references vendors(id),
  doc_type text not null check (doc_type in ('quote','invoice','po','verbal')),
  doc_date date, valid_until date,
  moq text, lead_time text, terms text, one_time_costs text,
  status text default 'active' check (status in ('active','expired','closed','on_po','preliminary')),
  notes text,
  doc_path text                      -- storage bucket 'supply-docs' (original PDF/email)
);
create table quote_breaks (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  qty numeric not null,              -- order quantity the price applies to
  price_per_order_qty numeric not null
);
```
- View `v_sku_pricing` derives display prices — **never stored, always computed**:
  - ingredients: `price_per_lb = price_per_order_qty / (qty × unit_weight_lbs per order unit)`
  - packaging: price per order qty and, when `units_per_thousand`, price per 1,000
- Storage bucket `supply-docs`; RLS read = internal, write = admin/ops; audit triggers on all tables.

### V1.2 Seed `supabase/seed/supplies_seed.sql`
Everything from catalogue rev 6: 11 vendors, contacts, all ingredient + packaging items with SKUs/item codes, every known quote/PO/invoice price point with breaks and dates. Original PDFs uploaded to `supply-docs` and linked via `doc_path`.

### V1.3 Supplies page `src/pages/Supplies.jsx` (+ `hooks/useSupplies.js`) — READ-ONLY
- Items list (two sections: Ingredients / Packaging; v13 layout): Item · Primary Vendor · Last Order.
- **Double-click an item** → vendor table for it, one line per SKU/vendor:
  **Vendor — Brand/SKU · item code** · Order qty/unit · **Price per order qty** · **Price per lb** (ingredients) or **per 1,000** (packaging) · dates.
- Double-click a line → terms & notes detail. If a quote/invoice exists: **📄 link opening the PDF** (signed URL from `supply-docs`) with its `doc_date` shown.
- Vendor name links to `/vendors` rolodex entry (read-only this phase); dblclick contact name → popover.
- Routes `/supplies`, `/vendors` + Sidebar entries.

**Acceptance V1:** every catalogue rev 6 record visible; Brown Sugar dblclick shows its vendors with order qty, price/order and price/lb; LallyPak pouch shows per-1,000 pricing + its quote PDF opens; dates populate from the docs.

---

## Phase V2 — Editing behind the Spec Sheet lock

### V2.1 Shared modal
Extract the config-driven modal → `src/components/shared/EditModal.jsx` (Spec Sheet migrates to it, no behavior change; smoke-test spec sheet add/edit).

### V2.2 Edit mode on Supplies + Vendors pages
- Same lock: `canEdit` (admin/ops) + 🔒/🔓 toggle; unlocked reveals `+ Add` buttons and per-row Edit/Delete.
- Modal kinds: `vendor`, `contact`, `item` (ingredient/packaging), `sku`, `quote` (incl. doc_type quote/invoice/PO, dates, MOQ, lead, terms, one-time costs, **PDF upload** to `supply-docs`), `break` (qty + price rows inside the quote form).
- **Self-population:** entering a quote/invoice auto-updates everything derived — price per order qty, price/lb or per-1,000 (computed in the view), item-level "latest price" and dates, quote-expiry status from `valid_until`. Nothing typed twice.
- Deletes soft-confirm via existing dialog hook; all writes audit-logged.

**Acceptance V2:** ops can add a new vendor, a new ingredient, and attach a new invoice PDF with breaks; the item drill-down immediately shows the new cost, $/lb, and dates without touching any other form; viewer roles see no edit controls.

---

## Phase V3 — Actual costing (COGs)

### V3a — Packaging cost per product
- BOM link: product (ERP `products`) → its packaging components (each/inner/master case → supply_items) with qty per unit.
- Roll-up: latest actual (invoice-first, else active quote) price per component × qty = **packaging cost per unit and per case, per product**.

### V3b — Ingredient cost per batch run
- Batch BOM: dough/stuffing recipes (`raw_doughs`/`wip_doughs`/`stuffings` spine) → ingredient quantities (lbs) per batch.
- Roll-up: price/lb (invoice-first) × lbs = **ingredient cost per batch and per finished unit** for each production run.
- Together V3a+V3b = COG per product per run. Source-price traceability: every costed line links back to the quote/invoice doc it came from.

---

## Sequencing & delivery
Each phase = one branch/PR (ERP deploys via GitHub integration — no CLI deploys). V1 ships the schema + seeded read-only pages; V2 adds the lock + forms; V3a/V3b each their own PR. dc-supplies static catalogue stays live until V1 reaches parity, then frozen as archive.

---

## Status log

### Done — Oct 27 2026 (pre-build session)
- [x] Prototype iterated to **v13** and approved (Oct 27 2026) — Cost Roll-up tab hidden per Caroline: *recording only, no costing yet*
- [x] Build plan written, grounded in repo conventions (SpecSheet edit lock, EditModal config pattern, saveSpecRow upserts, audit_log, routing/sidebar) (Oct 27 2026)
- [x] Plan restructured to Caroline's phase order (Oct 27 2026) — see deviations
- [x] Seed source extended: catalogue rev 5 (Batory/Novation Prima 340) and rev 6 (Exberry colorant, McCormick flavor, FormTight tray quote; Batory PO SP026 merged — duplicate caught; PO $211.20/bag vs confirmed $208.21 variance flagged) (Oct 27 2026)
- [ ] Phase V1 — **built on branch `supplies-v1` (Oct 28 2026), PR open; not yet applied/seeded** — see "V1 build notes" below
- [ ] Phase V2, V3a, V3b — not started

### V1 build notes — Oct 28 2026
**Shipped on the branch:** migration `20261028120000_supplies.sql` (6 tables, `v_sku_pricing`, private `supply-docs` bucket, RLS, audit) · seed generator `scripts/build-supplies-seed.mjs` (the rev 6 vendor data it reads and the seed it writes are local-only — see below) · `scripts/upload-supply-docs.mjs` (catalogue page scans → PDFs → bucket) · `/supplies` + `/vendors` pages, `useSupplies`, Sidebar entries · `SpecTable` gained optional `onRowDoubleClick` / `isRowSelected` (no change for Spec Sheet).

**Apply order after merge** (nothing below has run against the live project):
1. `npx supabase db push --dry-run` → expect only `20261028120000_supplies.sql` → `db push --yes`
2. Put `scripts/supplies-data.local.mjs` in place (gitignored), run `node scripts/build-supplies-seed.mjs`, then paste the generated `supabase/seeds/supplies_seed.sql` into the SQL editor (idempotent — safe to re-run)
3. `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/upload-supply-docs.mjs` (reads `../dc-supplies/index.html`; `--out <dir>` builds the PDFs locally without uploading)

**Verified locally (PGlite, Oct 28):** migration applies twice cleanly; seed loads 32 vendors · 18 contacts · 49 items (38 ingredient / 11 packaging) · 95 SKUs · 88 price points · 103 breaks; a seed re-run writes zero rows and zero audit entries. Acceptance check passes: Light Brown Sugar shows Dawn and St Charles side by side with computed $/lb; the LallyPak pouch shows $/1,000 falling across its four breaks; Batory's $/lb matches its SO. All 11 PDFs build and open. Pages were server-rendered against the seeded data and screenshotted.

**Deviations from the V1 text above, and why**
- **Seed scope: rev 6 + the Assembler ingredient sheet** (`prototype/Assembler_Ingredient_Data.csv`). Rev 6 has no Brown Sugar and none of the ERP codes the spec names (116070, 120005); both come from that sheet. So vendors number 32, not 11: 15 from rev 6 (incl. Fresh Coast as `services`) + 17 sheet distributors. Sheet rows that are the same SKU as a rev 6 record lend their ERP code only (123007 → GB master case, 123002 → GB SRP 8-CT, 121002 → Great River tray). Finished-good rows (DC Classic Frozen Dough) and blank placeholder rows are skipped; the seed header lists them.
- **The acceptance check's "Brown Sugar" is the sheet's "Light Brown Sugar".**
- **3 extra nullable columns:** `supply_skus.vendor_item_code` (Batory 101575, McCormick FG0410), `supply_skus.units_per_order_unit` (a film roll holds 3,500, which per-1,000 pricing needs) and `quotes.doc_ref` (PL 30378, SO-1758307 …).
- **Seed path is `supabase/seeds/`** (repo convention, ADR-019), not `supabase/seed/`.
- **Vendor data is not in git (exception to ADR-019).** cookie-central is a public GitHub repo, and rev 6 carries contact names, cell numbers, emails, account numbers and negotiated pricing. That data lives in the gitignored `scripts/supplies-data.local.mjs`; the generated `supplies_seed.sql` is gitignored too. Only the generator logic and the Assembler-sheet merge (already public) are committed. Keep the local file somewhere backed up.
- **Read RLS = admin/finance/ops** (excludes `cortina`, the external sales role). Spine tables had no audit trigger to copy, so supplies gets its own field-level AFTER trigger (`log_supplies_changes`) writing the `log_po_changes` audit_log shape.
- **Originals are JPEG page scans in the catalogue, not PDFs**; the upload script wraps each document's pages into one PDF. PT206 (STS) and the Great River tray have no source document in rev 6, so those quotes have no 📄 and no doc_date.
- **v13 prototype file isn't in the repo or on this machine**; the pages follow the Spec Sheet's look (SpecTable bands, pink tokens). Compare against v13 at review.

**V1.1 review changes — Oct 29 2026** (branch `supplies-v1.1`)
- **One window, two tabs.** `/supplies` has Supplies | Vendors tabs (`?tab=vendors`); `/vendors` redirects there, keeping `?vendor=`. Sidebar shows one entry, "Supplies & Vendors".
- **Drill-downs open inline.** Double-clicking an item opens its price lines directly under the item row; double-clicking a price line opens its terms/notes directly under that line (`SpecTable` gained an optional `renderRowDetail`).
- **Headline price in the items list.** New Price / lb (ingredients) and Price / 1,000 (packaging) column: the most recent PO/invoice in **black** and the best open quote in **grey** (lowest unit price at any break; excludes expired/closed quotes and closed vendors). `▸ history (N)` expands every price point, newest first. The drill-down uses the same black/grey rule.
- **Assemblers LLC → closed** (exiting as co-man, Oct 2026). Changed in the local vendor data and applied to the live row; the record stays for history and its quotes drop out of "best quote".

**V1.2 — PO pickup/delivery, freight, assumed vs actual cost — Oct 29 2026** (branch `supplies-v1.2`, migration `20261029120000_supplies_po_landed.sql`)
- **`supply_pos`** — one row per PO: picked up or delivered, packing slip #, ship/pickup date, and the freight — what we pay to bring a pickup in, or what the vendor bills on a delivered invoice (both count, Oct 29). Freight needs pickup/delivered set first (DB check). PO/invoice lines link through `quotes.po_id`.
- **Freight split by weight** (`v_po_line_cost`): a PO's freight is shared across its lines by lbs (qty × unit weight); evenly per line if no line has a weight. A vendor SO that confirms the same PO/SKU doesn't count the weight twice.
- **Ingredient vs shipping broken out:** every PO line and the item's actual cost show product $/lb (or $/1,000) + freight $/lb = landed.
- **Yellow ⚑ freight pending:** a PO with pickup/delivered not set, or freight not entered. Enter 0 when there is no freight. Seeded pending: SP026 Batory and SP029 AAI (freight to enter once the trucks are booked), SP028 McCormick (pickup/delivered and freight unknown).
- **Assumed cost** — `supply_items.assumed_cost`, typed: $/lb for ingredients, $/1,000 for packaging. This is the one hand-entered cost figure, deliberately: it is a planning assumption, not a document price, so the "never typed" rail still holds for every price that comes off a document.
- **Actual cost** (`v_item_cost`) = the latest PO/invoice line, landed (price + its freight share). Shown under the assumed cost in the items list; **red ⚑ flags at ±5% or more** ((assumed − actual) / actual).
- **Editing** behind the Spec Sheet lock (admin/ops, 🔒/🔓): set an item's assumed cost; on a PO line, Edit PO / + Link to PO (fulfillment, packing slip, ship date, freight). All writes audit-logged. First slice of Phase V2.
- **Seed now leaves app edits alone:** `supply_pos` rows are insert-only (a re-run never overwrites fulfillment/freight), `quotes.po_id` is only filled where empty, and `assumed_cost` isn't in the seed. `RETIRED_ITEMS` in the local data deletes items the seed used to create under another name.
- **Packing slip 522657 filed:** the "AAI dry ingredient (item TBD)" placeholder is AAI's MoisturLOK (item 23666) on PO SP029-2026 — moved onto Moisturlok, AAI now primary, slip uploaded to `aai/2026-10-22_ps-522657.pdf`. Fresh Coast noted as the co-man replacing Assemblers.
- Seeded POs: SP026 Batory (pickup), SP028 McCormick (not set), SP029 AAI (pickup, slip 522657, ships Nov 2), SP031 GNT (delivered, $71.66 UPS freight → Exberry landed $26.37/lb = $24.20 + $2.17). SH Bakery's Oct 22 PO has no number on file, so it isn't linked.
- **Open:** Packaging lines have no weight, so a PO mixing packaging with ingredients would put all its freight on the weighted lines.

**Data questions surfaced by the seed**
- ERP 121002 (“Tray”, Great River on the sheet) was **assumed** to be the 3.0 dough-puck tray — confirm.
- Sheet prices are undated and are seeded as `doc_type='quote'`, status `active`, ref "Assembler ingredient sheet (undated)". They read as current, but nobody has confirmed them since Jun 2026.
- Multi-vendor sheet items have no primary vendor (the sheet never picked one); the list shows "N vendors — none selected".
- Walmart CCF/WCCB/PBJ film: the sheet's $289/roll is undated; the rev 6 "no dated film quote" gap note is on those items.

### Deviations (what changed vs. the first draft, and why)
- **Oct 27 2026 — phase order flipped.** First draft had Vendors + add/update editing as Phase 1 (from "before that we need to add the capability to add and update vendors"). Caroline restructured: **V1 = read-only items→vendors→docs view, V2 = editing behind the Spec Sheet lock, V3a/V3b = actual costing** (packaging per product / ingredients per batch run). Costing moved from "parked" into explicit phases. Spec rewritten to match — V1 still carries the schema + seed, since the view needs data under it.
- **Oct 27 2026 — seed baseline moved rev 4 → rev 6.** Three new vendors + one competing quote arrived mid-session and were filed in the static catalogue; V1 seed must be built from rev 6, not rev 4.

### New tasks surfaced Oct 27 2026 (fold into V1 seed / data gaps)
- GNT USA (Exberry): named rep missing from proforma — add from email thread
- McCormick: order confirmation needed — payment terms, lead time, net weight per pail (40# assumed from item name), price check vs PO SP028-2026
- Batory: confirm who books the CPU pickup from Wilmington IL and that trucking cost is captured in landed cost; watch the 30-days-out repricing clause on future POs
- FormTight vs Great River tray decision needs a spec call (APET vs RPET) before any PO; FormTight pricing must be reconfirmed (RPET volatility clause)
- Standing gaps carried from rev 4: AAI PO pricing/terms · SH Bakery Xtra Soft qty+price · LallyPak terms in writing + flowwrap film quote (CCF runout Dec 8) · GB requotes + die charge · PGI lead time/plate · STS freight + 10K sample confirmation · Great River lead time + freight · BTE invoice + consumables list

### Standing rails for the build (so future sessions don't relearn them)
- cookie-central deploys via **GitHub integration** — never run the Vercel CLI in that folder; each phase ships as its own branch/PR
- dc-supplies deploys via CLI from `~/Projects/dirty-cookie/dc-supplies` (`npx vercel --prod`); if Vercel asks setup questions there, STOP — create new project, never accept a suggested existing one
- $/lb and per-1,000 prices are always computed, never stored/typed
