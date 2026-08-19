# Sample Central Launch Checklist — ShipStation Custom Store (Caroline + co-man)

Everything that has to be true before Cortina can place real sample orders.
Mostly ShipStation-dashboard config for the **Custom Store** integration
(ADR-028) — the settings the app can't set via the API — plus **§A**, the
app-side prerequisites that live nowhere else. Pairs with
`SHIPSTATION_INTEGRATION.md`.

> **No sandbox — this is the production store.** The sandbox path was tried and
> abandoned: most of what needed testing (real carrier services, the connected
> carrier's rates, live automation behaviour) isn't available in a sandbox store,
> so it couldn't answer the questions we had. Integration work therefore happens
> against production, and the safety net is **app-side test mode** (§8b) rather
> than store isolation. Read §8b before letting anyone else use the app.

> Convention: items marked **🚦 LAUNCH-BLOCKING** must exist before the first
> real order — the cold-chain, custom-request and rush behaviours don't happen
> without them, and the pull model surfaces no error if they're missing.

## A. App-side prerequisites — users + address book

Not ShipStation config, but the app is unusable without it. Tracked here so
launch has one list. (Origin: ADR-026 carried item b.)

> **Soft launch (from July 28, 2026) is Dirty Cookie internal only — no Cortina
> logins yet.** DC staff already hold internal roles, so **§A.1 is not blocking
> for the soft launch**. It becomes 🚦 LAUNCH-BLOCKING the moment the first
> Cortina salesperson is invited, and the hazard below is not self-correcting —
> read it before sending that first magic link.

### A.1 Seed every Cortina user BEFORE their first sign-in ✅ done — and it failed once, exactly as warned

🔴 **THIS WENT WRONG FOR REAL ON AUG 19, 2026. Read this before creating any account.**
An account was created by hand as `samplesmgmt@cortinafoods.com` — **no `n`** —
while the seed is `samplesmngmt@cortinafoods.com`. The lookup is exact equality,
so it missed; the account provisioned as internal **`ops`** and signed in.
`InternalOnly` redirects only `cortina`, so it had purchase orders, payments,
inventory, the Cookulator and the audit log. It owned no rows (every user-id
column in the schema was checked) and was deleted; the correct account was
re-created from the seed spelling and verified as `cortina`.
**Copy-paste the address into the dashboard. Never retype it.** Two addresses one
letter apart is the entire failure mode, and nothing in the system flags it —
the wrong account simply works, with the wrong access.

⚠️ **Order matters and the mistake is not self-correcting.** The
`handle_new_auth_user` trigger provisions a profile on first sign-in using
`COALESCE(seed.role, 'ops')`. An unseeded user therefore lands as **`ops`** — an
*internal* role with access to all of Cookie Central, not the Sample-Central-only
gate Cortina is supposed to get. And because the insert is
`ON CONFLICT (id) DO NOTHING`, adding the seed afterwards does **not** fix them;
you'd have to `UPDATE user_profiles SET role='cortina'` by hand.

⚠️ **This applies to the ONE Cortina ordering account, not to the sales reps.**
Reps stopped being user accounts in migration `20260807000500` — they are rows in
`sales_reps`, a lookup list with no link to `auth.users`. Cortina has a single
person entering samples on behalf of many reps; only that person needs a login.

- [x] Insert the Cortina **ordering account** into `user_role_seeds` **first** —
  **DONE Aug 11, 2026.** The account is `samplesmngmt@cortinafoods.com`
  ("Samples Management"), role `cortina`, seeded by migration
  `20260811120000_seed_cortina_ordering_account.sql` and verified live.
  **Provisioned and signed in Aug 19, 2026**, `role='cortina'` confirmed.
```sql
insert into user_role_seeds (email, full_name, role, title) values
  ('samplesmngmt@cortinafoods.com', 'Samples Management', 'cortina', 'Cortina · sample ordering account')
on conflict (email) do update set role = excluded.role;
```
- [x] Only then provision the account. **Auth is no longer magic-link only** — the
  Login page has a password mode, and password is currently the *recommended*
  route: auth email is capped at **2 per hour, project-wide** (`rate_limit_email_sent = 2`,
  no custom SMTP), which a shared inbox with a few retries exhausts immediately.
  Dashboard **Add user → set password → Auto Confirm** sends no email at all and
  fires the same trigger, so the seed still applies. To set a password on an
  existing user the dashboard offers no direct field — use the Admin API:
```bash
curl -X PUT "https://<ref>.supabase.co/auth/v1/admin/users/<user-id>" \
  -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" \
  -H "Content-Type: application/json" -d '{"password":"…"}'
```
- [x] Verify after provisioning — **this is the step that catches the spelling
  bug**, and `ilike` is what makes a near-miss visible:
```sql
select u.email, p.role, p.full_name
  from auth.users u join user_profiles p on p.id = u.id
 where u.email ilike '%cortina%';
```
  Expect exactly **one** row at `role = cortina`. Two rows, or one reading `ops`,
  means the address was mistyped: delete the auth user and re-create it from the
  seed spelling rather than patching `user_profiles`, so the seed stays the
  source of truth. (`user_profiles` cascades on delete.)
- [ ] **Signing someone in does NOT put them in the salesperson picker.** That
  needs a `sales_reps` row — a separate, deliberate step. *(`user_profiles.active_in_dropdown`
  used to control this; it drives nothing now.)* The picker holds 28 reps as of
  Aug 14, 2026: 25 Cortina + Caroline, David Landeck and Paul Hardy. To add one:
```sql
insert into sales_reps (full_name, email, company)
  values ('Their Name', 'someone@cortinafoods.com', 'Cortina')
on conflict (email) do update set active = true;
```

*As of Aug 19, 2026: `user_profiles` holds 4 admins and **one** `cortina` user.*

**Applies to the internal soft launch too.** Any Dirty Cookie tester who has
never signed in provisions as **`ops`** if they aren't in `user_role_seeds` —
broad internal access, granted silently. Seed DC testers with their intended
role first if `ops` isn't what you want them to have.

- [x] **Paul Hardy (President) — DONE Aug 14, 2026.** `paul@dirtycookie.com`,
  role **`admin`** (he is meant to see everything, so not `ops` and not the
  Sample-Central-only `cortina`), seeded by migration
  `20260814120000_seed_paul_hardy.sql` and verified live. He has **not signed in
  yet** — the seed is what makes that first sign-in safe. The same migration adds
  his `sales_reps` row, since he places orders himself and the picker is a
  separate table from auth.

### A.2 Seed the ship-to address book (optional but recommended)

- [ ] `addresses` is currently **empty**. The builder has inline add, so this isn't blocking — but the first salesperson meets a blank ship-to list. Pre-loading the common retailer addresses makes the stress test realistic and avoids everyone typing the same Kroger address.

## 0. Store + credentials
- [x] ShipStation **account** `support@dirtycookie.com` — created (Dirty Cookie's single account; the co-man is a user in it).
- [x] ~~Duplicate the production store into a sandbox store.~~ **Deliberately skipped** — the behaviours we needed to exercise aren't testable in a sandbox. See the note above.
- [x] Settings → **Selling Channels → Store Setup → Connect a Store → Custom Store**.
- [x] Set the **URL to Custom XML Page** = the `shipstation-customstore` Edge Function URL (the Supabase Functions URL, not the app subdomain).
- [x] Set the **Username / Password** (Basic Auth). These same values go into Vault as `SHIPSTATION_CUSTOMSTORE_USER` / `SHIPSTATION_CUSTOMSTORE_PASS` via `set_secret(...)` — the app validates incoming Basic Auth against them. Server-side only.

## 1. Status mapping (Modify Marketplace Settings)
The export sends the app's own status **verbatim** (samples are free — no "paid").
Set the status fields so our statuses route correctly:
- [ ] **Awaiting Shipment Statuses** = `submitted, processing`  (the co-man's work queue)
- [ ] **Shipment Statuses** = `shipped, delivered`
- [ ] Awaiting Payment / Cancelled / On Hold — leave defaults; the app never emits those.

## 2. Shipping-service mapping — ~~LAUNCH-BLOCKING~~ NO LONGER REQUIRED

**Retired July 28, 2026 (ADR-031).** The app no longer sends `<ShippingMethod>` —
it expresses no service preference at all, so there is nothing to map 1:1.
ShipStation owns service selection outright: the store default, your automation
rules (§3), and whoever buys the label.

- [x] ~~Map ups_ground / ups_2nd_day_air / ups_next_day_air~~ — nothing to map.
- [ ] Confirm the store's **default shipping service** is sensible for an
      unspecified-service order, since every sample now arrives that way.

## 3. Automation rules ✅ done (rush rule + seasonal cold rule, Aug 19)
Rule on **order tags / CustomFields — never on Item SKU** (SKU rules silently ignore multi-item orders):
- [ ] `if order includes the cold-chain product tag` → refrigerated service + insulated box **+ upgrade to a next-day service** (this is how frozen products get expedited, overriding the requested tier — the app itself never expedites).
- [ ] 🚨 **RE-POINT THE RUSH RULE (ADR-037).** Final mapping: **CF1 = salesperson, CF2 = account, CF3 = temp override**, and **rush lives in InternalNotes as the literal `RUSH`**. The July 28 rule reads `CustomField1 = rush` and matches nothing — rush orders notify no one, silently. Change it to **`Internal Notes` → `contains` → `RUSH`**. (Confirmed supported: ShipStation's *Automation Rules Criteria and Actions* lists Internal Notes with equal/contain/start/end/blank.) *Caroline owns this edit.*
- [ ] **Optional new rule — manual temp override.** `CustomField3` is blank unless someone overrode the derived handling temp, so `Custom Field 3` → `is not blank` flags exactly the orders where a human made a judgement call.
- [ ] ⚠️ **`custom-request` no longer has a rule-matchable home.** CF2 used to carry it; it now carries the account. Custom lines are *visible* as line items named **`Requested Benchtop: …`** (ADR-046), and they carry **no SKU at all** since ADR-038 — but that label rides `<Name>`, which is **not rule criteria**, and §3's own warning rules out the alternative anyway (*never rule on Item SKU, it silently ignores multi-item orders*). **The label is legibility for a human packer, not a trigger — do not mistake it for one.** Options remain: an Order Tag, or reclaim a CustomField. **Unresolved.**
- [x] ~~`if CustomField1 = rush` → team notification email~~ **Built July 28, 2026 — now mis-pointed, see above.** Confirms ShipStation's rule actions can send mail, so no app-side sender is needed. Note it fires on **import**, not on submit — so there is a lag of up to the import interval, and per ADR-027 rules run once on import, so a rush flag added after import will not re-trigger it.
- [ ] (No service rule needed for speed — the app sends no `ShippingMethod` at all as of ADR-031.)

## 4. Product tags — cold-chain (co-man owns this) ✅ done; blanket seasonal rule added Aug 19
- [ ] Create the product tag **`cold-chain`**.
- [ ] Apply `cold-chain` to every **Raw** product record (the SKU→tag map). ShipStation auto-applies it to any imported order containing that product — the two-step indirection. Do **not** write SKU-based rules.
- [ ] ⚠️ **This became blocking on July 28, 2026.** Migration `20260728120000` opened the catalog to all 27 products, including the **9 Raw** ones, so a salesperson can now build a frozen shipment (`derivedTemp` marks any cart with a Raw line as Cold). Until the tags and the §3 rule exist, a frozen sample imports as an ordinary ambient order and ships unrefrigerated — silently.

## 5. Box inventory (packages)
- [ ] Define each physical box as a ShipStation **package**: insulated box, branded mailer, standard package.
- [ ] **The app no longer sends any box intent** (ADR-031 dropped `box_spec`; CustomField1 now carries `rush`). Box choice is entirely the co-man's, driven by the cold-chain tag and their own judgement.

## 6. Packing slip — collateral + warming instructions

> **Changed Aug 4, 2026 (ADR-035).** Collateral and custom lines are now real
> **line items** on the order, so they appear on the order page and the standard
> pick list with no template work. Collateral was **removed** from InternalNotes
> to avoid printing twice.

- [x] ~~Expect new product records~~ — **no longer applies (ADR-038).** Custom
      and collateral lines are emitted with an **empty SKU**, so ShipStation has
      nothing to auto-create a product record from. Only real catalog SKUs
      import as products.
- [ ] (Optional) Custom packing-slip template with a **Field-Replacement** token
      bound to **Notes / InternalNotes** — still worth it for what remains there:
      handling, deliver-by, custom specs, third-party billing.
- [ ] Do **not** use CustomFields for lists — 100-char silent truncation.

## 7. Email / CC — copy `samplesmngmt@cortinafoods.com`
Copy the sample-mgmt inbox on **all orders, shipments, deliveries** — two places:
- [ ] **Shipment + delivery emails:** Store → Emails/Notifications → **"Blind Copy on Shipment and Delivery Email"** = `samplesmngmt@cortinafoods.com` (BCC; covers shipment + delivery together).
- [ ] **Order confirmation:** the salesperson (`sales_rep_id` → `sales_reps.email`, exported as **`BillTo Email`** *and* `CustomerCode`) is the recipient; add the sample-mgmt inbox as an additional recipient/notification if order-creation copies are also required. **`BillTo Email` is the notify target** — `CustomerCode` carries the same address but is an identity key for grouping a customer's orders, not something ShipStation mails (ADR-038). *(Was `salesperson_user_id`, dropped in migration `20260807001500`; reps are now a lookup list, not user accounts.)*

## 8. Verify — mapping test, no label needed
- [ ] Trigger a **manual store import** in ShipStation.
- [ ] Confirm a sample order lands in the dashboard with fields mapped: ship-to, **items (catalog SKUs + `CUSTOM` + `COLLATERAL-*`)**, **no ShippingMethod** (service falls to the store default), **CustomField1 = salesperson**, **CustomField2 = account**, **CustomField3 = `rush` when flagged**, InternalNotes (site note + third-party billing only).
- [ ] Confirm an invalid address (bad State/zip) does **not** silently vanish — the export skips+logs it (check the function logs).
- [ ] (Optional) Test a full ship: mark shipped in ShipStation → confirm `shipnotify` updates `sample_shipments` (tracking #, status → shipped).
- [ ] 🚨 **Blanket cold-chain rule for the season (ADR-045).** The site now
  forces every new order to Cold while `sample_settings.cold_chain_season` is on
  — it is **on now** — but sends no per-order signal, by design. ShipStation's
  existing cold handling keys off **product tags on Raw SKUs**, so a Baked-only
  order is *not* auto-upgraded. Until an unconditional seasonal rule exists here,
  the site claims something ShipStation is not acting on. *Caroline owns this.*
- [ ] **Cortina-fulfilled orders never arrive (ADR-044).** `fulfilled_by =
  'Cortina'` is withheld from the export by an allowlist. If one is ever expected
  in the queue and missing, that is why — it is not a failed import.

## 8b. Internal stress test — TEST MODE 🧪

Because there is no sandbox, orders your team creates land in the **real** store
and the co-man's real Awaiting Shipment queue. Test mode makes them obvious and
easy to clean up; it does **not** stop them reaching ShipStation.

**Turn it on** — set the Vercel build env var and redeploy:
```
VITE_SAMPLE_TEST_MODE=true
```
Build-time flag, so flipping it requires a redeploy. Sample Central shows an
amber **TEST MODE** banner whenever it's on — if you don't see the banner, you're
creating production orders.

- [ ] Set `VITE_SAMPLE_TEST_MODE=true` and redeploy **before** sharing the URL.
- [ ] Confirm the banner is visible and a new order numbers as `SMP-TEST-####`.
- [ ] Tell the co-man to expect (and ignore) `SMP-TEST-*` orders during the window.
- [ ] Consider pausing the store's scheduled import for the duration — test mode labels orders, it doesn't withhold them.

**Numbering.** Test and real orders share one counter, so `SMP-TEST-1044` is
followed by `SMP-1045` if you flip the flag off. That's deliberate: `shipment_no`
is UNIQUE, and separate counters would collide the moment the flag changes with
test rows still in the table.

**Cleanup before launch:**
```sql
delete from sample_shipments where shipment_no like 'SMP-TEST-%';
```
(`sample_shipment_items` cascades.) Cancel the matching orders in ShipStation too
— deleting the row here does **not** retract an order already imported there.

## 9. Go-live — ✅ COMPLETED August 19, 2026
There is no sandbox→production swap (§0) — the store is already production, so
go-live is about **clearing test state**, not migrating environments.

⚠️ **The order of these steps is load-bearing.** The shipment counter is derived
from the table, so purging before the raised floor is *deployed* makes the next
order reissue a burnt number — which lands on the old cancelled ShipStation order
(it keys on OrderNumber) and re-imports it as `paid`, un-cancelling it into the
co-man's queue. Run them in this order:

- [x] Import mapping + shipnotify writeback verified end-to-end.
- [x] **1. Raise `SHIPMENT_NO_FLOOR` above every burnt number and deploy it first.** 1200 → **1206** (PR #41). Verify in the artifact, not the build log.
- [x] **2. Cancel the matching orders in ShipStation** (cancel, not delete — its UI offers no delete, and the records must remain).
- [x] **3. Purge `SMP-TEST-%` rows** (§8b). Six orders, 26 items; `sample_shipment_items` cascades on the FK.
- [x] **4. Remove `VITE_SAMPLE_TEST_MODE` from the Production scope and rebuild.** Kept on **Preview** deliberately — preview builds share this database and this store, so the prefix is what makes a branch-build order distinguishable.
- [x] Confirm §2 method-mapping, §3 automation rules and §4 product tags are all in place (they're per-store, and nothing warns you if they're missing).
- [x] Confirm every Cortina user resolves to `role='cortina'` (§A.1). **This one caught a real failure** — see §A.1.

### Verifying the flip — do NOT grep for `SMP-TEST-`

`TEST_MODE` is parsed at **runtime** (trim / lowercase / strip quotes / accept
`true|1|yes|on`), so it is **not constant-folded** and the guarded strings stay in
the bundle whether the flag is on or off. Grepping for `SMP-TEST-` shows a hit
either way and reads as a failed flip.

The reliable signal is the env literal Vite bakes in:

```bash
ASSET=$(curl -s https://cookiecentral.dirtycookie.com/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)
curl -s "https://cookiecentral.dirtycookie.com/$ASSET" | grep -o 'const [A-Za-z$_]*="[^"]*"\.trim()\.toLowerCase()'
```

```
const $S=""        → the variable never reached the build. Flag OFF. ✅
const $S="true"    → arrived. Flag ON.
const $S="true,"   → arrived malformed (the real July 28 2026 failure).
```

Verified Aug 19: bundle `index-B2OHn24_.js`, literal `""`, floor `1206`,
`sample_shipments` empty.

- [x] ~~Note: **delivered** is not wired yet~~ — superseded by **ADR-043**: delivery polling is built and deployed. The outstanding piece is a first *real* carrier `DE`, never yet observed.
