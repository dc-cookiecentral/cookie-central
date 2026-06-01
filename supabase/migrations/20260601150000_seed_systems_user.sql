-- Cookie Central — seed systems@dirtycookie.com as admin
--
-- The operational email (POs, BOLs, confirmations; AI agent reads this) is
-- the default sign-in identity for demo and ongoing system access. Adds it
-- to user_role_seeds so the handle_new_auth_user trigger creates the
-- user_profiles row with admin role on first sign-in, and back-fills any
-- existing auth.users row from the same email.

INSERT INTO user_role_seeds (email, full_name, role, title) VALUES
  ('systems@dirtycookie.com', 'Systems (Dirty Cookie)', 'admin', 'Operational email · system account')
ON CONFLICT (email) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role      = EXCLUDED.role,
      title     = EXCLUDED.title;

-- Back-fill: if an auth.users row already exists for this email (e.g. a
-- previous magic-link sign-in landed before this seed), create / update its
-- user_profiles row now so we don't depend on a second sign-in.
INSERT INTO user_profiles (id, email, full_name, role, title)
SELECT u.id, u.email, 'Systems (Dirty Cookie)', 'admin', 'Operational email · system account'
FROM auth.users u
WHERE u.email = 'systems@dirtycookie.com'
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role      = EXCLUDED.role,
      title     = EXCLUDED.title;
