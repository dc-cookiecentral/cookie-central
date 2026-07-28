-- Cookie Central — add the 'cortina' role
--
-- Phase 2, Task 2.7 (role gate, DB half). The app gate (InternalOnly route
-- wrapper, role-aware Sidebar + AppSwitcher) routes the Cortina sales role to
-- Sample Central only; this makes 'cortina' a valid role value so those users
-- can be provisioned and pass the sample-table RLS checks (which already name
-- 'cortina'). Resolves ADR-024 open item (a).
--
-- Widens the role CHECK on both user_profiles and user_role_seeds. Seed a Cortina
-- user by adding them to user_role_seeds with role='cortina' before first sign-in;
-- the handle_new_auth_user trigger then provisions their profile with that role.
--
-- Forward-only; applied manually via the Supabase SQL editor.

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_role_check CHECK (role IN ('admin', 'finance', 'ops', 'cortina'));

ALTER TABLE user_role_seeds DROP CONSTRAINT IF EXISTS user_role_seeds_role_check;
ALTER TABLE user_role_seeds
  ADD CONSTRAINT user_role_seeds_role_check CHECK (role IN ('admin', 'finance', 'ops', 'cortina'));

-- Verify:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conname in ('user_profiles_role_check','user_role_seeds_role_check');
--   -- both should list 'cortina'.
