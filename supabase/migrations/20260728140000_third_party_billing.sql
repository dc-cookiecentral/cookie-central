-- Cookie Central — third-party shipping billing on sample shipments
--
-- Some accounts want samples billed to THEIR carrier account rather than Dirty
-- Cookie's. The salesperson captures the details at order time; the co-man keys
-- them in when buying the label.
--
-- ⚠️ INFORMATIONAL ONLY. ShipStation's Custom Store XML has no third-party
-- billing element (no billToParty / billToAccount / billToPostalCode — those
-- exist in ShipStation's REST API, not the store feed). The export therefore
-- carries these as text in CustomField3 plus an InternalNotes echo, and
-- ShipStation will NOT bill the account automatically. Whoever buys the label
-- must select third-party billing and enter the account by hand.
--
-- All four columns are nullable: they are only meaningful together, and only
-- when third_party_billing is true. The app requires all three details before it
-- will accept a submit with the box ticked — enforced app-side rather than by a
-- CHECK, so that historical rows are never invalidated by a later rule change.
--
-- Forward-only; safe to re-run.

ALTER TABLE sample_shipments
  ADD COLUMN IF NOT EXISTS third_party_billing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tp_carrier     text,   -- 'FedEx' | 'UPS' | 'USPS' | 'DHL'
  ADD COLUMN IF NOT EXISTS tp_account     text,   -- the account number to bill
  ADD COLUMN IF NOT EXISTS tp_postal_code text;   -- postal code on file for that account

-- Verify:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'sample_shipments'
--      and column_name like 'tp_%' or column_name = 'third_party_billing'
--    order by column_name;
--   -- expect 4 rows; third_party_billing NOT NULL default false, the rest nullable.
