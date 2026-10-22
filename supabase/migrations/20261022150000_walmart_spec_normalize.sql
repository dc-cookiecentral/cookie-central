-- Walmart spec normalization + the Black Currant launch (Oct 22 2026).
--
-- Source of truth: Walmart Item 360 "Item Configurations" export (Oct 22 2026)
-- for pack quantity, case GTIN and retail; Caroline for everything Walmart
-- does not carry (cookie size, count per pouch, pallet, shelf life, recipe).
--
-- 1. The three Walmart master cases were seeded with unit_qty = 1 and truncated
--    names. Walmart's warehouse pack is 12 for all three; names become the
--    official bettergoods names.
-- 2. Black Currant (Cortina item 1324, Walmart 686669913) was selling with no
--    Spec Sheet rows at all. Added at all three levels: cookie, pouch, case.
--    Shelf stable (Baked → Ambient), 1 oz × 7 per pouch, 10 pouches per case.
--    NOTE: Walmart's product name still reads "3 oz, 4 Count" — copied from
--    the other three items. Its department (95 vs 90), pack (10 vs 12) and cost
--    all say it is a different product; Caroline's 1 oz × 7 is what's recorded.
-- 3. Peanut butter & jelly: only the Walmart product (PBJ-3OZ-RAW-C, item
--    1251) is grape. Every other PB&J is strawberry jelly.
--
-- each_sku / product_sku / unit_ref on Walmart rows stay the 4-digit numbers
-- (1251, 1252, 1287, 1324) — those are the SKUs for Walmart products.
-- Stuffing is display text only; no BOM or calculation reads it.

INSERT INTO stuffings (stuffing_id, name, type)
SELECT v.id, v.name, 'Filling'
FROM (VALUES ('ST-06', 'Strawberry Jelly'), ('ST-07', 'White Chocolate')) AS v(id, name)
WHERE NOT EXISTS (SELECT 1 FROM stuffings s WHERE s.name = v.name);

UPDATE products SET stuffing = 'Strawberry Jelly', updated_at = now()
WHERE code IN ('PBJ-2OZ-BAK-C', 'PBJ-2OZ-RAW-C', 'PBJ-3OZ-BAK-C', 'PBJ-3OZ-BAK-G')
  AND stuffing = 'Grape Jelly';

INSERT INTO products (code, description, flavor, outer_cookie, stuffing, tier, form, prep, dough_oz, sample_eligible)
VALUES ('WCBC-1OZ-BAK-C', 'Classic Black Currant / White Chocolate — 1oz, Baked', 'Black Currant / White Chocolate',
        'Black Currant Cookie', 'White Chocolate', 'Classic', 'Stuffed', 'Baked', 1, false)
ON CONFLICT (code) DO NOTHING;

UPDATE eaches SET retail_price = 4.88, updated_at = now()
WHERE each_sku IN ('1251', '1252', '1287') AND retail_price IS NULL;

INSERT INTO eaches (each_sku, product_code, each_upc, cookies_per_each, pack_type, net_wt, brand, retail_price, sample_eligible)
VALUES ('1324', 'WCBC-1OZ-BAK-C', '194346715947', 7, 'Pouch', '7oz (7 x 1oz)', 'Walmart', 4.88, false)
ON CONFLICT (each_sku) DO NOTHING;

UPDATE master_cases m SET
  name = v.name, unit_qty = 12, gtin14 = v.gtin14, updated_at = now()
FROM (VALUES
  ('MC-001', '1251', 'bettergoods Jumbo Grape Jelly-Stuffed Peanut Butter Cookie Dough', '10194346527790'),
  ('MC-003', '1252', 'bettergoods Jumbo Cookie Butter-Stuffed White Chocolate Chip Cookie Dough', '10194346527783'),
  ('MC-002', '1287', 'bettergoods Jumbo Chocolatey Fudge Stuffed Chocolate Chip Cookies', '10194346565594')
) AS v(case_id, unit_ref, name, gtin14)
WHERE m.case_id = v.case_id AND m.unit_ref = v.unit_ref;

INSERT INTO master_cases (case_id, name, status, composed_of, unit_ref, unit_qty, channel, gtin14, product_sku,
                          cases_per_pallet, shelf_life, sample_eligible)
VALUES ('MC-016', 'bettergoods White Chocolate Black Currant Cookies', 'Active', 'eaches', '1324', 10, 'Walmart',
        '10194346715944', '1324', 96, '9 Months', false)
ON CONFLICT (case_id) DO NOTHING;
