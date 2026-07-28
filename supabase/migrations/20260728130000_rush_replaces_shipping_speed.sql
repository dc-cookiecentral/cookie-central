-- Cookie Central — rush flag replaces shipping speed; box spec retired
--
-- Reverses the 3-tier `shipping_speed` selector added by 20260727120000 (one day
-- earlier) and replaces it with a plain `rush` boolean.
--
-- WHY. The tier only ever expressed a *preference*: the export sent it as
-- <ShippingMethod>, ShipStation mapped it, and the co-man still chose the actual
-- service at label purchase. So the app was asking the salesperson to make a
-- decision that did not bind anything downstream. What the salesperson actually
-- knows — and what nobody downstream can infer — is whether an order is urgent.
-- `rush` captures that, and drives a notification to the team.
--
-- <ShippingMethod> is now omitted from the export entirely (the XSD marks it
-- minOccurs="0"), so service selection sits wholly with ShipStation.
--
-- `box_spec` is dropped too: box choice moves to ShipStation, and it was
-- occupying CustomField1, which `rush` now uses.
--
-- Lineage, for anyone reading this in six months:
--   rush (bool)          -> dropped 20260726120000, superseded by requested_service
--   requested_service    -> dropped 20260727120000, superseded by shipping_speed
--   shipping_speed       -> dropped here, superseded by rush (bool) again
-- The round trip is deliberate, not thrash: the first `rush` meant "ship fast"
-- and was correctly replaced by an explicit service. This one means "tell the
-- team" — a different question that speed never answered, since a 2-day order can
-- be urgent and an overnight one routine.
--
-- Forward-only; safe to re-run.

ALTER TABLE sample_shipments
  ADD COLUMN IF NOT EXISTS rush boolean NOT NULL DEFAULT false;

ALTER TABLE sample_shipments
  DROP COLUMN IF EXISTS shipping_speed,
  DROP COLUMN IF EXISTS box_spec;

-- Verify:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'sample_shipments'
--      and column_name in ('rush','shipping_speed','box_spec')
--    order by column_name;
--   -- expect 1 row: rush, boolean, NO, false.
