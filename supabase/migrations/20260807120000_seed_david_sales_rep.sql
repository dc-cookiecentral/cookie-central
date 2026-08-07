-- Cookie Central — add David Landeck to the sales rep list
--
-- Second entry in the Salesperson dropdown, after Caroline. The point is a
-- second live recipient for the ShipStation buyer notifications: the selected
-- rep's email is what the export puts in <BillTo><Email>, and that is the only
-- address ShipStation notifies on. One recipient proves the template renders;
-- two proves it is the *selection* driving the address, not a constant
-- somewhere in the export.
--
-- `sales_reps` is a lookup list, NOT auth (migration 20260807000500) — this
-- creates no login and touches no role. David already has an admin seed in
-- user_role_seeds from 20260601160000 under the same address; the two are
-- unrelated tables and neither implies the other.
--
-- Email is david@dirtycookie.com — the surviving address from the demo-time
-- consolidation that dropped the dlandeck@ and dave@ aliases (20260601160000).
--
-- The row was added by hand in the Supabase dashboard on Aug 7 2026; this file
-- exists so a rebuild from migrations reproduces it. ON CONFLICT makes it a
-- no-op against the live database.
--
-- Forward-only; applied via the Management API (no Docker locally).

INSERT INTO sales_reps (full_name, email, company) VALUES
  ('David Landeck', 'david@dirtycookie.com', 'Dirty Cookie')
ON CONFLICT (email) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      company   = EXCLUDED.company,
      active    = true;
