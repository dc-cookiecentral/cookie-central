-- ─────────────────────────────────────────────────────────────────────────
-- Supplies: tags on items (docs/SUPPLIES_SPEC.md, "Packaging names + tags")
--
-- Caroline, Nov 13 2026: filter e.g. all Walmart packaging, and have a shared
-- item (the clear 3.0 dough-puck tray, used for Walmart and Kroger) come up
-- under both. Private label stays in the item NAME (Flowwrap · Walmart · CCF);
-- tags say where an item is used, so one item can carry several.
--
-- Plain text tags ('Walmart', 'Kroger', …). Set by the seed for items it owns
-- and in the app (item form) — an app edit stamps app_edited_at, so the seed
-- never overwrites tags typed in the app.
--
-- Verify:
--   SELECT name, tags FROM supply_items WHERE 'Walmart' = ANY (tags);
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN supply_items.tags IS
  'Where the item is used / which program (Walmart, Kroger, …). Filter chips on the Supplies tab. Several allowed.';
