-- Cookie Central — link inventory items to their normalized ingredient.
--
-- raw_materials holds one row per vendor-specific inventory item, keyed by its
-- DC item # in `code` (e.g. 119009 = Pioneer sugar, 119001 = Western sugar).
-- Topline inventory should roll up by the normalized ingredient ("Granulated
-- Sugar" = both), while the per-vendor rows + lots stay for production / COGS
-- (which vendor's sugar a run consumed).
--
-- Join key: raw_materials.code = ingredient_suppliers.dc_item_number, which
-- resolves to ingredient_suppliers.ingredient_id (→ ingredient_catalog).
--
-- A BEFORE trigger keeps the link current on every inventory (re)upload; a
-- one-time backfill links rows already present. Items whose code is not a DC
-- item # in the catalog (finished-good batch / rework SKUs) stay null and fall
-- back to their own name in the UI.
--
-- Idempotent per the repo's push convention.

ALTER TABLE raw_materials
  ADD COLUMN IF NOT EXISTS ingredient_id uuid REFERENCES ingredient_catalog(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rm_ingredient ON raw_materials(ingredient_id);

-- Resolve code → normalized ingredient on write. SECURITY INVOKER is fine:
-- ingredient_suppliers has an "All can read" SELECT policy.
CREATE OR REPLACE FUNCTION link_raw_material_to_ingredient() RETURNS trigger AS $$
BEGIN
  NEW.ingredient_id := (
    SELECT s.ingredient_id
    FROM ingredient_suppliers s
    WHERE s.dc_item_number = NEW.code
    LIMIT 1
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_link_raw_material_ingredient ON raw_materials;
CREATE TRIGGER trg_link_raw_material_ingredient
  BEFORE INSERT OR UPDATE ON raw_materials
  FOR EACH ROW EXECUTE FUNCTION link_raw_material_to_ingredient();

-- Backfill rows already in the table.
UPDATE raw_materials rm
SET ingredient_id = s.ingredient_id
FROM ingredient_suppliers s
WHERE s.dc_item_number = rm.code
  AND rm.ingredient_id IS DISTINCT FROM s.ingredient_id;
