-- Cookie Central — Sample Central tables
--
-- Phase 2, Task 2.1. The Cortina sample-ordering module. Depends on the product
-- spine (Phase 1): sample_shipment_items reference products by code, and the
-- catalog reads products.sample_eligible.
--
-- NAMING RECONCILIATION (DATA_MODEL_ADDITIONS said `shipments` / `shipment_items`):
-- a `shipments` table already exists (PO-level shipment tracking, /orders domain),
-- so the Sample Central tables are named **sample_shipments** / **sample_shipment_items**
-- to avoid the collision. Same pattern as products -> master_cases in ADR-024.
--
-- Salesperson is stored by user id (history survives dropdown changes). Items
-- reference products by code (custom items carry a null product_code + custom_spec
-- + project_no). Derived-at-entry temp is stored as a *snapshot of the decision*
-- (a historical fact of the shipment), with temp_override winning.
--
-- RLS: all authenticated read; writes allowed for admin/finance/ops AND 'cortina'
-- (the Cortina salesperson role is added to user_profiles' CHECK in Task 2.7 —
-- naming it here now is harmless until then and avoids re-editing these policies).
--
-- Forward-only; applied manually via the Supabase SQL editor.

-- Reusable write predicate: any provisioned staff/sales role.
-- (Inlined per policy since Postgres RLS can't share a predicate constant.)

-- ── addresses — ship-to book ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname text,
  contact_name text,
  company text,
  street text,
  city text,
  state text,
  zip text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read" ON addresses;
CREATE POLICY "All can read" ON addresses FOR SELECT USING (true);
DROP POLICY IF EXISTS "Staff insert" ON addresses;
CREATE POLICY "Staff insert" ON addresses FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops', 'cortina'))
);
DROP POLICY IF EXISTS "Staff update" ON addresses;
CREATE POLICY "Staff update" ON addresses FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops', 'cortina'))
);
DROP POLICY IF EXISTS "Staff delete" ON addresses;
CREATE POLICY "Staff delete" ON addresses FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops', 'cortina'))
);

-- ── sample_shipments ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sample_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_no text UNIQUE NOT NULL,              -- e.g. 'SMP-1044'
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'processing', 'shipped', 'delivered')),
  salesperson_user_id uuid REFERENCES user_profiles(id),  -- store by id; joined for display regardless of dropdown status
  account text,
  address_id uuid REFERENCES addresses(id),
  temp text,                                     -- effective temp at submit (Cold if any raw/frozen item, else Ambient); a stored snapshot
  temp_override text,                            -- wins over the derived temp when set
  required_by date,
  rush boolean NOT NULL DEFAULT false,
  box_spec text,                                 -- intent only ('Dirty Cookie' | 'Custom/Branded'); ShipStation resolves the physical box
  collateral text[] NOT NULL DEFAULT '{}',       -- includes 'Warming instructions'
  notes text,
  shipstation_order_id text,                     -- set after the ShipStation push (Phase 3)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE sample_shipments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read" ON sample_shipments;
CREATE POLICY "All can read" ON sample_shipments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Staff insert" ON sample_shipments;
CREATE POLICY "Staff insert" ON sample_shipments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops', 'cortina'))
);
DROP POLICY IF EXISTS "Staff update" ON sample_shipments;
CREATE POLICY "Staff update" ON sample_shipments FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops', 'cortina'))
);
DROP POLICY IF EXISTS "Staff delete" ON sample_shipments;
CREATE POLICY "Staff delete" ON sample_shipments FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops', 'cortina'))
);

-- ── sample_shipment_items ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sample_shipment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid REFERENCES sample_shipments(id) ON DELETE CASCADE,
  product_code text REFERENCES products(code),   -- null for custom lines
  custom boolean NOT NULL DEFAULT false,
  custom_spec text,                              -- free description for custom lines
  project_no text,                               -- custom project number lives here
  qty int NOT NULL DEFAULT 1,
  description text,                              -- snapshot for history (real items still carry product_code)
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sample_shipment_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read" ON sample_shipment_items;
CREATE POLICY "All can read" ON sample_shipment_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "Staff insert" ON sample_shipment_items;
CREATE POLICY "Staff insert" ON sample_shipment_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops', 'cortina'))
);
DROP POLICY IF EXISTS "Staff update" ON sample_shipment_items;
CREATE POLICY "Staff update" ON sample_shipment_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops', 'cortina'))
);
DROP POLICY IF EXISTS "Staff delete" ON sample_shipment_items;
CREATE POLICY "Staff delete" ON sample_shipment_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops', 'cortina'))
);

-- ── sample_templates — saved assortments (user-manageable) ──────────────────
CREATE TABLE IF NOT EXISTS sample_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_user_id uuid REFERENCES user_profiles(id),
  items jsonb NOT NULL DEFAULT '[]',             -- array of { product_code, qty }
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE sample_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All can read" ON sample_templates;
CREATE POLICY "All can read" ON sample_templates FOR SELECT USING (true);
DROP POLICY IF EXISTS "Staff insert" ON sample_templates;
CREATE POLICY "Staff insert" ON sample_templates FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops', 'cortina'))
);
DROP POLICY IF EXISTS "Staff update" ON sample_templates;
CREATE POLICY "Staff update" ON sample_templates FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops', 'cortina'))
);
DROP POLICY IF EXISTS "Staff delete" ON sample_templates;
CREATE POLICY "Staff delete" ON sample_templates FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops', 'cortina'))
);

-- ── Indexes + updated_at triggers ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sample_shipments_salesperson ON sample_shipments(salesperson_user_id);
CREATE INDEX IF NOT EXISTS idx_sample_shipments_status ON sample_shipments(status);
CREATE INDEX IF NOT EXISTS idx_sample_shipment_items_shipment ON sample_shipment_items(shipment_id);
CREATE INDEX IF NOT EXISTS idx_sample_shipment_items_product ON sample_shipment_items(product_code);
CREATE INDEX IF NOT EXISTS idx_sample_templates_owner ON sample_templates(owner_user_id);

DROP TRIGGER IF EXISTS set_updated_at_addresses ON addresses;
CREATE TRIGGER set_updated_at_addresses BEFORE UPDATE ON addresses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_sample_shipments ON sample_shipments;
CREATE TRIGGER set_updated_at_sample_shipments BEFORE UPDATE ON sample_shipments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_sample_templates ON sample_templates;
CREATE TRIGGER set_updated_at_sample_templates BEFORE UPDATE ON sample_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Verify:
--   select table_name from information_schema.tables where table_schema='public'
--     and table_name in ('addresses','sample_shipments','sample_shipment_items','sample_templates');
--   -- expect 4 rows.
