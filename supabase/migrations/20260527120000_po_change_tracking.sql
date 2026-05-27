-- Cookie Central — PO change tracking + audit logging
--
-- PART 1: po_changes — structured, human-readable change history per PO
--   (source-tagged: nova / cortina / internal / email / manual).
-- PART 3: a trigger on purchase_orders that, on every UPDATE, writes both an
--   audit_log entry and a po_changes row for each column that actually changed.
--
-- NOT YET PUSHED (consistent with the rest of the schema — holding until the
-- finalized report templates land). Creating the file does not deploy it.

-- ── PART 1 ──────────────────────────────────────────────────────────────────
CREATE TABLE po_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  original_value text,
  new_value text,
  change_source text CHECK (change_source IN ('nova', 'cortina', 'internal', 'email', 'manual')),
  change_reason text,
  changed_by uuid REFERENCES user_profiles(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE po_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON po_changes FOR SELECT USING (true);
CREATE POLICY "Ops/admin insert" ON po_changes FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
CREATE INDEX idx_po_changes_po ON po_changes(po_id);

-- ── PART 3 ──────────────────────────────────────────────────────────────────
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
  FOREACH col IN ARRAY ARRAY['ship_status','payment_status','ship_date_actual','ship_to_dot_date','ship_to_dot_actual','dot_receipt_date','total_cases','total_amount','carrier','destination_dc','nova_changes','mabd','invoice_number'] LOOP
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

CREATE TRIGGER track_po_changes
  AFTER UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION log_po_changes();

-- ── NOVA backfill (PART 2) ───────────────────────────────────────────────────
-- Existing NOVA history lives as free text in purchase_orders.nova_changes.
-- Backfilling it into structured po_changes rows (change_source = 'nova') needs
-- the real nova_changes text format, which isn't finalized yet — and there is no
-- PO data in the DB to migrate today. When real POs land, either:
--   (a) the NetSuite parser writes po_changes rows with change_source='nova'
--       directly as it ingests NOVA revisions (preferred, going forward), or
--   (b) a one-time backfill parses nova_changes into field/original/new rows.
-- Left intentionally as a documented no-op rather than a guess at the format.
