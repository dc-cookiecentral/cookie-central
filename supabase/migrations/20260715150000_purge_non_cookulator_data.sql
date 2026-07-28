-- Cookie Central — Purge all non-Cookulator data (ONE-TIME, DESTRUCTIVE)
--
-- Authorized by Caroline (ADR-025 carried item c): the new Cookulator product
-- spine is the master data to preserve; ALL other historical/transactional data
-- across the original Cookie Central modules can be deleted. Data re-enters via
-- the existing upload/agent pipelines, so this is reversible by re-import.
--
-- *** NOT part of the Phase-1 apply sequence. *** Apply this only when you're
-- ready to clear the demo/historical data — AFTER the spine migrations + seed
-- are applied and /spec-sheet is verified. Review the PRESERVE/WIPE lists first.
--
-- PRESERVED (12):
--   Cookulator spine  : products, eaches, inners, master_cases, stuffings,
--                       raw_doughs, wip_doughs, product_prices
--   System / config   : user_profiles, user_role_seeds (accounts/roles),
--                       subcategories (UOM conversion config),
--                       gmail_sync_state (keeps the systems@ agent connected)
--
-- WIPED (32) — every other table, grouped by module. TRUNCATE ... CASCADE clears
-- FK-dependent rows together; RESTART IDENTITY resets any sequences. No preserved
-- table references a wiped table, so the cascade cannot reach preserved data.
--
-- JUDGMENT CALLS to confirm before running (flip by moving a name between lists):
--   * audit_log      — WIPED. This clears the historical audit trail. Move to
--                      PRESERVE if you'd rather keep it.
--   * ingredient_catalog / ingredient_suppliers — WIPED as uploaded ingredient
--                      data. Move to PRESERVE if you treat them as reference.
--   * gmail_sync_state — PRESERVED so you don't have to re-OAuth the agent.
--                      Move to WIPE (and re-connect Gmail) for a full reset.
--
-- Forward-only; applied manually via the Supabase SQL editor.

TRUNCATE TABLE
  -- Orders / payments
  purchase_orders,
  po_line_items,
  shipments,
  invoices,
  payments,
  cortina_invoices,
  -- PO email thread / change history / delivered lots
  po_emails,
  po_changes,
  po_lot_numbers,
  -- Finished-goods inventory (DOT)
  dot_inventory,
  -- Raw materials lifecycle
  raw_materials,
  raw_material_suppliers,
  raw_material_orders,
  raw_material_lots,
  raw_material_snapshots,
  bill_of_materials,
  bom_overrides,
  inventory_adjustments,
  -- Ingredient master (uploaded)
  ingredient_catalog,
  ingredient_suppliers,
  -- Production + traceability
  production_runs,
  production_pallets,
  production_subcomponents,
  production_rejects,
  lot_shipments,
  -- Production scenarios
  production_scenarios,
  scenario_ingredients,
  scenario_runs,
  -- Weekly reports
  weekly_reports,
  -- Email-agent message audit + upload history + audit log
  gmail_messages,
  upload_log,
  audit_log,
  -- Product transitions
  transitions
RESTART IDENTITY CASCADE;

-- Verify (all expect 0):
--   select count(*) from purchase_orders;
--   select count(*) from dot_inventory;
--   select count(*) from raw_materials;
--   select count(*) from weekly_reports;
--   select count(*) from upload_log;
-- Confirm the Cookulator spine is intact (expect the seeded counts):
--   select count(*) from products;      -- 27
--   select count(*) from master_cases;  -- 15
