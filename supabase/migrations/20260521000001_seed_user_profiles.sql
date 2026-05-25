-- Cookie Central — Seed user_profiles via auth.users trigger
--
-- user_profiles.id references auth.users(id), so rows can't exist until each
-- person signs in via magic link. This migration:
--   1. Creates a `user_role_seeds` mapping (email → full_name, role, title).
--   2. Pre-fills it with the 6 initial users from docs/PEOPLE.md.
--   3. Installs a trigger on auth.users so that when someone signs in for the
--      first time, their user_profiles row is auto-created with the right role.
--
-- Paul's email is TBD; insert as a placeholder so we don't block — update later.

CREATE TABLE IF NOT EXISTS user_role_seeds (
  email text PRIMARY KEY,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'finance', 'ops')),
  title text
);
ALTER TABLE user_role_seeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All can read seeds" ON user_role_seeds FOR SELECT USING (true);

INSERT INTO user_role_seeds (email, full_name, role, title) VALUES
  ('smarei@thedirtycookieoc.com',     'Shahira Marei',      'admin',   'CEO / Founder'),
  ('marc@dirtycookie.com',            'Marc Bouthillette',  'ops',     'COO'),
  ('dlandeck@dirtycookie.com',        'David Landeck',      'finance', 'Biz Exec'),
  ('dave@dirtycookie.com',            'David Landeck',      'finance', 'Biz Exec'),
  ('support@dirtycookie.com',         'Maria Restrepo',     'ops',     'Ops'),
  ('carolinesfriedrich@gmail.com',    'Caroline Friedrich', 'admin',   'Consultant — BD Venture Studio')
ON CONFLICT (email) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role      = EXCLUDED.role,
      title     = EXCLUDED.title;

-- Trigger: on new auth.users row, create matching user_profiles row.
-- If no seed exists, default to 'ops' so the user can still sign in;
-- admin can change role later.
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seed user_role_seeds%ROWTYPE;
BEGIN
  SELECT * INTO seed FROM user_role_seeds WHERE email = NEW.email;

  INSERT INTO user_profiles (id, email, full_name, role, title)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(seed.full_name, split_part(NEW.email, '@', 1)),
    COALESCE(seed.role, 'ops'),
    seed.title
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- Backfill: if any auth.users already exist (e.g. created manually in dashboard),
-- create their user_profiles rows now using the seed mapping.
INSERT INTO user_profiles (id, email, full_name, role, title)
SELECT
  u.id,
  u.email,
  COALESCE(s.full_name, split_part(u.email, '@', 1)),
  COALESCE(s.role, 'ops'),
  s.title
FROM auth.users u
LEFT JOIN user_role_seeds s ON s.email = u.email
ON CONFLICT (id) DO NOTHING;
