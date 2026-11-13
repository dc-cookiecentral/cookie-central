-- ─────────────────────────────────────────────────────────────────────────
-- Supplies: a document library not tied to price lines
-- (docs/SUPPLIES_SPEC.md, "Documents — Nov 13 2026")
--
--   supply_documents       — one row per file in the private `supply-docs`
--                            bucket: renderings, drawings, spec sheets, COAs,
--                            and the quotes / POs / invoices / packing slips
--                            that price lines also point at (quotes.doc_path)
--   supply_document_items  — which items a document belongs to. Many-to-many:
--                            one drawing can cover the Walmart and ALDI trays.
--                            A document with no rows here is UNASSIGNED and
--                            waits on the Documents tab until someone picks
--                            its item(s).
--
-- Backfill: every document a price line already points at gets a library row,
-- linked to that line's item, so the Documents tab starts complete.
--
-- Read = internal roles (admin/finance/ops), write = admin/ops, field-level
-- audit — the same rules as the other supplies tables.
--
-- Verify:
--   SELECT doc_kind, count(*) FROM supply_documents GROUP BY 1;
--   SELECT count(*) FROM supply_documents d
--    WHERE NOT EXISTS (SELECT 1 FROM supply_document_items x WHERE x.document_id = d.id);  -- unassigned
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS supply_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_path text NOT NULL UNIQUE,            -- object path in storage bucket 'supply-docs'
  title text NOT NULL,
  doc_kind text NOT NULL DEFAULT 'other' CHECK (doc_kind IN (
    'rendering', 'spec', 'quote', 'po', 'invoice', 'packing_slip', 'coa', 'other')),
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  doc_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supply_document_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- for the audit trigger
  document_id uuid NOT NULL REFERENCES supply_documents(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES supply_items(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (document_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_supply_document_items_item ON supply_document_items(item_id);

-- ── RLS: internal read, admin/ops write ─────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['supply_documents', 'supply_document_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "Internal read" ON %I', t);
    EXECUTE format($p$CREATE POLICY "Internal read" ON %I FOR SELECT USING (
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops'))
    )$p$, t);

    EXECUTE format('DROP POLICY IF EXISTS "Ops/admin insert" ON %I', t);
    EXECUTE format($p$CREATE POLICY "Ops/admin insert" ON %I FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
    )$p$, t);

    EXECUTE format('DROP POLICY IF EXISTS "Ops/admin update" ON %I', t);
    EXECUTE format($p$CREATE POLICY "Ops/admin update" ON %I FOR UPDATE USING (
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
    )$p$, t);

    EXECUTE format('DROP POLICY IF EXISTS "Ops/admin delete" ON %I', t);
    EXECUTE format($p$CREATE POLICY "Ops/admin delete" ON %I FOR DELETE USING (
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
    )$p$, t);

    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON %1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION log_supplies_changes()', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS set_updated_at_supply_documents ON supply_documents;
CREATE TRIGGER set_updated_at_supply_documents BEFORE UPDATE ON supply_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── backfill from price lines (idempotent) ──────────────────────────────────
-- One library row per distinct quotes.doc_path, from its earliest-dated line:
-- title = the line's doc_ref, kind from doc_type (a '_ps-' path is a packing
-- slip), vendor and date from the line. Then link every item whose price lines
-- point at that file.
INSERT INTO supply_documents (doc_path, title, doc_kind, vendor_id, doc_date)
SELECT DISTINCT ON (q.doc_path)
  q.doc_path,
  coalesce(q.doc_ref, initcap(q.doc_type)),
  CASE
    WHEN q.doc_path LIKE '%\_ps-%' THEN 'packing_slip'
    WHEN q.doc_type = 'po' THEN 'po'
    WHEN q.doc_type = 'invoice' THEN 'invoice'
    WHEN q.doc_type IN ('quote', 'verbal') THEN 'quote'
    ELSE 'other'
  END,
  q.vendor_id,
  q.doc_date
FROM quotes q
WHERE q.doc_path IS NOT NULL
ORDER BY q.doc_path, q.doc_date NULLS LAST, q.id
ON CONFLICT (doc_path) DO NOTHING;

INSERT INTO supply_document_items (document_id, item_id)
SELECT DISTINCT d.id, s.item_id
FROM supply_documents d
JOIN quotes q      ON q.doc_path = d.doc_path
JOIN supply_skus s ON s.id = q.sku_id
ON CONFLICT (document_id, item_id) DO NOTHING;
