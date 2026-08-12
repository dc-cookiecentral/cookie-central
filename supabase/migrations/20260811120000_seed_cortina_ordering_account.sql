-- Cookie Central — seed the Cortina sample-ordering account
--
-- `samplesmngmt@cortinafoods.com` ("Samples Management") is the ONE Cortina
-- login for Sample Central. It places sample orders on behalf of the sales
-- team; the 25 reps themselves never sign in and have no accounts (ADR-042).
--
-- ⚠️ THIS MUST EXIST BEFORE THEIR FIRST SIGN-IN. `handle_new_auth_user` reads
-- `COALESCE(seed.role, 'ops')`, so an unseeded first sign-in provisions this
-- account as internal **`ops`** — a role reaching 34 tables including
-- `purchase_orders`, `production_runs` and `cortina_invoices`, i.e. the whole
-- operations side of a different project. And because that insert is
-- `ON CONFLICT (id) DO NOTHING`, seeding afterwards does **not** correct it;
-- the only fix is a manual UPDATE, once someone notices. Seeding first makes
-- the hazard unreachable.
--
-- Role is `cortina`, deliberately NOT `ops` or `admin`. The `cortina` role is
-- gated to Sample Central by the InternalOnly route wrapper (ADR-024,
-- migration 20260715180000) plus sample-table RLS, so this account can see and
-- write sample orders and nothing else. That containment is the entire reason
-- the role exists.
--
-- It is an ordering account, NOT a rep: no `sales_reps` row. Reps are the
-- people this account selects *from* in the Salesperson dropdown, and the
-- selected rep's email — not this one — receives the ShipStation notification.
--
-- Address spelling confirmed with Caroline Aug 11 2026 against the four docs
-- that already carry it (SHIPSTATION_SETUP_CHECKLIST §7, SENIOR_REVIEW,
-- EXTENSION_BUILD_PLAN, CORTINA_ROSTER_QUESTIONS). Note the `n`:
-- samples-m-n-gmt. A near-miss here is the failure mode this migration exists
-- to prevent, since signing in with the other spelling provisions as `ops`.
--
-- Forward-only; applied via the Management API (no Docker locally).

INSERT INTO user_role_seeds (email, full_name, role, title) VALUES
  ('samplesmngmt@cortinafoods.com', 'Samples Management', 'cortina', 'Cortina · sample ordering account')
ON CONFLICT (email) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role      = EXCLUDED.role,
      title     = EXCLUDED.title;

-- Back-fill: a no-op today (no auth.users row exists yet), but keeps the
-- migration correct if it is ever re-run after a sign-in — and repairs the
-- `ops` mis-provision described above should it somehow have happened first.
-- Matches the pattern used for the systems@ and caroline@ seeds.
INSERT INTO user_profiles (id, email, full_name, role, title)
SELECT u.id, u.email, 'Samples Management', 'cortina', 'Cortina · sample ordering account'
FROM auth.users u
WHERE u.email = 'samplesmngmt@cortinafoods.com'
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role      = EXCLUDED.role,
      title     = EXCLUDED.title;

-- Verify:
--   select email, role, title from user_role_seeds where email like '%cortinafoods%';
--   -- expect one row, role 'cortina'.
