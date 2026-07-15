-- Cookie Central — Product spine reseed (Cookulator prototype data)
--
-- Phase 1, Task 1.3. One-time seed for the product spine created by
-- 20260714120000_create_product_spine.sql, sourced from the approved
-- prototype (prototype/cookulator_prototype.html). Per ADR-019 this lives in
-- supabase/seeds/ (NOT migrations/) and is applied manually via the SQL editor
-- AFTER the spine + price_list migrations.
--
-- Idempotent: every INSERT is ON CONFLICT (unique key) DO UPDATE, so re-running
-- refreshes values without duplicating rows.
--
-- Derivations at seed time (NOT stored-derived — these are base attributes here
-- because the WIP/dough layer isn't modeled as tables):
--   * tier/form come from the cookie's wip_dough -> WIP dough (subtype/type),
--     exactly as the prototype's cookieTier()/cookieType() resolve them.
-- Nothing storage/net-weight-derived is seeded (those are computed in the view).
--
-- Counts: 27 cookies (1 dup code deduped), 5 stuffings, 3 eaches, 4 inners,
-- 15 master cases. 8 cookies flagged sample_eligible.

INSERT INTO products (code, description, flavor, outer_cookie, stuffing, tier, form, prep, dough_oz, wip_dough, allergens, ingredients, nutrition, sample_eligible) VALUES
  ('CC-2OZ-BAK-G', 'Gourmet Chocolate Chip — 2oz, Baked', 'Chocolate Chip', 'Chocolate Chip', NULL, 'Gourmet', 'Shot', 'Baked', 2, 'Chocolate Chip', NULL, NULL, NULL, true),
  ('DC-2OZ-BAK-G', 'Gourmet Double Chocolate — 2oz, Baked', 'Double Chocolate', 'Double Chocolate', NULL, 'Gourmet', 'Shot', 'Baked', 2, 'Double Chocolate', NULL, NULL, NULL, true),
  ('RV-2OZ-BAK-G', 'Gourmet Red Velvet — 2oz, Baked', 'Red Velvet', 'Red Velvet', NULL, 'Gourmet', 'Shot', 'Baked', 2, 'Red Velvet', NULL, NULL, NULL, true),
  ('CH-2OZ-BAK-G', 'Gourmet Churro — 2oz, Baked', 'Churro', 'Churro', NULL, 'Gourmet', 'Shot', 'Baked', 2, 'Churro', NULL, NULL, NULL, true),
  ('CCH-2OZ-BAK-C', 'Classic Chocolate Chip / Choc. Hazelnut — 2oz, Baked', 'Chocolate Chip / Choc. Hazelnut', 'Chocolate Chip', 'Choc. Hazelnut', 'Classic', 'Stuffed', 'Baked', 2, 'Chocolate Chip Cookie', NULL, NULL, NULL, false),
  ('CCH-2OZ-RAW-C', 'Classic Chocolate Chip / Choc. Hazelnut — 2oz, Raw', 'Chocolate Chip / Choc. Hazelnut', 'Chocolate Chip', 'Choc. Hazelnut', 'Classic', 'Stuffed', 'Raw', 2, 'Chocolate Chip Cookie', NULL, NULL, NULL, false),
  ('CCH-3OZ-BAK-C', 'Classic Chocolate Chip / Choc. Hazelnut — 3oz, Baked', 'Chocolate Chip / Choc. Hazelnut', 'Chocolate Chip', 'Choc. Hazelnut', 'Classic', 'Stuffed', 'Baked', 3, 'Chocolate Chip Cookie', NULL, NULL, NULL, true),
  ('CCH-3OZ-RAW-C', 'Classic Chocolate Chip / Choc. Hazelnut — 3oz, Raw', 'Chocolate Chip / Choc. Hazelnut', 'Chocolate Chip', 'Choc. Hazelnut', 'Classic', 'Stuffed', 'Raw', 3, 'Chocolate Chip Cookie', NULL, NULL, NULL, false),
  ('CCH-3OZ-BAK-G', 'Gourmet Chocolate Chip / Choc. Hazelnut — 3oz, Baked', 'Chocolate Chip / Choc. Hazelnut', 'Chocolate Chip', 'Choc. Hazelnut', 'Gourmet', 'Stuffed', 'Baked', 3, 'Chocolate Chip Cookie (Gourmet)', NULL, NULL, NULL, false),
  ('DCSC-2OZ-BAK-C', 'Classic Double Choc. Salted Caramel — 2oz, Baked', 'Double Choc. Salted Caramel', 'Double Chocolate Chip', 'Salted Caramel', 'Classic', 'Stuffed', 'Baked', 2, 'Double Chocolate Cookie', NULL, NULL, NULL, false),
  ('DCSC-2OZ-RAW-C', 'Classic Double Choc. Salted Caramel — 2oz, Raw', 'Double Choc. Salted Caramel', 'Double Chocolate Chip', 'Salted Caramel', 'Classic', 'Stuffed', 'Raw', 2, 'Double Chocolate Cookie', NULL, NULL, NULL, false),
  ('DCSC-3OZ-BAK-C', 'Classic Double Choc. Salted Caramel — 3oz, Baked', 'Double Choc. Salted Caramel', 'Double Chocolate Chip', 'Salted Caramel', 'Classic', 'Stuffed', 'Baked', 3, 'Double Chocolate Cookie', NULL, NULL, NULL, true),
  ('DCSC-3OZ-RAW-C', 'Classic Double Choc. Salted Caramel — 3oz, Raw', 'Double Choc. Salted Caramel', 'Double Chocolate Chip', 'Salted Caramel', 'Classic', 'Stuffed', 'Raw', 3, 'Double Chocolate Cookie', NULL, NULL, NULL, false),
  ('DCSC-3OZ-BAK-G', 'Gourmet Double Choc. Salted Caramel — 3oz, Baked', 'Double Choc. Salted Caramel', 'Double Chocolate Chip', 'Salted Caramel', 'Gourmet', 'Stuffed', 'Baked', 3, 'Double Chocolate Chip (Gourmet)', NULL, NULL, NULL, false),
  ('WCCB-2OZ-BAK-C', 'Classic White Choc. Chip / Cookie Butter — 2oz, Baked', 'White Choc. Chip / Cookie Butter', 'White Choc. Chip', 'Cookie Butter', 'Classic', 'Stuffed', 'Baked', 2, 'White Chocolate Chip Cookie', NULL, NULL, NULL, false),
  ('WCCB-2OZ-RAW-C', 'Classic White Choc. Chip / Cookie Butter — 2oz, Raw', 'White Choc. Chip / Cookie Butter', 'White Choc. Chip', 'Cookie Butter', 'Classic', 'Stuffed', 'Raw', 2, 'White Chocolate Chip Cookie', NULL, NULL, NULL, false),
  ('WCCB-3OZ-BAK-C', 'Classic White Choc. Chip / Cookie Butter — 3oz, Baked', 'White Choc. Chip / Cookie Butter', 'White Choc. Chip', 'Cookie Butter', 'Classic', 'Stuffed', 'Baked', 3, 'White Chocolate Chip Cookie', NULL, NULL, NULL, true),
  ('WCCB-3OZ-RAW-C', 'Classic White Choc. Chip / Cookie Butter — 3oz, Raw', 'White Choc. Chip / Cookie Butter', 'White Choc. Chip', 'Cookie Butter', 'Classic', 'Stuffed', 'Raw', 3, 'White Chocolate Chip Cookie', NULL, NULL, NULL, false),
  ('WCCB-3OZ-BAK-G', 'Gourmet White Choc. Chip / Cookie Butter — 3oz, Baked', 'White Choc. Chip / Cookie Butter', 'White Choc. Chip', 'Cookie Butter', 'Gourmet', 'Stuffed', 'Baked', 3, 'White Chocolate Chip (Gourmet)', NULL, NULL, NULL, false),
  ('PBJ-2OZ-BAK-C', 'Classic Peanut Butter & Jelly — 2oz, Baked', 'Peanut Butter & Jelly', 'Peanut Cookie', 'Grape Jelly', 'Classic', 'Stuffed', 'Baked', 2, 'Peanut Cookie', NULL, NULL, NULL, false),
  ('PBJ-2OZ-RAW-C', 'Classic Peanut Butter & Jelly — 2oz, Raw', 'Peanut Butter & Jelly', 'Peanut Cookie', 'Grape Jelly', 'Classic', 'Stuffed', 'Raw', 2, 'Peanut Cookie', NULL, NULL, NULL, false),
  ('PBJ-3OZ-BAK-C', 'Classic Peanut Butter & Jelly — 3oz, Baked', 'Peanut Butter & Jelly', 'Peanut Cookie', 'Grape Jelly', 'Classic', 'Stuffed', 'Baked', 3, 'Peanut Cookie', NULL, NULL, NULL, true),
  ('PBJ-3OZ-RAW-C', 'Classic Peanut Butter & Jelly — 3oz, Raw', 'Peanut Butter & Jelly', 'Peanut Cookie', 'Grape Jelly', 'Classic', 'Stuffed', 'Raw', 3, 'Peanut Cookie', NULL, NULL, NULL, false),
  ('PBJ-3OZ-BAK-G', 'Gourmet Peanut Butter & Jelly — 3oz, Baked', 'Peanut Butter & Jelly', 'Peanut Cookie', 'Grape Jelly', 'Gourmet', 'Stuffed', 'Baked', 3, 'Peanut Cookie (Gourmet)', NULL, NULL, NULL, false),
  ('CC-1.5OZ-BAK-G', 'Gourmet Chocolate Chip — 1.5oz, Baked', 'Chocolate Chip', 'Chocolate Chip', NULL, 'Gourmet', 'Shot', 'Baked', 1.5, 'Chocolate Chip', NULL, NULL, NULL, false),
  ('SR-2OZ-BAK-C', 'Classic Shortbread Raspberry — 2oz, Baked', 'Shortbread Raspberry', 'Shortbread Raspberry', NULL, 'Gourmet', 'Shot', 'Baked', 2, 'Sugar/Shortbread', NULL, NULL, NULL, false),
  ('CCF-3OZ-RAW-C', 'Classic Chocolate Chip Cookie with Fudge — 3oz, Raw', 'Chocolate Chip Cookie with Fudge', 'Chocolate Chip Cookie', 'Fudge', 'Classic', 'Stuffed', 'Raw', 3, 'Chocolate Chip Cookie', NULL, NULL, NULL, false)
ON CONFLICT (code) DO UPDATE SET
  description=EXCLUDED.description, flavor=EXCLUDED.flavor, outer_cookie=EXCLUDED.outer_cookie,
  stuffing=EXCLUDED.stuffing, tier=EXCLUDED.tier, form=EXCLUDED.form, prep=EXCLUDED.prep,
  dough_oz=EXCLUDED.dough_oz, wip_dough=EXCLUDED.wip_dough, allergens=EXCLUDED.allergens,
  ingredients=EXCLUDED.ingredients, nutrition=EXCLUDED.nutrition,
  sample_eligible=EXCLUDED.sample_eligible, updated_at=now();

INSERT INTO stuffings (stuffing_id, name, type, no_flex, notes) VALUES
  ('ST-01', 'Choc. Hazelnut', 'Filling', false, NULL),
  ('ST-02', 'Cookie Butter', 'Filling', false, NULL),
  ('ST-03', 'Fudge', 'Filling', false, NULL),
  ('ST-04', 'Salted Caramel', 'Filling', false, NULL),
  ('ST-05', 'Grape Jelly', 'Filling', false, NULL)
ON CONFLICT (stuffing_id) DO UPDATE SET
  name=EXCLUDED.name, type=EXCLUDED.type, no_flex=EXCLUDED.no_flex, notes=EXCLUDED.notes;

INSERT INTO eaches (each_sku, product_code, each_upc, cookies_per_each, pack_type, net_wt, brand, retail_price, length_in, width_in, height_in, gross_wt_oz, sample_eligible) VALUES
  ('1252', 'WCCB-3OZ-RAW-C', '194346527786', 4, 'Tray + Film', '12oz (4 x 3oz)', 'Walmart', NULL, NULL, NULL, NULL, NULL, false),
  ('1251', 'PBJ-3OZ-RAW-C', '194346527793', 4, 'Tray + Film', '12oz (4 x 3oz)', 'Walmart', NULL, NULL, NULL, NULL, NULL, false),
  ('1287', 'CCF-3OZ-RAW-C', '194346565597', 4, 'Tray + Film', '12oz (4 x 3oz)', 'Walmart', NULL, NULL, NULL, NULL, NULL, false)
ON CONFLICT (each_sku) DO UPDATE SET
  product_code=EXCLUDED.product_code, each_upc=EXCLUDED.each_upc,
  cookies_per_each=EXCLUDED.cookies_per_each, pack_type=EXCLUDED.pack_type,
  net_wt=EXCLUDED.net_wt, brand=EXCLUDED.brand, retail_price=EXCLUDED.retail_price,
  length_in=EXCLUDED.length_in, width_in=EXCLUDED.width_in, height_in=EXCLUDED.height_in,
  gross_wt_oz=EXCLUDED.gross_wt_oz, sample_eligible=EXCLUDED.sample_eligible, updated_at=now();

INSERT INTO inners (inner_sku, name, each_sku, eaches_per_inner, sellable, upc, gtin14, sample_eligible) VALUES
  ('3001', 'Cookie Shot Inner Case — 12', NULL, 12, true, NULL, NULL, false),
  ('3002', 'Cookie Shot Inner Case — 24', NULL, 24, true, NULL, NULL, false),
  ('3003', 'Stuffed Cookie Inner Case — 12', NULL, 12, true, NULL, NULL, false),
  ('3004', 'Stuffed Cookie Inner Case — 24', NULL, 24, false, NULL, NULL, false)
ON CONFLICT (inner_sku) DO UPDATE SET
  name=EXCLUDED.name, each_sku=EXCLUDED.each_sku, eaches_per_inner=EXCLUDED.eaches_per_inner,
  sellable=EXCLUDED.sellable, upc=EXCLUDED.upc, gtin14=EXCLUDED.gtin14,
  sample_eligible=EXCLUDED.sample_eligible, updated_at=now();

INSERT INTO master_cases (case_id, name, status, composed_of, unit_ref, unit_qty, channel, gtin14, product_sku, length_in, width_in, height_in, gross_wt_lb, cube_cuft, net_wt_manual, ti, hi, cases_per_pallet, pallet_size, pallet_weight_lb, loading_height_in, shelf_life, country, sample_eligible) VALUES
  ('MC-001', 'Classic Peanut Butter & Jelly Stuffed Cookie — 4', 'Active', 'eaches', '1251', 1, 'Walmart', NULL, '1251', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false),
  ('MC-002', 'Classic Chocolate Chip Cookie with Fudge Stuffed', 'Active', 'eaches', '1287', 1, 'Walmart', NULL, '1287', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false),
  ('MC-003', 'Classic White Chocolate Chip / Cookie Butter Stu', 'Active', 'eaches', '1252', 1, 'Walmart', NULL, '1252', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, false),
  ('MC-004', 'Chocolate Chip Cookie Shots', 'Active', 'cookies', 'CC-2OZ-BAK-G', 50, 'Wholesale', '850053030130', NULL, 15, 15, 3, 7.25, 0.39, 12.5, 6, 17, 102, '40 x 48', 900, 72, '6 Months', 'USA', false),
  ('MC-005', 'Churro Cookie Shots', 'Active', 'cookies', 'CH-2OZ-BAK-G', 50, 'Wholesale', '850053030147', NULL, 15, 15, 3, 7.25, 0.39, 12.5, 6, 17, 102, '40 x 48', 900, 72, '6 Months', 'USA', false),
  ('MC-006', 'Double Chocolate Cookie Shots', 'Active', 'cookies', 'DC-2OZ-BAK-G', 50, 'Wholesale', '850053030154', NULL, 15, 15, 3, 7.25, 0.39, 12.5, 6, 17, 102, '40 x 48', 900, 72, '6 Months', 'USA', false),
  ('MC-007', 'Red Velvet Cookie Shots', 'Active', 'cookies', 'RV-2OZ-BAK-G', 50, 'Wholesale', '850053030161', NULL, 15, 15, 3, 7.25, 0.39, 12.5, 6, 17, 102, '40 x 48', 900, 72, '6 Months', 'USA', false),
  ('MC-008', 'Chocolate Chip Hazelnut Classic Stuffed Cookies-Clear (3oz)', 'Active', 'cookies', 'CCH-3OZ-BAK-C', 100, 'Wholesale', '850053030086', NULL, 18, 14, 10, 20, 1.46, 18.75, 6, 6, 36, '40 x 48', 1000, 72, '12 Months', 'USA', false),
  ('MC-009', 'White Chocolate Chip Cookie Butter Classic Stuffed Cookies-Clear (3oz)', 'Active', 'cookies', 'WCCB-3OZ-BAK-C', 100, 'Wholesale', '850053030499', NULL, 18, 14, 10, 20, 1.46, 18.75, 6, 6, 36, '40 x 48', 1000, 72, '12 Months', 'USA', false),
  ('MC-010', 'Double Chocolate Salted Caramel Classic Stuffed Cookies-Clear (3oz)', 'Active', 'cookies', 'DCSC-3OZ-BAK-C', 100, 'Wholesale', '850053030109', NULL, 18, 14, 10, 20, 1.46, 18.75, 6, 6, 36, '40 x 48', 1000, 72, '12 Months', 'USA', false),
  ('MC-011', 'Peanut Butter & Jelly Classic Stuffed Cookies-Clear (3oz)', 'Active', 'cookies', 'PBJ-3OZ-BAK-C', 100, 'Wholesale', '850053030116', NULL, 18, 14, 10, 20, 1.46, 18.75, 6, 6, 36, '40 x 48', 1000, 72, '12 Months', 'USA', false),
  ('MC-012', 'Chocolate Chip Hazelnut Classic Stuffed Cookies-Clear (2oz)', 'Active', 'cookies', 'CCH-2OZ-BAK-C', 100, 'Wholesale', '850053030253', NULL, 14, 10, 7, 14, 0.57, 12.5, 11, 8, 88, '40 x 48', 900, 72, '12 Months', 'USA', false),
  ('MC-013', 'White Chocolate Chip Cookie Butter Classic Stuffed Cookies-Clear (2oz)', 'Active', 'cookies', 'WCCB-2OZ-BAK-C', 100, 'Wholesale', '850053030246', NULL, 14, 10, 7, 14, 0.57, 12.5, 11, 8, 88, '40 x 48', 900, 72, '12 Months', 'USA', false),
  ('MC-014', 'Double Chocolate Salted Caramel Classic Stuffed Cookies-Clear (2oz)', 'Active', 'cookies', 'DCSC-2OZ-BAK-C', 100, 'Wholesale', '850053030123', NULL, 14, 10, 7, 14, 0.57, 12.5, 11, 8, 88, '40 x 48', 900, 72, '12 Months', 'USA', false),
  ('MC-015', 'Peanut Butter & Jelly Classic Stuffed Cookies-Clear (2oz)', 'Active', 'cookies', 'PBJ-2OZ-BAK-C', 100, 'Wholesale', '850053030093', NULL, 14, 10, 7, 14, 0.57, 12.5, 11, 8, 88, '40 x 48', 900, 72, '12 Months', 'USA', false)
ON CONFLICT (case_id) DO UPDATE SET
  name=EXCLUDED.name, status=EXCLUDED.status, composed_of=EXCLUDED.composed_of,
  unit_ref=EXCLUDED.unit_ref, unit_qty=EXCLUDED.unit_qty, channel=EXCLUDED.channel,
  gtin14=EXCLUDED.gtin14, product_sku=EXCLUDED.product_sku, length_in=EXCLUDED.length_in,
  width_in=EXCLUDED.width_in, height_in=EXCLUDED.height_in, gross_wt_lb=EXCLUDED.gross_wt_lb,
  cube_cuft=EXCLUDED.cube_cuft, net_wt_manual=EXCLUDED.net_wt_manual, ti=EXCLUDED.ti, hi=EXCLUDED.hi,
  cases_per_pallet=EXCLUDED.cases_per_pallet, pallet_size=EXCLUDED.pallet_size,
  pallet_weight_lb=EXCLUDED.pallet_weight_lb, loading_height_in=EXCLUDED.loading_height_in,
  shelf_life=EXCLUDED.shelf_life, country=EXCLUDED.country,
  sample_eligible=EXCLUDED.sample_eligible, updated_at=now();

-- Verify:
--   select count(*) from products;                      -- expect 27
--   select count(*) from products where sample_eligible;-- expect 8
--   select count(*) from stuffings;                     -- expect 5
--   select count(*) from eaches;                        -- expect 3
--   select count(*) from inners;                        -- expect 4
--   select count(*) from master_cases;                  -- expect 15
--   select code, tier, form, prep from products order by code;
