# Data Model Additions — Spec Sheet + Sample Central

**Extends the existing schema.** Table/column names below are the *intent*; Claude Code must reconcile against the real `docs/DATA_MODEL.md` and existing migrations (see EXTENSION_BUILD_PLAN V1–V7). Follow the existing app's RLS, trigger, and naming conventions.

**The one rule:** derived values are **views or computed at query time**, never stored columns.

---

## Product spine (replaces finished-goods)

### `products` — the cookie atom (BOM base)
The composition anchor. One row per cookie.
- `id` (uuid, pk)
- `code` (text, unique) — the product code used as FK everywhere (e.g. `CCH-3OZ-BAK-C`)
- `description` (text) — full description, the display name used by both modules
- `flavor`, `outer_cookie`, `stuffing` (text)
- `tier` (text: Gourmet | Classic)
- `form` (text: Stuffed | Shot)
- `prep` (text: Baked | Raw)
- `dough_oz` (numeric)
- `wip_dough` (text/fk) — links to dough (WIP) if that layer is modeled
- `allergens` (text)
- `ingredients` (text)          ← new field
- `nutrition` (text)            ← new field (panel summary or link)
- `sample_eligible` (boolean, default false)  ← **the bridge to Sample Central**
- standard audit cols to match existing tables (created_at, etc.)

> **Derived, do NOT store:** storage/temp state. It comes from `prep` (Baked→Ambient, Raw→Frozen). Compute in a view or in the app.

### `eaches` — retail consumer units (register-scanned only)
- `id`, `each_sku` (unique), `product_code` (fk→products.code)
- `each_upc`, `cookies_per_each`, `pack_type`, `net_wt`, `brand`
- `retail_price` (nullable — TBD)
- `length_in`, `width_in`, `height_in`, `gross_wt_oz`
- `sample_eligible` (boolean)

### `inners` — inner cases
- `id`, `inner_sku` (unique), `each_sku` (fk), `eaches_per_inner`, `sellable` (bool), `upc`, `gtin14`, `sample_eligible`

### `master_cases` — the sellable CPG unit
- `id`, `case_id` (unique), `name`, `status`
- `composed_of` (text: eaches | inners | cookies) + `unit_ref` (fk to the composed level's code) + `unit_qty` (int)
- `channel` (text)
- `gtin14`, `product_sku`
- manual packaging: `length_in`, `width_in`, `height_in`, `gross_wt_lb`, `cube_cuft`
- pallet: `ti`, `hi`, `cases_per_pallet`, `pallet_size`, `pallet_weight_lb`, `loading_height_in`, `shelf_life`, `country`
- `net_wt_manual` (nullable — the spec-sheet figure, kept separate from derived)
- `storage_override` (nullable — rare per-case override of the derived storage)
- `sample_eligible` (boolean)

> **Derived, do NOT store:** `master_cases` net weight. It rolls down through composition to cookie `dough_oz`. Compute it. Store only `net_wt_manual` (the human-entered sheet value) as a separate, explicitly-manual field.

### `stuffings` — filling reference (5 rows)
As per prototype. `vanilla extract` flagged NO FLEX (no substitution).

---

## Price list — a VIEW, not a table

- `product_prices` (thin table): `master_case_id` (fk), `list_price` (numeric, nullable = TBD), `channel`, effective dates if needed. **This is the only pricing data that's stored.**
- `price_list` (**VIEW**): joins `master_cases` → composition (`products`/`eaches`/`inners`) → `product_prices`. Every displayed column (units, net weight, allergens, GTIN, etc.) is pulled live. Prices render TBD where `list_price` is null.

The level-grouped column selection in the UI is a front-end concern over this view — the view exposes all columns; the page picks which to show.

---

## Sample Central tables

### `addresses` — ship-to book (create only if V5 shows none exists)
- `id`, `nickname`, `contact_name`, `company`, `street`, `city`, `state`, `zip`, audit cols

### `shipments`
- `id`, `shipment_no` (e.g. SMP-1044), `status` (submitted|processing|shipped|delivered)
- `salesperson_user_id` (fk→users/user_profiles) — **store by id so history survives dropdown changes**
- `account` (text)
- `address_id` (fk→addresses)
- `temp` (text — the *effective* temp at submit time: derived from items unless overridden)
- `temp_override` (nullable)
- `required_by` (date), `shipping_speed` (text: ground | 2day | overnight, default `ground`)  ← *as-built; the original `rush` bool was retired, see ADR-028*
- `box_spec` (text: Dirty Cookie | Custom/Branded)  ← *intent* only; ShipStation resolves the physical box
- `collateral` (text[] — includes "Warming instructions")
- `notes` (text)
- `shipstation_order_id` (nullable — set after push)
- audit cols

> **Derived at entry:** `temp`. Any raw/frozen line item → Cold; else Ambient. `temp_override` wins if set. Compute at submit; the stored `temp` is a *snapshot of the decision*, which is fine (it's a historical fact of that shipment, not a live-derived product attribute).

### `shipment_items`
- `id`, `shipment_id` (fk)
- `product_code` (fk→products.code, nullable for custom)
- `custom` (bool), `custom_spec` (text), `project_no` (text)  ← custom project number lives here
- `qty` (int)
- `description` (text — snapshot for history; but always carry `product_code` for real items)

### `sample_templates` — saved assortments (user-manageable, not seeded)
- `id`, `name`, `description`, `owner_user_id`, `items` (jsonb: array of {product_code, qty})

---

## Users / dropdown control

Add to the existing users / `user_profiles` table (do not create a parallel table):
- `active_in_dropdown` (boolean, default true) — only true users appear in Cookie Central's salesperson dropdown.
- Confirm `email` is present (it should be) — order confirmations pull this; the salesperson selection *is* the recipient.

> **Behavior:** `active_in_dropdown=false` hides from **new selection only**. Past shipments still render the salesperson name (they store `salesperson_user_id`, joined for display regardless of dropdown status).

---

## Migration sequence (match existing naming `YYYYMMDDHHMMSS_*.sql`)
1. `*_create_product_spine.sql` — products, eaches, inners, master_cases, stuffings + RLS
2. `*_price_list_view.sql` — product_prices table + price_list view
3. `*_repoint_modules_to_products.sql` — FK updates on the modules that referenced finished-goods (from Phase 0 map)
4. `*_drop_finished_goods.sql` — **last**, after re-point verified
5. `*_sample_central_tables.sql` — addresses, shipments, shipment_items, sample_templates + RLS
6. `*_user_active_in_dropdown.sql` — the dropdown flag
7. `*_shipstation_fields.sql` — shipstation_order_id, any tag/status support

Each applied manually via SQL editor in filename order, per the repo's stated process.
