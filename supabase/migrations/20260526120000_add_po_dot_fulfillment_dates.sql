-- Cookie Central — DOT fulfillment dates on purchase_orders
--
-- The PO pipeline runs: production ready → ship to DOT → DOT receives →
-- DOT ships to retailer → retailer DC receives (MABD). The schema already
-- tracks the retailer-facing dates (ship_date_*, delivery_date, mabd) but not
-- the upstream Dirty-Cookie → DOT leg. These three columns close that gap.

ALTER TABLE purchase_orders ADD COLUMN ship_to_dot_date date;    -- planned ship to DOT (manual or MABD − DOT transit)
ALTER TABLE purchase_orders ADD COLUMN ship_to_dot_actual date;  -- actual ship to DOT (late vs planned → flagged red in UI)
ALTER TABLE purchase_orders ADD COLUMN dot_receipt_date date;    -- DOT-confirmed receipt (DOT portal or email)
