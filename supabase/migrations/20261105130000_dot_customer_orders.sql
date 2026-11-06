-- Cookie Central — DOT order status, from DOT's "Customer Order Details"
-- export (first copy received 2026-11-05). Parsed by
-- src/parsers/dotCustomerOrders.js.
--
-- ── What it is ────────────────────────────────────────────────────────────
-- A STATUS SNAPSHOT of DOT orders to Walmart GDCs, not a history: every order
-- DOT is working or has just finished, with its status (Open → Picking →
-- Loaded → Delivered), requested / appointment / departure / arrival dates,
-- ordered, shipped and cut cases with a cut REASON, and — on "Lot Detail"
-- rows — the lot code and expiry DOT picked.
--
-- What the other DOT exports do not have:
--   · the OPEN pipeline — orders not yet shipped (75 of 131 lines in the first
--     file); Consignment Sales History only lists shipped lines;
--   · the lot and expiry that went out, i.e. remaining shelf life at ship;
--   · a cut reason column (empty in the first file, which had no cuts).
-- First file: 131 order lines (127 DOT orders, order dates Oct 5 – Nov 4
-- 2026), 2,437 cs; 64 lot lines whose picked cases equal the line's shipped
-- cases on all 56 lines that carry lots.
--
-- ── One row per DOT order × DOT item ──────────────────────────────────────
-- Each upload UPSERTS, so a line's status moves forward as orders progress.
-- A line that drops out of a later report keeps its last status and
-- `last_seen_at`; read status together with that timestamp.
-- `shipped_cases` on an Open / Picking line is DOT's planned quantity, not a
-- shipment — trust it as shipped only once status is Loaded or Delivered.
-- Lots ride along as jsonb: [{ lot, expiry, cases }].
--
-- Forward-only.

CREATE TABLE IF NOT EXISTS dot_customer_orders (
  dot_order_number         text NOT NULL,
  dot_item_number          text NOT NULL,
  sku                      text,                 -- WC | PBG | CCF | BC (null if unmapped)
  manufacturer_number      text,                 -- case GTIN for the doughs, Walmart item for CCF / BC
  item_description         text,
  customer_po              text,                 -- Walmart PO, leading zeros kept
  customer_name            text,                 -- e.g. "Walmart/Gdc #6057"
  customer_location        text,                 -- "Robert, La"
  originating_dc           text,                 -- DOT DC, e.g. "Mt. Sterling, Il"
  load_number              text,

  order_status             text,                 -- Open | Picking | Loaded | Delivered | …
  order_date               date,
  order_week               int,                  -- Walmart week holding order_date
  requested_delivery_date  date,
  requested_week           int,                  -- Walmart week holding requested_delivery_date
  appointment_date         date,
  dc_departure_date        date,                 -- "Servicing DC Departure Date"
  customer_arrival_date    date,
  customer_departure_date  date,
  reconciled_date          date,

  ordered_cases            numeric NOT NULL DEFAULT 0,
  shipped_cases            numeric NOT NULL DEFAULT 0,
  cut_cases                numeric NOT NULL DEFAULT 0,
  cut_reason               text,

  lots                     jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{lot, expiry, cases}]
  earliest_expiry_picked   date,

  upload_id                uuid REFERENCES upload_log(id),
  first_seen_at            timestamptz DEFAULT now(),
  last_seen_at             timestamptz DEFAULT now(),
  PRIMARY KEY (dot_order_number, dot_item_number)
);
CREATE INDEX IF NOT EXISTS idx_dco_status ON dot_customer_orders (order_status);
CREATE INDEX IF NOT EXISTS idx_dco_requested_week ON dot_customer_orders (requested_week);
CREATE INDEX IF NOT EXISTS idx_dco_po ON dot_customer_orders (customer_po);

ALTER TABLE dot_customer_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read" ON dot_customer_orders FOR SELECT USING (true);
CREATE POLICY "Internal write" ON dot_customer_orders FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles
                  WHERE id = auth.uid() AND role IN ('admin','finance','ops')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles
                  WHERE id = auth.uid() AND role IN ('admin','finance','ops')));

-- ── upload_log: allow upload_type='dot_customer_orders' ───────────────────
ALTER TABLE upload_log DROP CONSTRAINT IF EXISTS upload_log_upload_type_check;
ALTER TABLE upload_log ADD CONSTRAINT upload_log_upload_type_check
  CHECK (upload_type IN ('dot','assemblers','production','qbo','netsuite','weekly_report',
                         'cortina_po','ingredient_master','walmart_orders',
                         'retail_link','retail_link_otif','retail_link_supply_plan',
                         'dot_order_history','dot_inventory_snapshot',
                         'dot_consignment_sales','dot_customer_orders'));
