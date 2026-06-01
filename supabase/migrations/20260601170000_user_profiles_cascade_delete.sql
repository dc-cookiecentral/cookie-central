-- Cookie Central — cascade user_profiles when auth.users is deleted
--
-- The initial schema declared user_profiles.id REFERENCES auth.users(id)
-- without ON DELETE CASCADE, so any attempt to delete a user from the
-- Supabase Auth dashboard fails with a foreign-key violation. Switch the
-- constraint to ON DELETE CASCADE so dashboard deletes clean both rows
-- together — semantically correct (a profile without its auth user is dead
-- weight) and unblocks routine ops.

ALTER TABLE user_profiles
  DROP CONSTRAINT user_profiles_id_fkey,
  ADD CONSTRAINT user_profiles_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
