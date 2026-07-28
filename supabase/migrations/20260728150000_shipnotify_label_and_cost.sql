-- Cookie Central — capture LabelCreateDate and ShippingCost from shipnotify
--
-- The ShipNotice payload carries more than we were reading (Custom Store
-- Development Guide, ShipNotify Field Definitions). Two fields are worth landing:
--
-- 1. `label_created_at` <- <LabelCreateDate>. `<ShipDate>` is DATE-ONLY
--    (`10/19/2019`), so `shipped_at` currently loses time-of-day. LabelCreateDate
--    is a full `MM/dd/yyyy HH:mm` timestamp of when the label was actually bought.
--
-- 2. `shipping_cost` <- <ShippingCost>. Samples are unpriced by design
--    (UnitPrice 0.00, OrderTotal 0.00), so this is the ONLY place the real cost
--    of the sampling programme is visible anywhere in the system.
--
-- Both nullable: they only exist once a label has been bought, and older rows
-- pre-date the capture.
--
-- Forward-only; safe to re-run.

ALTER TABLE sample_shipments
  ADD COLUMN IF NOT EXISTS label_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS shipping_cost    numeric(10,2);

-- Verify:
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_name = 'sample_shipments'
--      and column_name in ('label_created_at','shipping_cost')
--    order by column_name;
--   -- expect 2 rows, both nullable.
--
--   select shipment_no, shipped_at, label_created_at, shipping_cost
--     from sample_shipments where tracking_number is not null;
