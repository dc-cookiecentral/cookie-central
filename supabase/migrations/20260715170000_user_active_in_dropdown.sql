-- Cookie Central — user_profiles.active_in_dropdown
--
-- Phase 2, Task 2.2. Controls who appears in Sample Central's salesperson
-- dropdown. Only active_in_dropdown = true users are selectable for a NEW
-- shipment; setting it false hides someone from new selection only. Past
-- shipments still render the salesperson name — they store salesperson_user_id
-- and join to user_profiles for display regardless of this flag.
--
-- (user_profiles.email is already present + NOT NULL — order confirmations pull
-- it, since the salesperson selection is the recipient. No change needed there.)
--
-- Forward-only; applied manually via the Supabase SQL editor.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS active_in_dropdown boolean NOT NULL DEFAULT true;

-- Verify:
--   select email, role, active_in_dropdown from user_profiles order by email;
