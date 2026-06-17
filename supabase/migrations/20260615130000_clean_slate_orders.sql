-- Cookie Central — order data clean-slate + product catalog completion
--
-- Cookie Central is still in testing, so this establishes a clean, correctly
-- labelled baseline for the order data rather than carrying test/demo cruft
-- forward. Three parts:
--
--   1. Purge 4 non-canonical "cruft" POs that did NOT come from the Cortina
--      NetSuite "Walmart Orders" export (they have no cortina_so_number):
--        PO14371, PO14400 — Kroger demo seeds (fake SKU WCCB-KF)
--        PO14451          — the 2026-06-02 simulated Cortina import
--        PO14518          — a non-canonical manual/test row
--      Verified safe: their children all CASCADE (po_line_items 7, po_emails 11,
--      po_lot_numbers 2, po_changes 3) or SET NULL (gmail_messages); the only
--      NO-ACTION children (legacy invoices, payments) have zero rows. Leaves
--      exactly the 392 canonical Walmart orders.
--
--   2. Complete the product catalog. Orders reference 3 real Walmart SKUs but
--      `products` had only 2 — the most-ordered (Cortina item 1252 /
--      WMWHTCHCCHPCOOKIESTUFCBDC, 305 lines) had no entry. Add it, and record
--      the Cortina "Item" number (the PO "Product number") on all 3 so the PO
--      product number translates to the internal product. Marc's authoritative
--      Product List will refine names; the white-choc short_name/full_name here
--      are PROVISIONAL (flagged in notes).
--
--   3. Reset the walmart_orders gmail_messages so the corrected parser (col AB →
--      ship_to_dot_actual) re-imports them. One-time, testing-mode only; a no-op
--      on a fresh DB. Run AFTER deploying gmail-extract, then poll the inbox.
--
-- Executable via `npx supabase db push` (precedent: 20260608130000_purge_*).

-- ── 1. Purge non-canonical POs (children CASCADE / SET NULL) ─────────────────
DELETE FROM purchase_orders
WHERE po_number IN ('PO14371', 'PO14400', 'PO14451', 'PO14518')
  AND cortina_so_number IS NULL;  -- guard: never touch a canonical SO

-- ── 2. Product catalog ──────────────────────────────────────────────────────
-- 2a. Record the PO "Product number" (Cortina Item #) → internal product.
ALTER TABLE products ADD COLUMN IF NOT EXISTS cortina_item_number text;

-- 2b. Add the missing white-choc SKU (PROVISIONAL name — pending Product List).
INSERT INTO products (sku, short_name, full_name, retailer, status, notes) VALUES
  ('WMWHTCHCCHPCOOKIESTUFCBDC', 'WCB',
   'Walmart White Choc Chip Cookie Stuffed Cookie Butter', 'Walmart', 'active',
   'PROVISIONAL name/short code decoded from SKU — confirm against Marc''s Product List.')
ON CONFLICT (sku) DO NOTHING;

-- 2c. Backfill Cortina item number → product mapping (idempotent).
UPDATE products SET cortina_item_number = '1251' WHERE sku = 'WMPBCOOKIESTUFGRPJLYDC';
UPDATE products SET cortina_item_number = '1252' WHERE sku = 'WMWHTCHCCHPCOOKIESTUFCBDC';
UPDATE products SET cortina_item_number = '1287' WHERE sku = 'WMCHOCCHPCOOKIESTUFCHOCDC';

-- ── 3. Re-import the latest export with the corrected parser (one-time) ──────
UPDATE gmail_messages
   SET processed = false, error = NULL
 WHERE classification = 'walmart_orders';

-- Verify:
--   select count(*) from purchase_orders;                     -- expect 392
--   select sku, short_name, cortina_item_number from products order by cortina_item_number;
--   select count(*) from po_changes;                          -- expect 0
