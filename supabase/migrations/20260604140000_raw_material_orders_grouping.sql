-- Cookie Central — formal reorder POs grouped by distributor/brand
--
-- Reorder "Confirm" now generates one formal PO per distributor+brand, each
-- containing the line items for that combo. We keep one raw_material_orders row
-- per material (the schema is one-material-per-row) but tag every row in a PO
-- with a shared order_group_id so the rows read back as a single order.
--
-- Also widen the status lifecycle: ordered (placed) → shipped (in transit) →
-- delivered (received). The inventory view colour-codes incoming by status.

ALTER TABLE raw_material_orders ADD COLUMN IF NOT EXISTS order_group_id uuid;

-- Replace the status CHECK (added inline in the initial schema) with the wider
-- lifecycle. Drop by discovered name so this is robust to the auto-generated
-- constraint name.
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'raw_material_orders'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE raw_material_orders DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE raw_material_orders
  ADD CONSTRAINT raw_material_orders_status_check
  CHECK (status IN ('pending', 'confirmed', 'ordered', 'shipped', 'delivered'));

CREATE INDEX IF NOT EXISTS idx_rmo_group ON raw_material_orders(order_group_id);
