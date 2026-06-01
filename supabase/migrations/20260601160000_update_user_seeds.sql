-- Cookie Central — update user_role_seeds for the new sign-in roster
--
-- Demo-time consolidation:
--   • Shahira  — shahira@dirtycookie.com           (was smarei@thedirtycookieoc.com)
--   • David    — david@dirtycookie.com only        (drops dlandeck@ + dave@ aliases)
--   • Paul     — paul@dirtycookie.com (new)
--   • Systems  — systems@dirtycookie.com           (admin — set in prior migration;
--                                                   Caroline accesses here)
--   • Maria    — removed for now (re-add when she's ready to onboard)
--   • Caroline — removed; signs in via systems@dirtycookie.com instead
--
-- All four primary humans + the systems identity become admin. Seeds drive
-- the role assigned to new sign-ins via handle_new_auth_user; existing
-- user_profiles rows are also reconciled if any user has already signed in.

-- Drop stale seeds (old Shahira email, David's two aliases, Maria, Caroline).
DELETE FROM user_role_seeds
WHERE email IN (
  'smarei@thedirtycookieoc.com',
  'dlandeck@dirtycookie.com',
  'dave@dirtycookie.com',
  'support@dirtycookie.com',
  'carolinesfriedrich@gmail.com'
);

-- Drop the existing Caroline user_profiles row so she can't sign in directly
-- (she'll access via systems@dirtycookie.com). auth.users row is left alone
-- — harmless; user_profiles is what role-gates every RLS check.
DELETE FROM user_profiles WHERE email = 'carolinesfriedrich@gmail.com';

-- Insert / upsert the new roster. ON CONFLICT keeps the migration idempotent
-- and lets us promote existing seeds (e.g. systems@ from admin → admin no-op).
INSERT INTO user_role_seeds (email, full_name, role, title) VALUES
  ('shahira@dirtycookie.com', 'Shahira Marei',      'admin', 'CEO / Founder'),
  ('david@dirtycookie.com',   'David Landeck',      'admin', 'Biz Exec'),
  ('paul@dirtycookie.com',    'Paul',               'admin', 'Biz Exec')
ON CONFLICT (email) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      role      = EXCLUDED.role,
      title     = EXCLUDED.title;

-- Reconcile any user_profiles rows that already exist for these humans —
-- harmless no-op if they haven't signed in yet. Matches by email so it
-- catches the case where someone signed in with an old alias.
UPDATE user_profiles SET role = 'admin' WHERE email = 'shahira@dirtycookie.com';
UPDATE user_profiles SET role = 'admin' WHERE email = 'david@dirtycookie.com';
UPDATE user_profiles SET role = 'admin' WHERE email = 'paul@dirtycookie.com';
