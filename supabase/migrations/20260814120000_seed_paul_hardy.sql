-- Cookie Central — seed Paul Hardy (President, Dirty Cookie)
--
-- Two unrelated things, both needed, in one file because they land together:
-- a **login** (user_role_seeds) and a **dropdown entry** (sales_reps). Neither
-- implies the other — that separation is the whole point of ADR-042 — but Paul
-- both signs in and is a person orders are placed on behalf of, so he needs
-- one of each. Caroline and David Landeck have exactly this pair.
--
-- ⚠️ THIS MUST EXIST BEFORE HIS FIRST SIGN-IN. `handle_new_auth_user` reads
-- `COALESCE(seed.role, 'ops')`, so an unseeded first sign-in provisions him as
-- **`ops`** — and because that insert is `ON CONFLICT (id) DO NOTHING`, seeding
-- afterwards does **not** correct it; the only fix is a manual UPDATE, once
-- someone notices. Seeding first makes the hazard unreachable.
--
-- Role is `admin`, deliberately NOT `ops` or `cortina`. He is the President and
-- is meant to see everything: `cortina` is gated to Sample Central alone by the
-- InternalOnly route wrapper (ADR-024, migration 20260715180000), and `ops`
-- reaches 34 tables but no admin surface. `admin` is the same call made for
-- Caroline (20260806235500) and for the same reason.
--
-- Email `paul@dirtycookie.com` — confirmed with Caroline Aug 14 2026, and it
-- matches the first-name pattern of the two existing Dirty Cookie addresses
-- (caroline@, david@). A near-miss here is the failure mode this migration
-- exists to prevent: signing in with any other spelling provisions as `ops`.
--
-- The `sales_reps` row makes him selectable in the Salesperson picker, which is
-- what puts his address in `<BillTo><Email>` — the only address ShipStation
-- notifies on (ADR-038). Third Dirty Cookie entry, 28 reps total.
--
-- Forward-only; applied via the Management API (no Docker locally).

INSERT INTO user_role_seeds (email, full_name, role, title) VALUES
  ('paul@dirtycookie.com', 'Paul Hardy', 'admin', 'Dirty Cookie · President')
ON CONFLICT (email) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role      = EXCLUDED.role,
      title     = EXCLUDED.title;

-- Back-fill: a no-op today (no auth.users row exists yet), but keeps the
-- migration correct if it is ever re-run after a sign-in — and repairs the
-- `ops` mis-provision described above should it somehow have happened first.
-- Matches the pattern used for the systems@, caroline@ and samplesmngmt@ seeds.
INSERT INTO user_profiles (id, email, full_name, role, title)
SELECT u.id, u.email, 'Paul Hardy', 'admin', 'Dirty Cookie · President'
FROM auth.users u
WHERE u.email = 'paul@dirtycookie.com'
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role      = EXCLUDED.role,
      title     = EXCLUDED.title;

INSERT INTO sales_reps (full_name, email, company) VALUES
  ('Paul Hardy', 'paul@dirtycookie.com', 'Dirty Cookie')
ON CONFLICT (email) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      company   = EXCLUDED.company,
      active    = true;

-- Verify:
--   select email, role, title from user_role_seeds where email = 'paul@dirtycookie.com';
--   -- expect one row, role 'admin'.
--   select count(*) from sales_reps where active;   -- expect 28.
