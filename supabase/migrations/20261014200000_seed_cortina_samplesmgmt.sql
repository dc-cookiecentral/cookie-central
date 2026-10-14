-- Cookie Central — correct the Cortina ordering account to samplesmgmt@ (no `n`)
--
-- Migration 20260811120000 seeded the Cortina sample-ordering account as
-- `samplesmngmt@cortinafoods.com` (with an `n`). Caroline confirmed Oct 14 2026
-- that the real address is **`samplesmgmt@cortinafoods.com` — no `n`**. The
-- Aug 11 spelling was the typo, not the Aug 19 account.
--
-- Because the seed lookup in `handle_new_auth_user` is exact equality, the real
-- address never matched: on Oct 14 2026 it signed up and
-- `COALESCE(seed.role, 'ops')` provisioned it as internal **`ops`** (POs,
-- payments, inventory, audit log) — the same failure as Aug 19, which was
-- "fixed" by recreating the account under the wrong spelling.
--
-- This migration:
--   1. seeds the correct spelling as `cortina`;
--   2. repairs the existing profile `ops` → `cortina` (the trigger inserts
--      `ON CONFLICT (id) DO NOTHING`, so the seed alone would not);
--   3. deletes the wrong `samplesmngmt@` seed so it can't be copied again.
--      No account exists under that spelling.
--
-- `cortina` is redirected to /sample-central by InternalOnly (App.jsx) and is
-- held to the sample tables by RLS.

INSERT INTO user_role_seeds (email, full_name, role, title) VALUES
  ('samplesmgmt@cortinafoods.com', 'Samples Management', 'cortina', 'Cortina · sample ordering account')
ON CONFLICT (email) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role      = EXCLUDED.role,
      title     = EXCLUDED.title;

INSERT INTO user_profiles (id, email, full_name, role, title)
SELECT u.id, u.email, 'Samples Management', 'cortina', 'Cortina · sample ordering account'
FROM auth.users u
WHERE lower(u.email) = 'samplesmgmt@cortinafoods.com'
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role      = EXCLUDED.role,
      title     = EXCLUDED.title;

DELETE FROM user_role_seeds WHERE email = 'samplesmngmt@cortinafoods.com';

-- Verify:
--   select email, role from user_profiles   where email ilike '%cortina%';
--   select email, role from user_role_seeds where email ilike '%cortina%';
--   -- expect exactly one row each: samplesmgmt@cortinafoods.com → cortina.
