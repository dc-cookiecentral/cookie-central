-- Cookie Central — seed the Cortina sales rep roster
--
-- Source: "Cortina OF Sales Mktg Innovations Supplier Partners List.xlsx"
-- (Employee Directory sheet, 26 rows), supplied Aug 10 2026 as the complete
-- list of Cortina salespeople. These populate the Salesperson dropdown on the
-- sample checkout; the selected rep's email becomes <BillTo><Email>, which is
-- the address ShipStation notifies (ADR-038). No app change was needed for
-- that — `buildOrderXml` already emits `sales_rep.email` into BillTo Email and
-- CustomerCode, and `full_name` into CustomField1.
--
-- Still a lookup list, NOT auth (migration 20260807000500). None of these
-- people get a login, a user_profiles row or a role. That is the entire point
-- of the table: 25 selectable reps here would have been 25 dormant
-- magic-link-capable accounts under the old design.
--
-- Three deliberate transforms from the source file:
--
--   1. Names title-cased — lowercased, then each word's first letter raised.
--      The file mixes "AGARWAL, AMIT K" with "David Rahal"; the dropdown both
--      displays and ORDERS BY full_name, so unnormalised it would sort by
--      surname for half the list and given name for the other half. Note this
--      flattens the internal capital in "LiDestri" to "Lidestri" — per
--      Caroline, uniform casing beats per-name special cases.
--
--   2. Emails lowercased. The file mixes case (`AAgarwal@CortinaFoods.com`);
--      Postgres UNIQUE on text is case-SENSITIVE, so mixed case would let the
--      same mailbox in twice under different casing.
--
--   3. 25 rows, not 26. `murgese@cortinafoods.com` appears TWICE in the file
--      under two different names — "Cope, Maria Antonietta" and "Mery Urgese".
--      email is UNIQUE and both people are to be selectable, so the mailbox
--      gets ONE row carrying both names. Selecting it notifies that mailbox
--      either way, which is what the source file asserts; only the CustomField1
--      label is imprecise. Split into two rows if Cortina confirms two people
--      with two addresses.
--
-- company is 'Cortina' for every row, including the six @onefrozen.com
-- addresses (One Frozen treated as part of the Cortina group, per Caroline).
--
-- Three name/email mismatches were checked and left as the file has them —
-- they read as name changes or preferred names, not typos, and the EMAIL is
-- the operative field since it is what receives the shipment notification:
--   • Alexa C Flynn    → ahill@            (surname differs)
--   • Scott C Robbins  → crobbins@         (initial differs)
--   • Heather Sandford → heather.sanford@  (one 'd')
-- If a rep reports never receiving a notification, start here.
--
-- Forward-only; applied via the Management API (no Docker locally).

INSERT INTO sales_reps (full_name, email, company) VALUES
  ('Amit K Agarwal',                    'aagarwal@cortinafoods.com',        'Cortina'),
  ('David A Bernhardt',                 'dbernhardt@cortinafoods.com',      'Cortina'),
  ('Sarah Blaine',                      'sblaine@cortinafoods.com',         'Cortina'),
  ('Marci J Clark',                     'mclark@cortinafoods.com',          'Cortina'),
  ('Maria Antonietta Cope / Mery Urgese','murgese@cortinafoods.com',        'Cortina'),
  ('Xiomara A Daza',                    'xdaza@cortinafoods.com',           'Cortina'),
  ('Alexa C Flynn',                     'ahill@cortinafoods.com',           'Cortina'),
  ('Jessica P Lidestri',                'jesslidestri@cortinafoods.com',    'Cortina'),
  ('Michael Simon',                     'msimon@cortinafoods.com',          'Cortina'),
  ('Karl Sutaria',                      'ksutaria@cortinafoods.com',        'Cortina'),
  ('David Rahal',                       'david@cortinafoods.com',           'Cortina'),
  ('John C. Lidestri',                  'jlidestri@cortinafoods.com',       'Cortina'),
  ('Melissa Elms',                      'melissa.elms@onefrozen.com',       'Cortina'),
  ('Desiree Hopkins',                   'desiree.hopkins@onefrozen.com',    'Cortina'),
  ('Jane A Lucas',                      'jane.lucas@onefrozen.com',         'Cortina'),
  ('Craig Monaco',                      'craig.monaco@onefrozen.com',       'Cortina'),
  ('Scott C Robbins',                   'crobbins@onefrozen.com',           'Cortina'),
  ('Heather Sandford',                  'heather.sanford@onefrozen.com',    'Cortina'),
  ('Felipe Lavados',                    'flavados@cortinafoods.com',        'Cortina'),
  ('Liz Tierney Garrity',               'lgarrity@cortinafoods.com',        'Cortina'),
  ('Keresa Duke',                       'kduke@cortinafoods.com',           'Cortina'),
  ('Meghan Bailey',                     'mbailey@cortinafoods.com',         'Cortina'),
  ('Michael Christiansen',              'mchristiansen@cortinafoods.com',   'Cortina'),
  ('Chris Posner',                      'cposner@cortinafoods.com',         'Cortina'),
  ('Timothy Kitzman',                   'timothy.kitzman@cortinafoods.com', 'Cortina')
ON CONFLICT (email) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      company   = EXCLUDED.company,
      active    = true;

-- Caroline and David Landeck (Dirty Cookie) are untouched — they are internal,
-- not Cortina, and remain in the dropdown alongside these.
--
-- Verify:
--   select company, count(*) from sales_reps group by company;
--   -- expect Cortina 25, Dirty Cookie 2.
