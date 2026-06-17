-- Cookie Central — product aliases
--
-- Alternate internal codes that should resolve to a product (e.g. a report or
-- sheet that refers to "C-F-S" instead of "CCF" / the SKU). Stored as a text[]
-- on products with a GIN index so lookups can do `'<code>' = ANY(aliases)`.
--
-- Seeds the first alias: C-F-S -> CCF (Chocolate Fudge Stuffed). The Spec Sheet
-- may add more later.

ALTER TABLE products ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_products_aliases ON products USING gin (aliases);

-- C-F-S is an alias for CCF. Idempotent: only adds if not already present.
UPDATE products
   SET aliases = array_append(aliases, 'C-F-S'), updated_at = now()
 WHERE sku = 'WMCHOCCHPCOOKIESTUFCHOCDC'
   AND NOT ('C-F-S' = ANY(aliases));

-- Verify:
--   select short_name, full_name, aliases from products where aliases <> '{}';
