-- ─────────────────────────────────────────────────────────────────────────
-- Supplies: PO fulfillment + pickup freight, assumed cost, landed actual cost
-- (docs/SUPPLIES_SPEC.md, "V1.2 — landed cost")
--
--   supply_pos               — one row per purchase order: picked up or
--                              delivered; for a pickup, the packing slip and
--                              the freight we pay to bring it in
--   quotes.po_id             — which PO a PO/invoice line belongs to
--   supply_items.assumed_cost — the planning assumption, TYPED: $/lb for
--                              ingredients, $/1,000 for packaging. It is an
--                              assumption, not a document price, so it is the
--                              one cost figure that is entered by hand.
--   v_po_line_cost           — per PO/invoice line: pickup freight split by
--                              weight, landed $/lb and $/1,000 (computed)
--   v_item_cost              — per item: assumed vs actual (latest PO line,
--                              landed) and the ±5% variance flag (computed)
--
-- Freight split: a pickup PO's freight is shared across its lines by weight
-- (qty × unit_weight_lbs). If no line on the PO has a weight, it is split
-- evenly per line. A vendor SO that confirms the same PO for the same SKU
-- doesn't add weight twice: only the latest line per (PO, SKU) counts toward
-- the PO's total.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS supply_pos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL UNIQUE,
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  po_date date,
  fulfillment text CHECK (fulfillment IN ('pickup', 'delivered')),
  packing_slip_ref text,
  ship_date date,
  freight_cost numeric(12, 2) CHECK (freight_cost >= 0),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  -- freight we pay in transit only exists for a pickup
  CONSTRAINT supply_pos_freight_only_on_pickup CHECK (freight_cost IS NULL OR fulfillment = 'pickup')
);

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS po_id uuid REFERENCES supply_pos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS quotes_po_id_idx ON quotes (po_id);

ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS assumed_cost numeric(12, 4) CHECK (assumed_cost >= 0);
COMMENT ON COLUMN supply_items.assumed_cost IS
  'Planning assumption, typed: $/lb (ingredient) or $/1,000 (packaging). Compared with actual landed cost in v_item_cost.';

-- ── RLS, audit, updated_at: same rules as the other supplies tables ────────
ALTER TABLE supply_pos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal read" ON supply_pos;
CREATE POLICY "Internal read" ON supply_pos FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance', 'ops'))
);
DROP POLICY IF EXISTS "Ops/admin insert" ON supply_pos;
CREATE POLICY "Ops/admin insert" ON supply_pos FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
DROP POLICY IF EXISTS "Ops/admin update" ON supply_pos;
CREATE POLICY "Ops/admin update" ON supply_pos FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);
DROP POLICY IF EXISTS "Ops/admin delete" ON supply_pos;
CREATE POLICY "Ops/admin delete" ON supply_pos FOR DELETE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
);

DROP TRIGGER IF EXISTS audit_supply_pos ON supply_pos;
CREATE TRIGGER audit_supply_pos AFTER INSERT OR UPDATE OR DELETE ON supply_pos
  FOR EACH ROW EXECUTE FUNCTION log_supplies_changes();
DROP TRIGGER IF EXISTS set_updated_at_supply_pos ON supply_pos;
CREATE TRIGGER set_updated_at_supply_pos BEFORE UPDATE ON supply_pos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── v_po_line_cost: one row per PO/invoice line ───────────────────────────
DROP VIEW IF EXISTS v_item_cost;
DROP VIEW IF EXISTS v_po_line_cost;

CREATE VIEW v_po_line_cost
  WITH (security_invoker = true) AS
WITH lines AS (
  SELECT
    q.id                      AS quote_id,
    q.po_id,
    q.sku_id,
    s.item_id,
    i.kind,
    q.doc_type,
    q.doc_ref,
    q.doc_date,
    s.units_per_thousand,
    sum(b.qty * s.unit_weight_lbs)                   AS line_lbs,
    sum(b.qty * coalesce(s.units_per_order_unit, 1)) AS line_units,
    sum(b.price_per_order_qty)                       AS line_price
  FROM quotes q
  JOIN supply_skus s  ON s.id = q.sku_id
  JOIN supply_items i ON i.id = s.item_id
  LEFT JOIN quote_breaks b ON b.quote_id = q.id
  WHERE q.doc_type IN ('po', 'invoice')
  GROUP BY q.id, s.id, i.id
),
current_lines AS (
  SELECT DISTINCT ON (po_id, sku_id) po_id, line_lbs
  FROM lines
  WHERE po_id IS NOT NULL
  ORDER BY po_id, sku_id, doc_date DESC NULLS LAST, quote_id
),
po_basis AS (
  SELECT po_id, sum(line_lbs) AS po_lbs, count(*) AS po_lines
  FROM current_lines
  GROUP BY po_id
),
shared AS (
  SELECT
    l.*,
    p.po_number,
    p.fulfillment,
    p.packing_slip_ref,
    p.ship_date,
    p.freight_cost,
    pb.po_lbs,
    CASE
      WHEN p.fulfillment = 'pickup' AND p.freight_cost IS NOT NULL THEN
        CASE WHEN pb.po_lbs > 0 THEN round(p.freight_cost * coalesce(l.line_lbs, 0) / pb.po_lbs, 2)
             ELSE round(p.freight_cost / pb.po_lines, 2) END
    END AS freight_share
  FROM lines l
  LEFT JOIN supply_pos p ON p.id = l.po_id
  LEFT JOIN po_basis pb  ON pb.po_id = l.po_id
)
SELECT
  *,
  line_price + coalesce(freight_share, 0) AS landed_total,
  CASE WHEN kind = 'ingredient' AND line_lbs > 0
       THEN round(line_price / line_lbs, 4) END                                AS price_per_lb,
  CASE WHEN kind = 'ingredient' AND line_lbs > 0
       THEN round((line_price + coalesce(freight_share, 0)) / line_lbs, 4) END AS landed_per_lb,
  CASE WHEN kind = 'packaging' AND line_units > 0
       THEN round(1000 * (line_price + coalesce(freight_share, 0)) / line_units, 2) END AS landed_per_thousand
FROM shared;

-- ── v_item_cost: assumed vs actual (latest PO/invoice line, landed) ────────
-- variance_pct = (assumed − actual) / actual; flagged at ±5% or more.
CREATE VIEW v_item_cost
  WITH (security_invoker = true) AS
SELECT
  i.id   AS item_id,
  i.kind,
  i.assumed_cost,
  a.quote_id                 AS actual_quote_id,
  a.doc_ref                  AS actual_doc_ref,
  a.doc_date                 AS actual_doc_date,
  a.actual_cost,
  a.freight_share IS NOT NULL AS actual_includes_freight,
  CASE WHEN i.assumed_cost IS NOT NULL AND a.actual_cost > 0
       THEN round((i.assumed_cost - a.actual_cost) / a.actual_cost, 4) END AS variance_pct,
  coalesce(i.assumed_cost IS NOT NULL AND a.actual_cost > 0
           AND abs(i.assumed_cost - a.actual_cost) >= 0.05 * a.actual_cost, false) AS variance_flag
FROM supply_items i
LEFT JOIN LATERAL (
  SELECT c.quote_id, c.doc_ref, c.doc_date, c.freight_share,
         CASE WHEN i.kind = 'ingredient' THEN c.landed_per_lb ELSE c.landed_per_thousand END AS actual_cost
  FROM v_po_line_cost c
  WHERE c.item_id = i.id
    AND (CASE WHEN i.kind = 'ingredient' THEN c.landed_per_lb ELSE c.landed_per_thousand END) IS NOT NULL
  ORDER BY c.doc_date DESC NULLS LAST, c.quote_id
  LIMIT 1
) a ON true;
