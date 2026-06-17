-- Cookie Central — interim product name mapping (until the Spec Sheet lands)
--
-- User-provided Cortina Code -> Internal (short_name) -> Display Name (full_name).
-- Replaces the provisional "WCB / White Choc Chip Cookie Stuffed Cookie Butter"
-- guess with the real WCCB / "White Choc Chip", restates PBG/CCF display names,
-- and adds the Kroger White Choc Chip SKU. The Spec Sheet will later supersede
-- these with authoritative names + specs.
--
-- products has no client INSERT/UPDATE policy, so this must run as a migration.

UPDATE products SET short_name = 'WCCB', full_name = 'White Choc Chip',
       notes = NULL, updated_at = now()
 WHERE sku = 'WMWHTCHCCHPCOOKIESTUFCBDC';

UPDATE products SET short_name = 'PBG', full_name = 'P.B. Cookie Grape Jelly',
       updated_at = now()
 WHERE sku = 'WMPBCOOKIESTUFGRPJLYDC';

UPDATE products SET short_name = 'CCF', full_name = 'Chocolate Fudge Stuffed',
       updated_at = now()
 WHERE sku = 'WMCHOCCHPCOOKIESTUFCHOCDC';

-- Kroger White Choc Chip (Cortina code C-WCCB-12-13-KF; no numeric item #).
INSERT INTO products (sku, short_name, full_name, retailer, status)
VALUES ('C-WCCB-12-13-KF', 'WCCB-KF', 'White Choc Chip (Kroger)', 'Kroger', 'active')
ON CONFLICT (sku) DO UPDATE
  SET short_name = EXCLUDED.short_name, full_name = EXCLUDED.full_name,
      retailer = EXCLUDED.retailer, updated_at = now();

-- Verify:
--   select sku, short_name, full_name, retailer, cortina_item_number
--     from products order by retailer, short_name;
