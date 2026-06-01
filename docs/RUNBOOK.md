# Cookie Central — Operations Runbook

Procedures and known-fixes for keeping Cookie Central live. Read top-to-bottom once; reach back when something specific breaks. Symptoms in **bold** mean "ctrl-F this when it happens."

---

## 1 · Sign in

The login screen at `/login` offers two methods:

- **Magic link** (default) — enter email → click the link in the email. Throttled to ~3-4 sends/hour on the default Supabase SMTP. The first time someone signs in, the `handle_new_auth_user` trigger creates their `user_profiles` row using the role assigned in `user_role_seeds`.
- **Password** (fallback) — for demos, SMTP outages, or users who'd rather skip email. Pre-provision the user in **Supabase dashboard → Auth → Users → Add user** with a password set and **Auto-confirm** ticked.

After sign-in the sidebar footer shows full name + role. If it's missing, the profile row wasn't created — run the trigger-rebuild query in §5.4.

---

## 2 · Common operations

### 2.1 · Upload a file

All uploads go through `/uploads`. Drag a file onto its origin card (Cortina, Assemblers, QuickBooks); the pipeline parses, previews, and only commits after **Import**.

| Origin | File | Lands in |
|---|---|---|
| Cortina | NetSuite PO export (.csv/.xlsx) | `purchase_orders` + `po_line_items` |
| Cortina | DOT portal CSV | `dot_inventory` (snapshot rows tagged by `snapshot_date`) |
| Assemblers | **One** multi-sheet workbook (Production / Reject / Inventory / Shipment / N Job sheets) | `production_runs` + `production_pallets` + `production_subcomponents` + `production_rejects` + `lot_shipments` + `raw_materials` + `raw_material_lots` |
| QuickBooks | Invoices/payments CSV | `invoices` + `payments` |

Every upload writes one row to `upload_log` with `status='processing'` → `complete` (or `error`). Watch the table at the bottom of `/uploads` — if an import errored, the row carries the error message.

### 2.2 · Adjust inventory (raw materials / packaging)

`/inventory → By Product` → pick a raw material → **Adjust Inventory** → reason + quantity + notes → Confirm. Writes one row to `inventory_adjustments`, decrements `raw_materials.quantity`, and writes an explicit `audit_log` row. FG adjustments are NOT done here — they flow through Cortina/DOT.

### 2.3 · Place a reorder (preview mode)

`/inventory → Reorder` shows suggested quantities (70% 8-wk velocity + 30% open POs). Marc edits the override column, picks distributor + brand, **Confirm** writes `raw_material_orders` rows with `status='pending'`. The Landing flow below picks up pending orders when stock arrives — Marc records lot numbers + expiry → writes `raw_material_lots` (1:many off the order) and closes the order.

### 2.4 · Add a distributor or brand

`/reference → Raw Materials` → pick material → **+ Add Distributor**. Saves to `raw_material_suppliers`. Future reorders will see it in the dropdown.

### 2.5 · Start a transition

`/reference → Transitions → + New`. The standard 6-step checklist is added automatically (UPC, NetSuite, packaging, Assemblers, DOT, depletion plan). Checkboxes toggle in-place and persist.

### 2.6 · Manually capture a delivered FG lot or BOL

`/orders/:po → Delivery & Lots`. Inline-edit the BOL number on the PO, or **+ Add Lot** to record an arriving FG lot. Phase 2 replaces this with email-driven AI extraction; Phase 1 entry is manual.

---

## 3 · User management

### 3.1 · Onboard a new user

Two paths:

**A. Self-serve (preferred)** — add the email to `user_role_seeds` first, then have them sign in via magic link.

```sql
INSERT INTO user_role_seeds (email, full_name, role, title)
VALUES ('new.person@dirtycookie.com', 'New Person', 'ops', 'Their title')
ON CONFLICT (email) DO UPDATE
  SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, title = EXCLUDED.title;
```

When they sign in, the trigger reads the seed and creates their `user_profiles` row with the right role.

**B. Pre-provisioned (no email needed)** — Supabase dashboard → **Auth → Users → Add user**, set password + tick **Auto-confirm**. The trigger fires immediately; the user can sign in via the Password tab. Do this when SMTP is throttled or you want zero-touch onboarding.

### 3.2 · Change someone's role

```sql
-- Future sign-ins keep the new role (in case the auth row is recreated)
UPDATE user_role_seeds SET role = 'admin' WHERE email = 'someone@dirtycookie.com';

-- The current sign-in
UPDATE user_profiles SET role = 'admin' WHERE email = 'someone@dirtycookie.com';
```

### 3.3 · Offboard

Supabase dashboard → **Auth → Users** → ⋯ → **Delete**. The `user_profiles_id_fkey` cascades, so the profile row goes with it. (If you see "violates foreign key constraint user_profiles_id_fkey", migration `20260601170000_user_profiles_cascade_delete.sql` hasn't been applied — paste it and rerun.)

To revoke without deleting: drop the seed and set the profile role to something restrictive.

---

## 4 · Data management

### 4.1 · Roll back a bad upload

Every upload tags its rows with `source_upload_id` (the `upload_log.id`). To back out the last Assemblers upload:

```sql
WITH last_run AS (
  SELECT id FROM upload_log WHERE upload_type = 'production' ORDER BY uploaded_at DESC LIMIT 1
)
DELETE FROM lot_shipments         WHERE source_upload_id = (SELECT id FROM last_run);
DELETE FROM production_pallets    WHERE source_upload_id = (SELECT id FROM last_run);
DELETE FROM production_subcomponents WHERE source_upload_id = (SELECT id FROM last_run);
DELETE FROM production_rejects    WHERE source_upload_id = (SELECT id FROM last_run);
DELETE FROM production_runs       WHERE source_upload_id = (SELECT id FROM last_run);
-- raw_materials + raw_material_lots are NOT tagged (they upsert), so don't touch them.
DELETE FROM upload_log            WHERE id = (SELECT id FROM last_run);
```

`raw_materials` is upserted on `code` and `raw_material_lots` is delete-then-insert per material, so re-uploading the prior file restores them.

### 4.2 · Reseed demo POs

Paste `supabase/seeds/demo_purchase_orders.sql`. Idempotent via `ON CONFLICT (po_number) DO NOTHING` + `NOT EXISTS` guards.

### 4.3 · Wipe demo POs before real data

```sql
DELETE FROM purchase_orders
WHERE po_number IN ('PO14201','PO14255','PO14290','PO14326','PO14331','PO14371','PO14400');
-- CASCADE removes po_line_items, po_emails, po_changes, po_lot_numbers,
-- shipments, invoices, payments.
```

### 4.4 · Add a new upload type

Production → assemblers + dot + qbo + netsuite + production + weekly_report (current). To add another:
1. Build the parser in `src/parsers/<name>.js`, register in `src/parsers/index.js`
2. Add the card to `src/pages/Uploads.jsx`
3. Add the value to the `upload_log.upload_type` CHECK constraint via a new migration

---

## 5 · Troubleshooting

### 5.1 · **`new row violates row-level security policy`**

The current user's role doesn't satisfy the table's INSERT/UPDATE policy. Three checks in order:

```sql
SELECT email, role FROM user_profiles WHERE id = auth.uid();  -- should match expected role
```

If `role` is wrong → §3.2. If `auth.uid()` is NULL → you're not actually signed in (likely running in `VITE_AUTH_BYPASS=true` mode locally; set to `false` and sign in).

If the role is right but a specific table still rejects — that table might be missing the INSERT/UPDATE policy. Inspect via:

```sql
SELECT polname, polcmd FROM pg_policy
WHERE polrelid = '<schema>.<table>'::regclass;
```

Add a policy mirroring the pattern on similar tables (e.g. `raw_material_orders`'s `Ops/admin insert`).

### 5.2 · **`column "<name>" does not exist`**

A migration adding that column hasn't been applied. Find which migration owns the column with grep:

```bash
grep -rn "ADD COLUMN <name>" supabase/migrations/
```

Paste that migration into the SQL editor and rerun. If the migration is in the middle of a sequence, also check anything that depends on it.

### 5.3 · **`Database error querying schema`** during sign-in

gotrue's Go scanner crashed reading `auth.users` — typically because a token column it expects as a non-nullable string is `NULL`. Fix:

```sql
UPDATE auth.users
SET confirmation_token         = COALESCE(confirmation_token,         ''),
    recovery_token             = COALESCE(recovery_token,             ''),
    email_change_token_new     = COALESCE(email_change_token_new,     ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    email_change               = COALESCE(email_change,               ''),
    phone_change               = COALESCE(phone_change,               ''),
    phone_change_token         = COALESCE(phone_change_token,         ''),
    reauthentication_token     = COALESCE(reauthentication_token,     '')
WHERE email = '<who>';
```

If it persists, look at **Auth → Logs** for the specific `"error":` field. The recreate template at the bottom of this file builds a fully-formed user row from scratch.

### 5.4 · **Sidebar shows wrong role / "Restricted" on Audit Log**

The `handle_new_auth_user` trigger didn't run (or ran before the seed existed). Re-run it manually for one user:

```sql
INSERT INTO user_profiles (id, email, full_name, role, title)
SELECT u.id, u.email, COALESCE(s.full_name, split_part(u.email,'@',1)),
       COALESCE(s.role, 'ops'), s.title
FROM auth.users u
LEFT JOIN user_role_seeds s ON s.email = u.email
WHERE u.email = '<who>'
ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, title = EXCLUDED.title;
```

Sign out + back in to refresh the client-side profile.

### 5.5 · **`email rate limit exceeded`**

Default Supabase SMTP throttles to ~3-4 emails/hour. Options, ordered cheapest first:

1. Use the **Password** tab on the login screen (provision the user with a password in the dashboard)
2. Wait an hour for the throttle to clear
3. Configure custom SMTP in **Auth → Settings → SMTP** (sendgrid, postmark, etc.) — no rate limit

### 5.6 · **Invalid login credentials, password is definitely right**

Check the auth.users row is fully-formed:

```sql
SELECT confirmation_token IS NOT NULL AS has_conf,
       recovery_token IS NOT NULL AS has_rec,
       email_confirmed_at IS NOT NULL AS confirmed,
       encrypted_password IS NOT NULL AS has_pw
FROM auth.users WHERE email = '<who>';
```

Any `false` → run §5.3's fix. Also check `auth.identities` has a row with `provider = 'email'` and `provider_id = '<the email>'` (not the user id). If missing or wrong, recreate per the template at the bottom.

### 5.7 · **Upload fails partway through a multi-table import**

The Production parser inserts each table sequentially. If one fails, earlier inserts (like the Shipment sheet's `lot_shipments` rows) are committed but later ones aren't. Result: doubled rows after a retry. Recovery:

```sql
SELECT source_upload_id, count(*) FROM lot_shipments GROUP BY source_upload_id;
-- Spot the two batches. Drop the older one:
DELETE FROM lot_shipments
WHERE source_upload_id IN (
  SELECT id FROM upload_log
  WHERE upload_type = 'production' ORDER BY uploaded_at DESC OFFSET 1
);
```

### 5.8 · **No data on a page that should have data**

Open the browser devtools → Network → look for the failing Supabase request. The `message` field on the response tells you the underlying SQL error (`column does not exist`, `permission denied`, etc.) and points at the table to fix.

### 5.9 · **Local dev: sidebar footer says "Dev User"**

You're in bypass mode. `.env.local` → `VITE_AUTH_BYPASS=false` → restart vite. Bypass only renders a fake admin profile in the UI; DB calls run as anon and every role-gated insert will fail (which is why this is an instant tell).

---

## 6 · Health checks

### 6.1 · Daily

Quick query during morning standup:

```sql
SELECT
  (SELECT count(*) FROM upload_log WHERE status = 'error' AND uploaded_at > now() - interval '24 hours') AS upload_errors_24h,
  (SELECT count(*) FROM purchase_orders WHERE ship_status = 'pending' AND ship_date_original < current_date + 2) AS po_at_risk_2d,
  (SELECT count(*) FROM raw_materials WHERE expiry_status IN ('partial_expired','almost_expired')) AS expiring_materials,
  (SELECT count(*) FROM audit_log WHERE timestamp > now() - interval '24 hours') AS audit_events_24h;
```

Anything jumping → click through to the page that owns it.

### 6.2 · Weekly

- Confirm the Bentonville weekly arrived: `SELECT week_number, report_date FROM weekly_reports ORDER BY report_date DESC LIMIT 3;`
- Confirm DOT snapshot is fresh: `SELECT max(snapshot_date) FROM dot_inventory;` — should be within ~48 hours

### 6.3 · Monitoring surfaces

- **Supabase dashboard → Logs** — Auth Logs + Postgres Logs (most useful filter: `severity = ERROR`)
- **Vercel** — production deploy + function invocations (when wired)
- **`/audit` in-app** — admin/finance see every mutation; useful when "who changed X?" comes up

---

## 7 · Migrations

Apply order is **filename order**. The current list lives in `supabase/migrations/`. To apply a new one:

1. Author the file as `YYYYMMDDhhmmss_short_name.sql`
2. Commit + push (does not auto-deploy; GitHub integration off)
3. Paste contents into **Supabase SQL editor → Run**
4. Verify with the matching `SELECT` (each migration has one in its header or tail)
5. If it fails halfway, fix and rerun — DDL inside the editor is transactional unless explicitly committed

NEVER edit a migration that has been applied. If a fix is needed, write a follow-up that adjusts the earlier one's effect (DROP CONSTRAINT + ADD CONSTRAINT, etc.).

Seeds (`supabase/seeds/`) are separate — not part of the migration apply order, applied only when you want demo data.

---

## 8 · Anthropic API key

The Phase 2 AI agent (email → structured PO extraction) lives in a Supabase Edge Function. The Anthropic key is therefore a **server-side secret** — never put it in Vercel's `VITE_*` vars (those get inlined into the client bundle).

### 8.1 · Provision a key

1. https://console.anthropic.com → **Settings → API Keys → Create Key**. Name it `cookie-central`.
2. Copy the `sk-ant-…` value once — it won't show again.
3. **Console → Plans & Billing** → add payment method + set a monthly spend cap (recommend $50 to start; raise once the agent is steady).

### 8.2 · Store as a Supabase secret

The CLI works regardless of dashboard layout and whether any Edge Function exists yet:

```bash
brew install supabase/tap/supabase   # one-time install
npx supabase login                    # one-time, opens browser
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-… --project-ref niesswmibmonlbrbcecj
```

Dashboard alternative: **Edge Functions** (top-level left-sidebar item, not under Project Settings) → **Secrets** tab → **Add new secret**. The Edge Functions section appears once you've created at least one function; until then use the CLI.

Note: until the Phase 2 AI Edge Function is built, nothing reads this secret. Save the raw key in your password manager too in case the secret needs to be re-set later.

### 8.3 · Rotate

If the key leaks or a contractor rolls off:
1. Anthropic Console → revoke the old key
2. Create a new key with the same name
3. Re-run the `supabase secrets set` command with the new value
4. Redeploy any Edge Functions that read it (`npx supabase functions deploy <name>`)

No code changes required as long as the env var name stays the same.

## 9 · Escalation

| Symptom | Likely owner |
|---|---|
| App down, can't reach Supabase | Supabase status (status.supabase.com) → Caroline (builder) |
| Sign-in throwing schema/identity errors | Caroline — see §5.3 / §5.6 |
| Wrong PO data | Cortina (Harshita Gedela — NetSuite source) → Marc/Caroline to reconcile |
| Weekly report missing | Bentonville Merchants (Blayn) — confirm email sent; then check parser |
| Assemblers upload errors | Marc — confirm file is the standard format; then Caroline if parser-side |
| Payment discrepancy | David / Paul (finance) |
| Inventory mismatch | Marc (ops) — adjust via `/inventory` → Product view |
| Vercel deploy failure | Vercel dashboard logs → Caroline |

See `docs/PEOPLE.md` for contact details.

---

## Appendix · Recreate a broken auth user from scratch

When §5.3 / §5.6 don't unstick a sign-in, replace the auth row outright. Wrapped in a transaction so a half-failure rolls back.

```sql
BEGIN;
DELETE FROM user_profiles WHERE email = '<who>';
DELETE FROM auth.users    WHERE email = '<who>';

WITH new_user AS (
  INSERT INTO auth.users (
    instance_id, id, aud, role,
    email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token,
    email_change_token_new, email_change_token_current, email_change,
    phone_change, phone_change_token, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated', 'authenticated',
    '<who>',
    crypt('<password>', gen_salt('bf')),
    now(),
    '', '', '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now()
  )
  RETURNING id
)
INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  id,
  '<who>',                                       -- email provider: provider_id IS the email
  jsonb_build_object('sub', id::text, 'email', '<who>', 'email_verified', true, 'phone_verified', false),
  'email',
  now(), now(), now()
FROM new_user;

COMMIT;
```

The `handle_new_auth_user` trigger fires on the INSERT → `user_profiles` row is created with the role from `user_role_seeds` (or `ops` if no seed exists).
