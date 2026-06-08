-- Cookie Central — one-time purge of the stale Assemblers raw-material inventory.
--
-- The 32 raw_materials rows (SKU-style lot names from an early Assemblers
-- inventory export) are being replaced by a fresh inventory upload. Removing
-- them here gives the re-upload a clean slate instead of leaving orphaned
-- codes that the upsert-by-code importer would never clear.
--
-- ON DELETE CASCADE (raw_material_lots / raw_material_orders /
-- raw_material_suppliers / bill_of_materials / inventory_adjustments) removes
-- the dependent rows. At time of writing: 171 lots, 5 orders, 1 supplier;
-- bill_of_materials and inventory_adjustments are empty.
--
-- No-op on a fresh database (the table is empty), so it is safe in migration
-- history. The ingredient_catalog / ingredient_suppliers sourcing tables are a
-- separate feed and are NOT touched.

DELETE FROM raw_materials;
