-- Cookie Central — PO lot numbers + BOL capture (delivery traceability)
--
-- Captures the BOL number on the PO and the finished-good lot numbers per SKU
-- that arrive via delivery emails to systems@dirtycookie.com (manual entry in
-- Phase 1; AI auto-extraction in Phase 2). The lot number is the traceability
-- key linking outbound (what we shipped) to inbound (what the retailer received)
-- — and, in Phase 2, back to raw_material_lots / dot_inventory.
--
-- INTENTIONALLY NOT PUSHED — consistent with the schema hold.

ALTER TABLE purchase_orders ADD COLUMN bol_number text;

CREATE TABLE po_lot_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  lot_number text NOT NULL,
  sku text,
  quantity_cases int,
  bol_reference text,
  received_date date,
  source text DEFAULT 'email' CHECK (source IN ('email', 'manual', 'dot_report')),
  extracted_from_email_id uuid REFERENCES po_emails(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE po_lot_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON po_lot_numbers FOR SELECT USING (true);
-- Added beyond the provided SQL: PART 3's manual "+ Add Lot" needs an INSERT
-- policy (RLS is enabled, so without one all inserts are denied). Mirrors the
-- po_changes ops/admin pattern. Remove if manual entry should be service-only.
CREATE POLICY "Ops/admin insert" ON po_lot_numbers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
CREATE INDEX idx_po_lots_po ON po_lot_numbers(po_id);

-- Track the new bol_number column in the audit trigger. Redefined here (rather
-- than editing the change-tracking migration) so each migration stays
-- forward-only and bol_number's column + its tracking live together. Adds
-- 'bol_number' to the column array; body otherwise unchanged.
CREATE OR REPLACE FUNCTION log_po_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  col text;
  old_val text;
  new_val text;
BEGIN
  FOREACH col IN ARRAY ARRAY['ship_status','payment_status','ship_date_actual','ship_to_dot_date','ship_to_dot_actual','dot_receipt_date','total_cases','total_amount','carrier','destination_dc','nova_changes','mabd','invoice_number','bol_number'] LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', col, col) INTO old_val, new_val USING OLD, NEW;
    IF old_val IS DISTINCT FROM new_val THEN
      INSERT INTO audit_log (user_id, table_name, record_id, action, field_name, old_value, new_value)
      VALUES (auth.uid(), 'purchase_orders', NEW.id, 'UPDATE', col, old_val, new_val);

      INSERT INTO po_changes (po_id, field_name, original_value, new_value, change_source, changed_by)
      VALUES (NEW.id, col, old_val, new_val, 'internal', auth.uid());
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
