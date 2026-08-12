-- Cookie Central — a switch Dirty Cookie can flip without a deploy
--
-- First use: cold-chain season. Through the summer every sample ships cold
-- regardless of what is in the box, so the site's derived temp — Cold only when
-- a Raw item is present — tells the sales team "Ambient" about a parcel going
-- out on ice.
--
-- Why a table rather than a `VITE_` flag: every other switch in this project is
-- build-time (VITE_SAMPLE_TEST_MODE, SHIPMENT_NO_FLOOR) and flipping one means
-- a redeploy. A season turns twice a year and the person who notices the weather
-- is not necessarily the person who can deploy. This reads live.
--
-- Deliberately NOT sent to ShipStation. Only `temp_override` reaches the export
-- (CustomField3), and ADR-037 keeps that blank unless a HUMAN overrode, so a
-- rule can match non-blank as "someone made a call here". Writing seasonal Cold
-- there would make it non-blank on every summer order and destroy the signal.
-- The ShipStation half of this is a blanket seasonal automation rule, which
-- needs no per-order flag precisely because it applies to everything.
--
-- Key/value with a jsonb payload: the next setting should not need a migration
-- for a column. `sample_` prefix because this repo hosts two unrelated projects
-- and the other one has its own concerns (see sample-site/CLAUDE.md).
--
-- Forward-only; applied via the Management API (no Docker locally).

CREATE TABLE IF NOT EXISTS sample_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE sample_settings IS
  'Live switches for Sample Central. Read by any signed-in user; written by admin/ops only.';

ALTER TABLE sample_settings ENABLE ROW LEVEL SECURITY;

-- Everyone signed in reads it: the builder needs the value to derive temp, and
-- the Cortina ordering account must see WHY its order says Cold.
DROP POLICY IF EXISTS "Signed-in users can read settings" ON sample_settings;
CREATE POLICY "Signed-in users can read settings" ON sample_settings
  FOR SELECT USING (auth.role() = 'authenticated');

-- Written by Dirty Cookie only. Cold-chain season is a policy decision about
-- product handling and cost, not something the ordering account should set.
DROP POLICY IF EXISTS "Staff manage settings" ON sample_settings;
CREATE POLICY "Staff manage settings" ON sample_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

-- Seeded false so the switch exists before anyone looks for it. Turning it on is
-- a deliberate act, and defaulting to "everything is cold" would quietly upgrade
-- every order's handling on day one.
INSERT INTO sample_settings (key, value) VALUES ('cold_chain_season', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Verify:
--   select key, value, updated_at from sample_settings;
