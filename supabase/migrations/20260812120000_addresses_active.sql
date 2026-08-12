-- Cookie Central — retire an address without destroying history
--
-- The Address Book had no way to remove a mistyped ship-to: it stayed in the
-- dropdown forever and got picked again. Editing it in place was the obvious
-- fix and is the wrong one, for two reasons:
--
--   1. It reads as "change the order". Addresses are copied into ShipStation at
--      import, so editing one here does NOT alter an order the co-man already
--      holds. Offering an edit invites someone to fix a shipment that has
--      already gone out and believe it worked. Orders are changed by talking to
--      the Dirty Cookie team, not by editing a row here.
--   2. Shipments JOIN to the address rather than snapshotting it, so an edit
--      silently rewrites where past samples appear to have gone.
--
-- A hard DELETE is worse still. `sample_shipments_address_id_fkey` is NO ACTION,
-- so deleting a used address raises a foreign-key error the user cannot act on —
-- and if it ever did succeed for an order not yet pulled, the Custom Store
-- export (which joins the address at pull time) would find nothing, fail its
-- State/zip validation and silently skip the order. Silent skips are the exact
-- failure mode this project has been bitten by repeatedly.
--
-- So: `active`. "Delete" in the UI clears this flag. The address vanishes from
-- the picker and the Address Book, every past shipment still renders and still
-- exports correctly, and the user re-adds a corrected version as a new entry.
-- Same pattern as sales_reps (ADR-042).
--
-- Forward-only; applied via the Management API (no Docker locally).

ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN addresses.active IS
  'False = retired. Hidden from the picker and the Address Book; still joined by past shipments and by the ShipStation export, which resolves the address at pull time.';

-- The picker asks exactly one question.
CREATE INDEX IF NOT EXISTS idx_addresses_active ON addresses (active) WHERE active;

-- Verify:
--   select count(*) filter (where active) as live, count(*) as total from addresses;
