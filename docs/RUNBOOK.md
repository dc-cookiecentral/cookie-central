# Cookie Central — Operations Runbook

Procedures and known-fixes for keeping Cookie Central live. Read top-to-bottom once; reach back when something specific breaks. Symptoms in **bold** mean "ctrl-F this when it happens."

> ⚠️ **Five pages are hidden from the sidebar pending rework** (Aug 21 2026): Weekly Report, Product Orders, Payments, EOM Snapshot and Lot Trace. Procedures below that reference `/orders`, `/payments`, `/weekly`, `/snapshot` or `/trace` **still work — the routes are intact**, they are just not linked in the nav. Type the URL. The flag is `hidden: true` in `src/components/Sidebar.jsx`; deleting it brings a page back. Internal users now land on `/inventory` rather than `/orders`.
>
> **Product Orders and the BOL flow return around Oct 2026** with substantial changes, and the **`systems@` email reader is being kept** — the daily poll stays on and §9's procedures remain current. **The weekly Bentonville Retail Link email is retired**, so §9 steps specific to `weekly_report` mail no longer fire; `weekly_reports` stopped at 2026-07-06.

---

## 1 · Sign in

The login screen at `/login` offers two methods:

- **Magic link** (default) — enter email → click the link in the email. ⚠️ **The real limit is `rate_limit_email_sent = 2` per hour, per PROJECT** — not per user, not per day — because no custom SMTP is configured and the built-in Supabase sender is used. Every magic link, confirmation and recovery across the whole project shares that bucket, so a shared inbox with a few retries blocks itself. **Prefer the password path below for onboarding**; it sends no email at all. The first time someone signs in, the `handle_new_auth_user` trigger creates their `user_profiles` row using the role assigned in `user_role_seeds`.
- **Password** (fallback) — for demos, SMTP outages, or users who'd rather skip email. Pre-provision the user in **Supabase dashboard → Auth → Users → Add user** with a password set and **Auto-confirm** ticked.

After sign-in the sidebar footer shows full name + role. If it's missing, the profile row wasn't created — run the trigger-rebuild query in §5.4.

---

## 2 · Common operations

### 2.1 · Upload a file

All uploads go through `/uploads`. The page leads with the **six exports actually used** (see §2.7); everything else sits in a collapsed "Legacy & occasional" group. Drag a file onto its card; the pipeline parses, previews, and only commits after **Import**.

| Origin | File | Lands in |
|---|---|---|
| Cortina | NetSuite PO export (.csv/.xlsx) | `purchase_orders` + `po_line_items` |
| Cortina | DOT portal CSV | `dot_inventory` (snapshot rows tagged by `snapshot_date`) |
| Assemblers | **One** multi-sheet workbook (Production / Reject / Inventory / Shipment / N Job sheets) | `production_runs` + `production_pallets` + `production_subcomponents` + `production_rejects` + `lot_shipments` + `raw_materials` + `raw_material_lots` |
| QuickBooks | Invoices/payments CSV | `invoices` + `payments` |
| Retail Link | `Dirty Cookie Supply Plan Wk##.xlsx` | `retail_link_supply_plan` |
| Retail Link | `Dirty Cookie WK##.xlsx` | `retail_link_pos_weekly` + `retail_link_forecast` |
| Retail Link | `OTIF STORE Performance PO DETAILS *.xlsx` (1-week **and** 3-week) | `retail_link_otif` |
| DOT | `Order History (N).xlsx` — outbound orders + cuts | `dot_order_history` |

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

### 2.7 · The weekly upload routine (feeds the Demand Planner)

Six files, in the order they appear on `/uploads`:

| # | File | Notes |
|---|---|---|
| 1 | `Dirty Cookie Supply Plan Wk##.xlsx` | Walmart's forward **order** plan — what it intends to order from us, by order-place date |
| 2 | `Dirty Cookie WK##.xlsx` | POS, in-stock, traited stores, store forecast. One file backfills the **whole year** of POS, so the first upload is not "one week of data" |
| 3 | `OTIF STORE Performance … 1 week` | In Time and In Full — cases ordered / in time / late / unfilled per PO |
| 4 | `OTIF STORE Performance … 3 weeks` | Same format, wider window. **Upload both** — they overlap on purpose |
| 5 | `DOT Report` — `Order History (N).xlsx` | Outbound DOT orders and **cut** cases. Drives cut recovery: the volume DOT never shipped, which NetSuite never sees |
| 6 | `Walmart Report (NetSuite)` | Drives the planner's `orders` series (requested / delivered / revenue / cuts) and carries the **Cut Reason** column. Also auto-ingests nightly from `systems@` |

Then `/demand-planner` picks them up on next load; its banner's "as of" is the newest week **with data**, not the time of the fetch.

✅ **Re-uploading weeks you already have is correct, not a mistake.** Walmart restates POS after the fact — week 202622 moved 1,322 → 2,343 units for PB&J between snapshots — and every Retail Link feed upserts so the later file wins. The same applies to the two OTIF exports, whose week ranges deliberately overlap.

⚠️ **Two different files are called "the DOT report".** Card 5 takes the **`Order History (N).xlsx`** outbound export (orders and cuts) — validated against a real file. The *pallet-level on-hand* export is a different thing entirely; it lives in the Legacy group as "DOT Inventory (pallet-level)", its parser (`src/parsers/dot.js`) is still FORMAT UNCONFIRMED, and no sample has ever arrived. Don't drop one on the other's card.

⚠️ **`mape` (forecast accuracy) stays blank until a second week's file is loaded.** Accuracy scoring needs the previous week's snapshot to compare against, and snapshots before the first upload are unrecoverable. This is expected.

⚠️ **Store on-hand only accrues from the week you start uploading.** No weekly on-hand history exists in any Walmart export, so backfilled weeks show blank for Store OH DOH — blank, not zero.

🔴 **There is no DOT on-hand report at all** (Caroline, Aug 24 2026) — not pending, non-existent. Its upload card has been removed. The planner's forward DOT cascade runs permanently on `params.dotOpeningAnchor`, so the Tracker's DOT rows are a **model, not actuals**. Do not go looking for a file to fix this.

If an export looks different from the above, run `node scripts/inspect-retail-link.mjs "<file>.xlsx"` — it runs every parser over every sheet and prints what matched.

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

### 4.2 · Delete POs (wipe data)

Delete POs by `po_number` — the FKs cascade to every child row. Run in the
dashboard SQL editor (there's no app-side DELETE policy on `purchase_orders`).

```sql
DELETE FROM purchase_orders
WHERE po_number IN ('PO14201', 'PO14255');   -- example
-- CASCADE removes po_line_items, po_emails, po_changes, po_lot_numbers,
-- shipments, invoices, payments.
```

### 4.3 · Add a new upload type

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

Apply order is **filename order**. The current list lives in `supabase/migrations/` — 68 files as of Aug 19, 2026, ledger in sync.

### Preferred: `db push`

**This works, despite what the docs used to say.** `db push` connects straight to the remote database; Docker is needed only for the *local* stack (`supabase start`, `db diff`, `db reset`).

1. Author the file as `YYYYMMDDhhmmss_short_name.sql`
2. `npx supabase db push --dry-run` — **always.** It prints exactly which files would apply. If that list is longer than what you just wrote, stop and read the drift section below
3. `npx supabase db push --yes`
4. Verify with the matching `SELECT` (each migration has one in its header or tail)
5. Commit + push to git (does not auto-deploy; GitHub integration off)

### Fallback: by hand

Pasting into **Supabase SQL editor → Run**, or POSTing to the Management API's `/database/query`, both still work — fine for a one-off or when the CLI is unavailable. DDL in the editor is transactional unless explicitly committed, so a half-failed migration rolls back.

⚠️ **Neither writes a `supabase_migrations.schema_migrations` row.** Anything applied by hand is invisible to the CLI, and a later `db push` will try to **replay** it. This is how 12 unregistered Sample Central migrations accumulated by Aug 14.

### Repairing ledger drift

When `db push --dry-run` lists files you know are already live:

1. **Verify they really are.** Do not take the folder's word for it. Probe the live schema — `GET /rest/v1/<table>?select=<column>&limit=1` with the anon key returns `200` if a table and column exist, `404`/`400` if not. Confirm dropped columns are actually gone
2. `npx supabase migration repair --status applied <version> <version> ...` — corrects the ledger only; **runs no SQL**
3. `db push --dry-run` again to confirm the list has narrowed to just your new file

Worked example in **ADR-047**.

NEVER edit a migration that has been applied. If a fix is needed, write a follow-up that adjusts the earlier one's effect (DROP CONSTRAINT + ADD CONSTRAINT, etc.). The EOS `Mark` → `Marc` correction in `20260818130000` is a small example — a follow-up `UPDATE`, not an edit to the seed.

---

## 8 · Anthropic API key

The Phase 2 AI agent (email → structured PO extraction) lives in a Supabase Edge Function. The Anthropic key is therefore a **server-side secret** — never put it in Vercel's `VITE_*` vars (those get inlined into the client bundle).

### 8.1 · Provision a key

1. https://console.anthropic.com → **Settings → API Keys → Create Key**. Name it `cookie-central`.
2. Copy the `sk-ant-…` value once — it won't show again.
3. **Console → Plans & Billing** → add payment method + set a monthly spend cap (recommend $50 to start; raise once the agent is steady).

### 8.2 · Store as a Supabase secret

Two separate stores in Supabase, both safe:

- **Vault** (dashboard: **Project Settings → Vault**) — pgsodium-encrypted at rest, audit-logged on every access. Read from Postgres via `select vault.decrypted_secret('ANTHROPIC_API_KEY')`. This is where the current key lives.
- **Edge Function secrets** (dashboard: **Edge Functions → Secrets**, or CLI `supabase secrets set ANTHROPIC_API_KEY=…`) — plain env vars exposed via `Deno.env.get('ANTHROPIC_API_KEY')` inside Edge Functions.

The Phase 2 AI Edge Function will read from Vault via a small Postgres helper (or duplicate the value into Edge Function secrets if call latency matters). Whichever, both stores stay in sync at rotation time. Save the raw key in your password manager too — neither store will show it back after the first write.

### 8.3 · Rotate

If the key leaks or a contractor rolls off:
1. Anthropic Console → revoke the old key
2. Create a new key with the same name
3. Re-run the `supabase secrets set` command with the new value
4. Redeploy any Edge Functions that read it (`npx supabase functions deploy <name>`)

No code changes required as long as the env var name stays the same.

## 9 · Gmail email agent (systems@dirtycookie.com)

The AI agent reads `systems@` (read-only), classifies each message, and files it.
Three Edge Functions + four migrations + the Vault secrets back it.

### 9.1 · One-time deploy

1. Apply the migrations (SQL editor, filename order):
   `20260602120000_vault_secret_helpers.sql`, `20260602130000_gmail_agent_tables.sql`,
   `20260602140000_upload_log_source.sql`, and `20260602160000_link_parked_po_emails.sql`
   (the NetSuite back-fill RPC — see §9.6). (Hold `..150000_gmail_poll_cron.sql` for step 4.)
2. Confirm the secrets are in Vault (Project Settings → Vault): `ANTHROPIC_API_KEY`,
   `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`. Sanity check as service role:
   `select public.get_secret('ANTHROPIC_API_KEY') is not null;`
3. Deploy the functions:
   ```
   npx supabase functions deploy gmail-oauth-callback --no-verify-jwt
   npx supabase functions deploy gmail-poll
   npx supabase functions deploy gmail-extract
   ```
   (`config.toml` pins these settings; the callback is public, the other two need a JWT.)
   OAuth lands on `https://cookiecentral.dirtycookie.com` by default; override with
   `npx supabase secrets set APP_BASE_URL=https://<app-domain>` if that changes.
4. Schedule the daily poll: store the bearer, then apply the cron migration:
   `select public.set_secret('EDGE_CRON_BEARER', '<service_role_key>');` then paste
   `20260602150000_gmail_poll_cron.sql` (needs `pg_cron` + `pg_net` enabled).

### 9.2 · Connect / reconnect the inbox

`/uploads → systems@ Inbox → Connect Gmail` → sign in as `systems@dirtycookie.com`
→ grant read-only → lands back on `/uploads?gmail=connected`. The refresh token is
stored in Vault as `GMAIL_REFRESH_TOKEN`. **If reconnect returns "no refresh_token":**
Google only issues one on first consent — remove the app at
`myaccount.google.com/permissions`, then Connect again.

### 9.3 · Run a poll

`Check for new ↻` on the inbox card (or the daily cron) runs `gmail-poll`: it lists
new mail, classifies with Haiku, writes `gmail_messages` (deduped on the Gmail
message id), and tail-calls `gmail-extract`. **Where each class lands:**

| Class | Lands in |
|---|---|
| PO / supplier_confirmation | `po_emails` (+ advisory `po_changes` `change_source='email'`) |
| BOL | `po_emails` + `po_lot_numbers` (+ advisory `po_changes`) |
| assemblers_report | runs the .xlsx through the production parser → `production_*` / `raw_materials`, one `upload_log` row `source='email'` |
| weekly_report | `weekly_reports` (body scorecard; .xlsx attachments are recorded, not parsed) |
| other | logged only |

Structured extraction is **advisory** — it never edits `purchase_orders` directly;
review email-sourced values via Original-vs-Current and Delivery & Lots.

### 9.4 · Reprocess / debug a message

Every email is a `gmail_messages` row with `classification`, `processed`, `error`,
and links (`po_email_id`, `upload_log_id`). To re-run one:
`update gmail_messages set processed=false, error=null where gmail_message_id='…';`
then Check for new. A failed message has `processed=true` + an `error` string.

### 9.5 · Rotate the Gmail token

Reconnect via the button (§9.2) — it overwrites `GMAIL_REFRESH_TOKEN`. To rotate the
Anthropic key, see §8.3 (the functions read it from Vault, no redeploy needed).

### 9.6 · Parked PO emails (email arrived before the PO)

A PO/BOL email is matched to its `purchase_orders` row by `po_number`. If the email lands
**before** NetSuite has loaded that PO, the agent stores it "parked" — `po_emails.po_id`
(and any `po_lot_numbers.po_id`) is null, with the number kept in `extracted_data.po_number`.
Nothing is lost; it just doesn't show on a PO yet.

The NetSuite parser calls `link_parked_po_emails(po_id, po_number)` for every PO it upserts,
so parked rows **auto-attach the moment their PO loads** (requires migration
`20260602160000`). To reconcile by hand:

```sql
select public.link_parked_po_emails(
  (select id from purchase_orders where po_number = 'PO14451'), 'PO14451');
```

Find parked emails: `select extracted_data->>'po_number' po, count(*) from po_emails
where po_id is null and source='email' group by 1;`

## 10 · Escalation

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
