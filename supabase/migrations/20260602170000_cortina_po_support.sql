-- Cookie Central — Cortina PO PDF upload support (temporary, pre-NetSuite-API)
--
-- Backs the cortinaPO.js parser: lets Cortina PO PDFs be uploaded to create real
-- purchase_orders rows, which the systems@ agent's parked email extractions then
-- auto-link to. Bundles the schema bits that upload needs:
--   1. allow upload_type='cortina_po' on upload_log
--   2. two PO columns the PDF carries (incoterms, cortina_po)
--   3. an UPDATE policy on purchase_orders (the upsert's conflict path + the
--      existing inline BOL edit both need it; there wasn't one)
--   4. extend link_parked_po_emails to also back-fill gmail_messages.po_id
--   5. seed the two Cortina item codes into products (reference data; products
--      has no client INSERT policy, so it must be done here)
--
-- NOT auto-deployed — paste into the SQL editor (RUNBOOK §7).

-- 1. upload_type
ALTER TABLE upload_log DROP CONSTRAINT upload_log_upload_type_check;
ALTER TABLE upload_log ADD CONSTRAINT upload_log_upload_type_check
  CHECK (upload_type IN ('dot','assemblers','production','qbo','netsuite','weekly_report','cortina_po'));

-- 2. PO columns from the Cortina PDF
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS incoterms text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cortina_po boolean DEFAULT true;

-- 3. UPDATE policy (RLS had SELECT + INSERT only — upsert-on-conflict + BOL edits
--    were silently denied). Mirrors the raw_materials ops/admin pattern.
DROP POLICY IF EXISTS "Ops/admin update" ON purchase_orders;
CREATE POLICY "Ops/admin update" ON purchase_orders FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

-- 4. Back-fill now also links the gmail_messages audit rows (was po_emails +
--    po_lot_numbers only — migration 20260602160000). Body otherwise unchanged.
CREATE OR REPLACE FUNCTION public.link_parked_po_emails(p_po_id uuid, p_po_number text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  linked_emails int;
BEGIN
  UPDATE public.po_emails
     SET po_id = p_po_id
   WHERE po_id IS NULL
     AND source = 'email'
     AND extracted_data->>'po_number' = p_po_number;
  GET DIAGNOSTICS linked_emails = ROW_COUNT;

  UPDATE public.po_lot_numbers l
     SET po_id = p_po_id
    FROM public.po_emails e
   WHERE l.po_id IS NULL
     AND l.extracted_from_email_id = e.id
     AND e.po_id = p_po_id;

  UPDATE public.gmail_messages m
     SET po_id = p_po_id
    FROM public.po_emails e
   WHERE m.po_id IS NULL
     AND m.po_email_id = e.id
     AND e.po_id = p_po_id;

  RETURN linked_emails;
END;
$$;

-- 5. The two Cortina item codes on PO14451 → products reference data.
INSERT INTO products (sku, short_name, full_name, retailer, status) VALUES
  ('WMPBCOOKIESTUFGRPJLYDC',    'PBG', 'Walmart PB Cookie Stuffed Grape Jelly',      'Walmart', 'active'),
  ('WMCHOCCHPCOOKIESTUFCHOCDC', 'CCF', 'Walmart Choc Chip Cookie Stuffed Chocolate', 'Walmart', 'active')
ON CONFLICT (sku) DO NOTHING;

-- Verify:
--   select sku, short_name from products where sku like 'WM%';
--   select column_name from information_schema.columns
--     where table_name='purchase_orders' and column_name in ('incoterms','cortina_po');
