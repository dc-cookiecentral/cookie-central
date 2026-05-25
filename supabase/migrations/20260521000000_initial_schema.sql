-- Cookie Central — Supabase Schema
-- Run in Supabase SQL editor to create all tables

-- USER PROFILES
CREATE TABLE user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'finance', 'ops')),
  title text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read all profiles" ON user_profiles FOR SELECT USING (true);
CREATE POLICY "Admins can update profiles" ON user_profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

-- SUBCATEGORIES (UOM conversion)
CREATE TABLE subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  retailer text,
  cookies_per_cu int NOT NULL DEFAULT 4,
  cu_per_case int NOT NULL DEFAULT 12,
  ti int NOT NULL DEFAULT 9,
  hi int NOT NULL DEFAULT 21
);
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON subcategories FOR SELECT USING (true);

-- PRODUCTS
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE NOT NULL,
  short_name text NOT NULL,
  full_name text NOT NULL,
  subcategory_id uuid REFERENCES subcategories(id),
  retailer text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'upcoming', 'discontinued')),
  launch_date date,
  cog_per_case numeric,
  revenue_per_case numeric,
  shelf_life_days int DEFAULT 270,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON products FOR SELECT USING (true);
CREATE POLICY "Finance/admin update" ON products FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance'))
);

-- PURCHASE ORDERS
CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text UNIQUE NOT NULL,
  retailer text NOT NULL,
  order_date date,
  mabd date,
  ship_date_original date,
  ship_date_actual date,
  delivery_date date,
  destination_dc text,
  ship_status text DEFAULT 'pending' CHECK (ship_status IN ('pending', 'shipped', 'delivered')),
  payment_status text DEFAULT 'pending',
  payment_terms text,
  carrier text,
  freight_handler text,
  bol_received boolean DEFAULT false,
  customer_order_number text,
  invoice_number text,
  total_cases int,
  total_amount numeric,
  paid_amount numeric DEFAULT 0,
  nova_changes text,
  email_count int DEFAULT 0,
  revenue_per_case numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON purchase_orders FOR SELECT USING (true);
CREATE POLICY "Ops/admin insert" ON purchase_orders FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

-- PO LINE ITEMS
CREATE TABLE po_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  sku text NOT NULL,
  quantity_cases int NOT NULL,
  unit_cost numeric,
  line_total numeric
);
ALTER TABLE po_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON po_line_items FOR SELECT USING (true);

-- SHIPMENTS
CREATE TABLE shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  asn_number text,
  ship_date date,
  delivery_date date,
  carrier text,
  tracking_bol text,
  ship_from text,
  ship_to text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON shipments FOR SELECT USING (true);

-- INVOICES
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid REFERENCES purchase_orders(id),
  invoice_number text,
  invoice_date date,
  total_amount numeric,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'partial')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON invoices FOR SELECT USING (true);

-- PAYMENTS
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id),
  po_id uuid REFERENCES purchase_orders(id),
  payment_type text CHECK (payment_type IN ('cortina_to_dc', 'retailer_to_cortina')),
  payment_date date,
  amount numeric,
  deductions numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON payments FOR SELECT USING (true);

-- DOT INVENTORY
CREATE TABLE dot_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_batch_id uuid,
  sku text NOT NULL,
  product_id uuid REFERENCES products(id),
  on_hand int DEFAULT 0,
  incoming int DEFAULT 0,
  in_transit_to_retailer int DEFAULT 0,
  allocated int DEFAULT 0,
  weekly_velocity numeric,
  snapshot_date timestamptz DEFAULT now()
);
ALTER TABLE dot_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON dot_inventory FOR SELECT USING (true);

-- RAW MATERIALS
CREATE TABLE raw_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  quantity numeric DEFAULT 0,
  unit text NOT NULL DEFAULT 'lbs',
  lot_count int DEFAULT 0,
  expiry_status text DEFAULT 'good' CHECK (expiry_status IN ('good', 'almost_expired', 'partial_expired')),
  expired_quantity numeric DEFAULT 0,
  default_lead_days int DEFAULT 14,
  category text DEFAULT 'raw_material' CHECK (category IN ('raw_material', 'packaging', 'wip', 'finished_good')),
  last_upload_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE raw_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON raw_materials FOR SELECT USING (true);
CREATE POLICY "Ops/admin update" ON raw_materials FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

-- RAW MATERIAL SUPPLIERS (distributor/brand/cost/MOQ per ingredient)
CREATE TABLE raw_material_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_material_id uuid REFERENCES raw_materials(id) ON DELETE CASCADE,
  distributor text NOT NULL,
  brand text NOT NULL,
  cost_per_unit numeric NOT NULL,
  moq numeric DEFAULT 0,
  lead_time_days int NOT NULL,
  is_active boolean DEFAULT true,
  last_ordered date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE raw_material_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON raw_material_suppliers FOR SELECT USING (true);
CREATE POLICY "Finance/admin update pricing" ON raw_material_suppliers FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance'))
);
CREATE POLICY "All authorized insert" ON raw_material_suppliers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops'))
);

-- RAW MATERIAL ORDERS
CREATE TABLE raw_material_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_material_id uuid REFERENCES raw_materials(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES raw_material_suppliers(id),
  distributor text,
  brand text,
  quantity numeric NOT NULL,
  cost_per_unit numeric,
  order_date date NOT NULL,
  expected_delivery date,
  actual_delivery date,
  bol_reference text,
  source text DEFAULT 'manual' CHECK (source IN ('email', 'manual')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'delivered')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE raw_material_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON raw_material_orders FOR SELECT USING (true);
CREATE POLICY "Ops/admin insert" ON raw_material_orders FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

-- RAW MATERIAL LOTS (FIFO)
CREATE TABLE raw_material_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_material_id uuid REFERENCES raw_materials(id) ON DELETE CASCADE,
  lot_number text,
  quantity numeric NOT NULL,
  received_date date,
  expiry_date date,
  fifo_order int,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE raw_material_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON raw_material_lots FOR SELECT USING (true);

-- BILL OF MATERIALS
CREATE TABLE bill_of_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  raw_material_id uuid REFERENCES raw_materials(id) ON DELETE CASCADE,
  quantity_per_batch numeric NOT NULL,
  unit text DEFAULT 'lbs'
);
ALTER TABLE bill_of_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON bill_of_materials FOR SELECT USING (true);

-- INVENTORY ADJUSTMENTS
CREATE TABLE inventory_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_material_id uuid REFERENCES raw_materials(id) ON DELETE CASCADE,
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('shrink', 'expired', 'damaged', 'disposed', 'other')),
  quantity numeric NOT NULL,
  notes text,
  adjusted_by uuid REFERENCES user_profiles(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON inventory_adjustments FOR SELECT USING (true);
CREATE POLICY "Ops/admin insert" ON inventory_adjustments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

-- WEEKLY REPORTS
CREATE TABLE weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number text NOT NULL,
  report_date date,
  headline text,
  kpis jsonb,
  findings jsonb,
  todos jsonb,
  source_email text,
  source_subject text,
  received_at timestamptz,
  auto_generated boolean DEFAULT true,
  retailer_scope text DEFAULT 'Walmart',
  raw_email_data jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON weekly_reports FOR SELECT USING (true);

-- PO EMAILS
CREATE TABLE po_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  email_timestamp timestamptz,
  sender_name text,
  sender_org text,
  summary text,
  extracted_data jsonb,
  source text DEFAULT 'email',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE po_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON po_emails FOR SELECT USING (true);

-- AUDIT LOG
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id),
  timestamp timestamptz DEFAULT now(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  field_name text,
  old_value text,
  new_value text
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin/finance read" ON audit_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance'))
);
CREATE POLICY "All insert" ON audit_log FOR INSERT WITH CHECK (true);

-- UPLOAD LOG
CREATE TABLE upload_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_type text NOT NULL CHECK (upload_type IN ('dot', 'assemblers', 'qbo', 'netsuite', 'weekly_report')),
  filename text,
  uploaded_by uuid REFERENCES user_profiles(id),
  row_count int,
  status text DEFAULT 'processing' CHECK (status IN ('processing', 'complete', 'error')),
  errors jsonb,
  uploaded_at timestamptz DEFAULT now()
);
ALTER TABLE upload_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON upload_log FOR SELECT USING (true);

-- TRANSITIONS
CREATE TABLE transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transition_id text UNIQUE,
  from_sku text,
  to_sku text,
  from_name text,
  to_name text,
  transition_type text CHECK (transition_type IN ('spec_change', 'new_product', 'discontinuation')),
  launch_date date,
  cutoff_date date,
  status text DEFAULT 'planning' CHECK (status IN ('planning', 'in_progress', 'complete')),
  notes text,
  checklist jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON transitions FOR SELECT USING (true);

-- INDEXES
CREATE INDEX idx_po_retailer ON purchase_orders(retailer);
CREATE INDEX idx_po_ship_status ON purchase_orders(ship_status);
CREATE INDEX idx_po_line_items_po ON po_line_items(po_id);
CREATE INDEX idx_dot_inv_sku ON dot_inventory(sku);
CREATE INDEX idx_rm_code ON raw_materials(code);
CREATE INDEX idx_rms_material ON raw_material_suppliers(raw_material_id);
CREATE INDEX idx_rmo_material ON raw_material_orders(raw_material_id);
CREATE INDEX idx_bom_product ON bill_of_materials(product_id);
CREATE INDEX idx_adj_material ON inventory_adjustments(raw_material_id);
CREATE INDEX idx_audit_table ON audit_log(table_name);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX idx_weekly_week ON weekly_reports(week_number);
CREATE INDEX idx_po_emails_po ON po_emails(po_id);

-- UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_products BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_pos BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_rm BEFORE UPDATE ON raw_materials FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_rms BEFORE UPDATE ON raw_material_suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
