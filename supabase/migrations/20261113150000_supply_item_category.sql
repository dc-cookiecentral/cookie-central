-- ─────────────────────────────────────────────────────────────────────────
-- Supplies: ingredient category (docs/SUPPLIES_SPEC.md, "Ingredient names")
--
-- Caroline, Nov 13 2026: ingredients are named "Generic, variant" and grouped
-- by the DC x FC costing sheet's sub-categories — Chips; Fats, Butter, Oils;
-- Fillings; Flour; Sugars; Misc. Separate from tags (where an item is used:
-- Walmart, Kroger …). Set by the seed for items it owns and in the item form.
--
-- Verify:  SELECT category, count(*) FROM supply_items GROUP BY 1;
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS category text;

COMMENT ON COLUMN supply_items.category IS
  'Ingredient category (Chips; Fats, Butter, Oils; Fillings; Flour; Sugars; Misc). NULL for packaging — its type is in the name.';
