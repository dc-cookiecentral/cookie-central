-- Cookie Central — Drop the legacy finished-goods table
--
-- Phase 1, Task 1.5 (the LAST spine migration). Removes products_legacy — the
-- old finished-goods `products` table renamed aside in Task 1.1
-- (20260714120000_create_product_spine.sql) — now that the Cookulator spine is
-- live and every code reference has been re-pointed (Task 1.4). See ADR-024.
--
-- Pre-drop grep confirmed clean: no src/ code selects `product_id` or embeds the
-- old `products` relationship (only explanatory comments remain).
--
-- The three FK columns that referenced the old table are all UNPOPULATED and
-- unread (parsers key off text SKU / cortina_item_number; no hook selects them):
--   * po_line_items.product_id   — retail PO line; correct linkage is the
--     sellable unit (master_cases/eaches), added when /orders+/payments is wired
--     to the new catalog (owned by Caroline per ADR-024).
--   * dot_inventory.product_id   — DOT FG inventory; same retail-level story.
--   * bill_of_materials.product_id — BoM→product link; the table is empty and
--     unused. A BoM→cookie FK to the new products(id) can be added deliberately
--     later if wanted, rather than silently re-pointing a dead uuid column.
-- Dropping each column also drops its FK constraint to products_legacy, so the
-- table can then be dropped cleanly. Data is demo/disposable (ADR-024).
--
-- Forward-only; applied manually via the Supabase SQL editor. Apply AFTER the
-- product spine + price_list migrations and the Task 1.4 code re-points.

-- ── 1. Drop the dead finished-goods FK columns (drops their FK constraints) ──
ALTER TABLE po_line_items    DROP COLUMN IF EXISTS product_id;
ALTER TABLE dot_inventory    DROP COLUMN IF EXISTS product_id;
ALTER TABLE bill_of_materials DROP COLUMN IF EXISTS product_id;

-- ── 2. Drop the legacy table (now unreferenced) ─────────────────────────────
-- CASCADE also removes its carried-over policies, updated_at trigger, aliases
-- GIN index, and subcategory FK. Nothing else references it.
DROP TABLE IF EXISTS products_legacy CASCADE;

-- Verify:
--   select to_regclass('public.products_legacy');   -- expect NULL (gone)
--   select to_regclass('public.products');          -- expect 'products' (new spine)
--   select column_name from information_schema.columns
--     where table_name in ('po_line_items','dot_inventory','bill_of_materials')
--       and column_name='product_id';               -- expect 0 rows
