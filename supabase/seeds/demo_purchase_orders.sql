-- Cookie Central — demo Product Orders seed (7 POs from the prototype).
--
-- ONE-TIME SEED, not a schema migration. Lives in supabase/seeds/ so it
-- doesn't auto-deploy and is easy to delete when real Cortina NetSuite data
-- replaces it. Idempotent via ON CONFLICT (po_number) DO NOTHING.
--
-- Maps prototype payment_status to canonical schema values:
--   paid_national → paid_cortina    (Cortina paid DC, stage 1 done)
--   paid_dc       → paid_retailer   (retailer paid Cortina, both stages done)
--   awaiting_walmart → awaiting_retailer
--   pending       → pending
--
-- Dates align with the prototype's May 2026 timeline. Today is 2026-06-01;
-- pending POs (PO14371 + PO14400) shifted slightly forward so MABD risk
-- alerts surface.

INSERT INTO purchase_orders (
  po_number, retailer, order_date, mabd,
  ship_date_original, ship_date_actual,
  ship_to_dot_date, ship_to_dot_actual, dot_receipt_date,
  destination_dc, ship_status, payment_status, payment_terms,
  carrier, freight_handler, bol_received, invoice_number,
  total_cases, total_amount, paid_amount,
  nova_changes, email_count, revenue_per_case
) VALUES
  ('PO14371', 'Kroger',  '2026-05-08', '2026-06-08',
   '2026-06-04', NULL,
   '2026-06-01', NULL, NULL,
   'Kroger DC Shelbyville IN', 'pending', 'pending', 'Due on receipt',
   NULL, NULL, false, NULL,
   504, 15724.80, 0,
   NULL, 2, 31.20),

  ('PO14400', 'Kroger',  '2026-05-14', '2026-06-15',
   '2026-06-10', NULL,
   '2026-06-07', NULL, NULL,
   'Kroger DC Forest Park GA', 'pending', 'pending', 'Due on receipt',
   NULL, NULL, false, NULL,
   504, 15724.80, 0,
   NULL, 2, 31.20),

  ('PO14326', 'Walmart', '2026-04-23', '2026-05-13',
   '2026-05-06', '2026-04-29',
   '2026-05-03', '2026-04-27', '2026-04-28',
   'Walmart DC', 'shipped', 'paid_cortina', 'Net 30/60',
   'SunTeck TTS', 'Cortina', true, 'INV-4326',
   720, 2160.00, 0,
   'Ship date pulled forward May 6 to Apr 29', 7, 3.00),

  ('PO14331', 'Walmart', '2026-04-24', '2026-04-28',
   '2026-04-27', '2026-04-27',
   '2026-04-24', '2026-04-24', '2026-04-25',
   'Walmart DC', 'delivered', 'paid_cortina', 'Net 30/60',
   'SunTeck TTS', 'Cortina', true, 'INV-4331',
   480, 1440.00, 1440.00,
   NULL, 2, 3.00),

  ('PO14290', 'Walmart', '2026-04-18', '2026-05-09',
   '2026-04-20', '2026-04-20',
   '2026-04-17', '2026-04-17', '2026-04-18',
   'DC #6057', 'delivered', 'paid_cortina', 'Net 30/60',
   'SunTeck TTS', 'Cortina', true, 'INV-4290',
   960, 2880.00, 2880.00,
   NULL, 3, 3.00),

  ('PO14255', 'Walmart', '2026-04-14', '2026-05-02',
   '2026-04-16', '2026-04-16',
   '2026-04-13', '2026-04-13', '2026-04-14',
   'DC #7022', 'delivered', 'paid_retailer', 'Net 30/60',
   'SunTeck TTS', 'Cortina', true, 'INV-4255',
   1440, 4320.00, 4320.00,
   'Qty adjusted from 1500 to 1440 via NOVA', 5, 3.00),

  ('PO14201', 'Walmart', '2026-04-08', '2026-04-28',
   '2026-04-10', '2026-04-10',
   '2026-04-07', '2026-04-07', '2026-04-08',
   'DC #6057', 'delivered', 'awaiting_retailer', 'Net 30/60',
   'SunTeck TTS', 'Cortina', true, 'INV-4201',
   720, 2160.00, 0,
   NULL, 4, 3.00)
ON CONFLICT (po_number) DO NOTHING;

-- Line items — joined back to the POs we just inserted via po_number.
INSERT INTO po_line_items (po_id, sku, quantity_cases, unit_cost, line_total)
SELECT po.id, lines.sku, lines.qty, lines.cost, lines.qty * lines.cost
FROM (VALUES
  ('PO14371', 'WCCB-KF', 504, 31.20),
  ('PO14400', 'WCCB-KF', 504, 31.20),
  ('PO14326', 'WCCB',    480, 3.00),
  ('PO14326', 'PBG',     240, 3.00),
  ('PO14331', 'WCCB',    480, 3.00),
  ('PO14290', 'WCCB',    576, 3.00),
  ('PO14290', 'PBG',     384, 3.00),
  ('PO14255', 'WCCB',    864, 3.00),
  ('PO14255', 'PBG',     576, 3.00),
  ('PO14201', 'WCCB',    432, 3.00),
  ('PO14201', 'PBG',     288, 3.00)
) AS lines(po_number, sku, qty, cost)
JOIN purchase_orders po ON po.po_number = lines.po_number
WHERE NOT EXISTS (
  SELECT 1 FROM po_line_items pl
  WHERE pl.po_id = po.id AND pl.sku = lines.sku
);

-- Email threads — only the three POs that have meaningful conversation in
-- the prototype. timestamp uses ISO 8601 with Z so the audit_log/timeline
-- math doesn't drift across timezones.
INSERT INTO po_emails (po_id, email_timestamp, sender_name, sender_org, summary, extracted_data, source)
SELECT po.id, em.ts::timestamptz, em.sender, em.org, em.summary, em.extracted::jsonb, 'manual'
FROM (VALUES
  -- PO14326 — the rich thread (7 emails)
  ('PO14326', '2026-04-23T13:46:00Z', 'Noah LiDestri',    'Cortina',  'PO issued',                          '{"shipDate":"2026-05-06"}'),
  ('PO14326', '2026-04-23T16:00:00Z', 'Marc Bouthillette','DC',       'Ready, requests earlier ship',       '{"readyDate":"2026-04-27"}'),
  ('PO14326', '2026-04-24T19:37:00Z', 'Marc Bouthillette','DC',       'Cortina handles freight',            '{"freight":"Cortina"}'),
  ('PO14326', '2026-04-25T02:38:00Z', 'Harshita Gedela', 'Cortina',   'Checking buyer',                     '{"revisedShip":"2026-04-29"}'),
  ('PO14326', '2026-04-28T20:32:00Z', 'Martin Gogoski',  'SunTeck',   'BOL attached',                       '{"carrier":"SunTeck TTS"}'),
  ('PO14326', '2026-04-29T18:15:00Z', 'Maria Restrepo',  'DC Ops',    'Pallets handed off to SunTeck',      '{"palletCount":12}'),
  ('PO14326', '2026-05-02T14:00:00Z', 'Harshita Gedela', 'Cortina',   'Cortina cleared payment to DC',      '{"amount":2160,"status":"paid_cortina"}'),

  -- PO14371 — Kroger PO (2 emails)
  ('PO14371', '2026-05-08T16:03:00Z', 'Harshita Gedela', 'Cortina',   'PO issued. Kroger WCCB 504cs.',      '{"shipDate":"2026-06-04","dest":"Kroger Shelbyville IN","total":15724.80}'),
  ('PO14371', '2026-05-08T17:40:00Z', 'Maria Restrepo',  'DC Ops',    'Confirmed.',                         '{"status":"Confirmed"}'),

  -- PO14400 — second Kroger (2 emails)
  ('PO14400', '2026-05-14T14:21:00Z', 'Noah LiDestri',   'Cortina',   'PO issued. Kroger WCCB 504cs.',      '{"shipDate":"2026-06-10","dest":"Kroger Forest Park GA","total":15724.80}'),
  ('PO14400', '2026-05-14T14:38:00Z', 'Maria Restrepo',  'DC Ops',    'Confirmed.',                         '{"status":"Confirmed"}')
) AS em(po_number, ts, sender, org, summary, extracted)
JOIN purchase_orders po ON po.po_number = em.po_number
WHERE NOT EXISTS (
  SELECT 1 FROM po_emails pe
  WHERE pe.po_id = po.id AND pe.email_timestamp::text = em.ts::timestamptz::text
);

-- A couple of itemised payment events so /payments/PO14331 + /payments/PO14255
-- show event tables on top of their timeline.
INSERT INTO payments (po_id, payment_type, payment_date, amount, deductions, notes)
SELECT po.id, p.ptype, p.pdate::date, p.amt, p.deduct, p.notes
FROM (VALUES
  ('PO14331', 'cortina_to_dc',       '2026-05-15', 1440.00, 0.00, 'Cortina cleared on terms'),
  ('PO14290', 'cortina_to_dc',       '2026-05-18', 2880.00, 0.00, 'Cortina cleared on terms'),
  ('PO14255', 'cortina_to_dc',       '2026-05-06', 4320.00, 0.00, 'Cortina cleared'),
  ('PO14255', 'retailer_to_cortina', '2026-05-30', 4320.00, 0.00, 'Walmart 60d settle')
) AS p(po_number, ptype, pdate, amt, deduct, notes)
JOIN purchase_orders po ON po.po_number = p.po_number
WHERE NOT EXISTS (
  SELECT 1 FROM payments pp WHERE pp.po_id = po.id AND pp.payment_date = p.pdate::date AND pp.payment_type = p.ptype
);
