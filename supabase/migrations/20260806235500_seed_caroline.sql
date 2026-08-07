-- Cookie Central — seed caroline@dirtycookie.com as admin
--
-- Caroline had no auth.users row, no user_profiles row and no seed, so her
-- first magic-link sign-in would have hit `COALESCE(seed.role, 'ops')` in
-- handle_new_auth_user and provisioned her as **ops** — which is both too much
-- (34 tables, incl. purchase_orders / production_runs / cortina_invoices) and
-- too little (no admin surfaces) for the person running the project. The
-- trigger is ON CONFLICT (id) DO NOTHING, so it never corrects itself; the only
-- fix afterwards is a manual UPDATE, once someone notices.
--
-- Role is `admin`, deliberately NOT `cortina`. The cortina role is gated to
-- Sample Central by the InternalOnly route wrapper (ADR-024 / migration
-- 20260715180000), so it would lock her out of the inventory and production
-- side of the repo she also works on. The single Cortina *ordering* account is
-- a separate person and a separate seed, still outstanding.
--
-- `active_in_dropdown` defaults true, so this also makes her selectable in the
-- Salesperson field on the sample checkout — the first entry in that list.
-- Sample Central maps the selected salesperson's email into <BillTo><Email>,
-- which is what ShipStation sends customer notifications to.
--
-- Forward-only; applied via the Management API (no Docker locally).

INSERT INTO user_role_seeds (email, full_name, role, title) VALUES
  ('caroline@dirtycookie.com', 'Caroline Friedrich', 'admin', 'Sample Central · project owner')
ON CONFLICT (email) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role      = EXCLUDED.role,
      title     = EXCLUDED.title;

-- Back-fill: harmless today (no auth.users row exists yet) but keeps the
-- migration correct if it is ever re-run after a sign-in, matching the pattern
-- used for the systems@ seed.
INSERT INTO user_profiles (id, email, full_name, role, title)
SELECT u.id, u.email, 'Caroline Friedrich', 'admin', 'Sample Central · project owner'
FROM auth.users u
WHERE u.email = 'caroline@dirtycookie.com'
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role      = EXCLUDED.role,
      title     = EXCLUDED.title;
