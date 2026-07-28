-- Cookie Central — open the sample catalog to the full product spine
--
-- Sample Central reads `products WHERE sample_eligible = true`. Only 8 of the 27
-- products carried the flag, and all 8 were Baked — so the catalog's Raw band
-- rendered empty and no cold-chain sample could be ordered at all. The prototype
-- (prototype/sample_central_prototype.html, deployed at samplecentral-1.vercel.app)
-- has always shown the whole catalogue: 18 Baked + 9 Raw, which is exactly what
-- `products` already holds. This aligns the data with that design.
--
-- Before: sample_eligible = true on 8 rows (Baked only)
-- After:  sample_eligible = true on all 27 (18 Baked + 9 Raw)
--
-- ⚠️ THIS MAKES COLD-CHAIN LIVE. `derivedTemp` marks any cart containing a Raw
-- line as Cold, so a salesperson can now create a frozen shipment. That flips
-- SHIPSTATION_SETUP_CHECKLIST.md §4 (cold-chain product tags) from "not blocking
-- today — all sample-eligible cookies are Baked" to **LAUNCH-BLOCKING**: the
-- co-man must tag every Raw SKU `cold-chain` in ShipStation, and the §3
-- automation rule (refrigerated handling + insulated box + next-day upgrade) must
-- exist. Without them a frozen sample imports as an ordinary ambient order and
-- ships unrefrigerated — silently, because the pull model surfaces no error.
--
-- Forward-only; safe to re-run.

UPDATE products
   SET sample_eligible = true
 WHERE sample_eligible IS DISTINCT FROM true;

-- Verify:
--   select prep, count(*) filter (where sample_eligible) as eligible, count(*) as total
--     from products group by prep order by prep;
--   -- expect Baked 18/18, Raw 9/9.
