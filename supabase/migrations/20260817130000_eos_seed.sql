-- Cookie Central — EOS seed: the June 18, 2026 foundation session
--
-- Extracted verbatim from "Dirty_Cookie_EOS_Foundation.pages" — the tables in
-- that document, cell for cell, not a retyping. Owner strings are kept exactly
-- as written ('OPEN', 'HIRE #1', 'Shahira + Dave', 'Caro' vs 'Caroline') so the
-- first Level 10 opens on the document the team actually agreed to. Clean them
-- up in the app, not here.
--
-- Idempotent: every insert is ON CONFLICT DO NOTHING against a natural key, so
-- replaying this never duplicates a seat, a measurable or an issue. It also
-- never overwrites edits made in the app, which is the behaviour you want from
-- a seed the team starts editing on day one.
--
-- Forward-only; applied via the Management API (no Docker locally).

-- ── Accountability Chart ─────────────────────────────────────────────────
INSERT INTO eos_seats (major_function, seat, owner, accountable_for, sort_order) VALUES
  ('Leadership', 'Visionary', 'Shahira', 'Big ideas · Big relationships · Culture · Problem solving · Speaking engagements / events', 10),
  ('Leadership', 'Integrator', 'Paul (PJ)', 'Lead, Manage & Accountable for Leadership Team (LMA) · Harmoniously integrates all functions · Process & goal completion · Execute business plan / drive · P&L', 20),
  ('Sales', 'Biz Dev', 'OPEN', 'Owns the overall channel-goal number. Channels report below.', 30),
  ('Sales', 'Private Label', 'Marc', 'Goal $15M — Walmart $8M, Trader Joe’s $5M, All Other $2M', 40),
  ('Sales', 'Food Service', 'Marc', 'Goal $2M — Disney most profitable account', 50),
  ('Sales', 'Corp Gifting', 'Serina', 'Goal $500K — sampling driven', 60),
  ('Sales', 'Retail', 'HIRE #1', 'Goal $2M — develop + launch, 5 regional gems (+100 stores)', 70),
  ('Sales', 'Club', 'Sean', 'Goal $500K run rate', 80),
  ('Sales', 'Account Management', 'OPEN', 'Cortina · Broker · Samples · Data / sales analysis', 90),
  ('Sales', 'Samples', 'Caroline', 'Cookie Central | all samples out of Kukibell', 100),
  ('Sales', 'Cortina', 'Marc', 'Lynchpin between Cortina and Dirty Cookie', 110),
  ('Sales', 'Broker', 'HIRE #1', 'Net-new brokers; Cortina brokers go through Marc', 120),
  ('Sales', 'Data & Analysis', 'HIRE #2', '(to be defined)', 130),
  ('Sales', 'Sales Ops', 'HIRE #2', 'Customer service · Sample orders · Complaints · Order to cash · Cookie Central', 140),
  ('Operations', 'Planning', 'Paul (PJ)', 'Weekly S&OE · Monthly S&OP · Forecast · Production plan · Inventory · MRP · Cookie Central', 150),
  ('Operations', 'Purchasing', 'HIRE #3', 'Planner · Contracts · Spec · Quality · Cost · Ingredient traceability', 160),
  ('Operations', 'QA', 'HIRE #3', 'R&D/FS · Track production · Cut every lot · Retains · DOT · Quality response · PL specs', 170),
  ('Operations', 'Production', 'HIRE #3', 'Co-manufacturer management (e.g. Fresh Coast)', 180),
  ('Operations', 'Logistics', 'Caroline', 'E-commerce + corp gifting shipping', 190),
  ('Finance', 'Bookkeeping', 'Ellen', 'Cash ↔ AP/AR · Planning (cash / forecast)', 200),
  ('Finance', 'Costing', 'Ellen', 'Controls · Assumptions · Logic', 210),
  ('Finance', 'Monthly Reporting', 'Ellen', '4/4/5, 1 wk after close: Income, Cash, BS, Aging, Payroll, GM report', 220)
ON CONFLICT (major_function, seat) DO NOTHING;

-- ── Rocks — Q3 2026 (the quarter the foundation session set) ─────────────
INSERT INTO eos_rocks (quarter, seq, title, owner, notes, sort_order)
SELECT * FROM (VALUES
  ('2026-Q3', 1, 'Create & execute sales strategy w/ Cortina', 'Marc', NULL, 10),
  ('2026-Q3', 2, 'Hire + onboard Biz Dev hunter', 'Sean', 'Bob Convo', 20),
  ('2026-Q3', 3, '“What are we making?” — general strategy on branded cookies', 'Shahira', '4-pk · Cookie shots', 30),
  ('2026-Q3', 4, 'Manufacturing strategy', 'Dave', 'Production Facility', 40),
  ('2026-Q3', 5, 'Cookie Central + Update order pipeline (samples, wholesale, corp)', 'Caro', 'Cookie Central launched', 50),
  ('2026-Q3', 6, 'Define & implement SOP', 'Paul', NULL, 60)
) AS v(quarter, seq, title, owner, notes, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM eos_rocks e WHERE e.quarter = v.quarter AND e.seq = v.seq);

-- ── Weekly Scorecard measurables ─────────────────────────────────────────
-- goal_value is deliberately NULL on every row: the source document says to
-- baseline 3-4 weeks of real numbers before locking weekly goals. Set them
-- in the app once the baseline is in — no migration needed.
INSERT INTO eos_scorecard_metrics (name, owner, notes, unit, goal_direction, is_primary, sort_order) VALUES
  ('Weekly Sales', 'Caro', 'Volume & revenue', 'usd', 'gte', true, 10),
  ('Sales Pipeline', 'Dave', 'New business', 'usd', 'gte', true, 20),
  ('Cash Balance & Forecast', 'Ellen', NULL, 'usd', 'gte', true, 30),
  ('Innovation Tracking', 'Shahira', '% complete vs target · R/Y/G', 'percent', 'gte', true, 40),
  ('Service Level', 'PJ', 'Order fulfillment', 'percent', 'gte', false, 50),
  ('Sample Service Level', 'Caro', 'Fulfillment of sample requests', 'percent', 'gte', false, 60),
  ('AP / AR', 'Ellen', 'Days outstanding', 'days', 'lte', false, 70),
  ('Inventory', 'PJ', 'FG, Raw, Pkg → days on hand', 'days', 'lte', false, 80),
  ('Cookie Central Utilization', 'Caro', '% orders, etc.', 'percent', 'gte', false, 90),
  ('QA / Customer Complaints', 'Caro', NULL, 'number', 'lte', false, 100)
ON CONFLICT (name) DO NOTHING;

-- ── Issues List ──────────────────────────────────────────────────────────
INSERT INTO eos_issues (title, owner, status, sort_order)
SELECT * FROM (VALUES
  ('No comprehensive source of truth for products', 'OPEN', 'open', 10),
  ('New coating for cookie shot molds', 'OPEN', 'open', 20),
  ('DOT returns @ Summit ($400K)', 'Marc', 'open', 30),
  ('SBA Loan ($700K → $200K, terms)', 'OPEN', 'open', 40),
  ('Marc’s Apple', 'Marc', 'open', 50),
  ('Kukibell SOPs — Samples, Corp Gifting', 'OPEN', 'open', 60),
  ('Kroger re-engagement?', 'Marc', 'open', 70),
  ('Real Estate', 'Paul', 'open', 80),
  ('Pricing', 'Caroline', 'open', 90),
  ('Legal (Trucking)', 'Paul', 'open', 100),
  ('Contract', 'Paul', 'open', 110),
  ('Brandon', 'Shahira + Dave', 'open', 120),
  ('Cortina (Chris)', 'Shahira + Dave', 'open', 130),
  ('Get Mike G / Sell Snapdragon (for HIRE #2 role)', 'OPEN', 'open', 140),
  ('Returned product', 'OPEN', 'open', 150),
  ('Finalize clean-label cookie recipes & print film', 'OPEN', 'open', 160),
  ('Marketing', 'OPEN', 'open', 170),
  ('Overdependence on one major retailer / customer', 'OPEN', 'open', 180),
  ('Cookie dough sticking to trays', 'OPEN', 'open', 190),
  ('Manufacturing', 'OPEN', 'open', 200),
  ('Tech (A.I.)', NULL, 'parked', 210),
  ('Walmart / Kroger PL learnings', NULL, 'parked', 220),
  ('Chef’s Whse', NULL, 'parked', 230),
  ('Corp Gifting roles — operational simplicity', NULL, 'parked', 240),
  ('Sample / value add', NULL, 'parked', 250),
  ('Sales comp structure', NULL, 'parked', 260),
  ('What is Cortina selling? (priorities, comms, rules of engagement, MOQs)', NULL, 'parked', 270),
  ('What equipment do we own?', NULL, 'parked', 280),
  ('Where are ALL our contracts?', NULL, 'parked', 290),
  ('Design new cookie shot', NULL, 'parked', 300),
  ('Detailed understanding of FC capacity', NULL, 'parked', 310),
  ('Cookie Central triage', NULL, 'parked', 320),
  ('Ellen pay structure', NULL, 'parked', 330),
  ('Cookie shot w/ ice cream', NULL, 'parked', 340),
  ('Cortina syndicated data?', NULL, 'parked', 350),
  ('Aging inventory', NULL, 'parked', 360),
  ('So many domains — Shopify', NULL, 'parked', 370)
) AS v(title, owner, status, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM eos_issues e WHERE e.title = v.title);

-- ── Next Steps, from the document, as To-Dos ─────────────────────────────
-- The four "Next Steps" the session closed on. They are process work rather
-- than Rocks, which is what the To-Do list is for.
INSERT INTO eos_todos (title, owner)
SELECT * FROM (VALUES
  ('Finalize the quarter''s Rocks — one owner, measurable, and due date each.', 'Paul (PJ)'),
  ('Fill or assign coverage for the OPEN seats; treat the hardest as hiring Rocks.', 'Paul (PJ)'),
  ('Begin running the Scorecard weekly; baseline 3-4 weeks, then set goals.', 'Caroline'),
  ('Stand up a weekly Level 10 Meeting — the standing rhythm that runs the Accountability Chart, Rocks, Scorecard, and Issues together.', 'Paul (PJ)')
) AS v(title, owner)
WHERE NOT EXISTS (SELECT 1 FROM eos_todos e WHERE e.title = v.title);
