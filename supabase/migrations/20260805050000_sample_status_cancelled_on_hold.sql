-- Sample Central — let a shipment be `cancelled` or `on_hold`
--
-- ShipStation owns fulfilment state, and until now the site had no way to
-- represent two states it can put an order into. A cancelled order showed as
-- awaiting fulfilment indefinitely and a salesperson would chase a shipment
-- that no longer existed.
--
-- These are NOT pipeline stages — the pipeline stays
-- submitted → processing → shipped → delivered. They are exceptions that sit
-- off it, which is why the UI keeps them out of the progress stepper.
--
-- The `shipstation-deliverby` sweep writes them, reading ShipStation every 15
-- minutes (see `syncedStatus` in `_shared/shipstation.ts`). The mapping is
-- reversible: releasing a hold in ShipStation returns the order to `submitted`.
--
-- NOT auto-deployed — paste into the SQL editor (RUNBOOK §7).

alter table sample_shipments drop constraint if exists sample_shipments_status_check;

alter table sample_shipments add constraint sample_shipments_status_check
  check (status in ('submitted', 'processing', 'shipped', 'delivered', 'cancelled', 'on_hold'));

-- Verify:
--   select status, count(*) from sample_shipments group by status order by 1;
