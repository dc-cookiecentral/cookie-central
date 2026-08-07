-- Cookie Central — sales reps are a LIST, not user accounts
--
-- The Salesperson dropdown read user_profiles, whose id is
-- `REFERENCES auth.users(id)`. That made every selectable rep a real login:
-- N dormant magic-link-capable accounts, each needing its own user_role_seeds
-- row or handle_new_auth_user silently provisions them as `ops` — a role that
-- reaches 34 tables including purchase_orders and production_runs.
--
-- Cortina has ONE person entering samples on behalf of their reps. The reps
-- themselves never sign in; the site only needs their name (to show, and to
-- send as CustomField1) and their email (to put in <BillTo><Email>, which is
-- what ShipStation notifies on). That is a lookup list, and modelling it as
-- authentication was the mistake.
--
-- A rep who leaves must not vanish from historical orders either, which an
-- auth.users FK invites — hence a plain table with an `active` flag.
--
-- Forward-only; applied via the Management API (no Docker locally).

CREATE TABLE IF NOT EXISTS sales_reps (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name  text NOT NULL,
  email      text NOT NULL UNIQUE,
  company    text,                       -- 'Cortina', 'Dirty Cookie', …
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at_sales_reps ON sales_reps;
CREATE TRIGGER set_updated_at_sales_reps BEFORE UPDATE ON sales_reps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE sales_reps ENABLE ROW LEVEL SECURITY;

-- Readable by any signed-in user: the dropdown needs it, and it holds nothing
-- more sensitive than a work name and address.
DROP POLICY IF EXISTS "Signed-in users can read sales reps" ON sales_reps;
CREATE POLICY "Signed-in users can read sales reps" ON sales_reps
  FOR SELECT USING (auth.role() = 'authenticated');

-- Managed by internal staff only. The single Cortina ordering account picks
-- from this list; it does not curate it.
DROP POLICY IF EXISTS "Staff manage sales reps" ON sales_reps;
CREATE POLICY "Staff manage sales reps" ON sales_reps
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

-- The shipment points at the rep. `salesperson_user_id` is left in place and
-- unused rather than dropped: SMP-TEST-1044 is live in ShipStation and still
-- resolves through it, and the export falls back to it so that order keeps
-- exporting identically. Drop it once no rows reference it.
ALTER TABLE sample_shipments
  ADD COLUMN IF NOT EXISTS sales_rep_id uuid REFERENCES sales_reps(id);

CREATE INDEX IF NOT EXISTS idx_sample_shipments_sales_rep ON sample_shipments(sales_rep_id);

INSERT INTO sales_reps (full_name, email, company) VALUES
  ('Caroline Friedrich', 'caroline@dirtycookie.com', 'Dirty Cookie')
ON CONFLICT (email) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      company   = EXCLUDED.company,
      active    = true;
