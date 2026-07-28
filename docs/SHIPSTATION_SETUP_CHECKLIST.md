# Sample Central Launch Checklist — ShipStation Custom Store (Caroline + co-man)

Everything that has to be true before Cortina can place real sample orders.
Mostly ShipStation-dashboard config for the **Custom Store** integration
(ADR-028) — the settings the app can't set via the API — plus **§A**, the
app-side prerequisites that live nowhere else. Pairs with
`docs/SHIPSTATION_INTEGRATION.md`.

> **No sandbox — this is the production store.** The sandbox path was tried and
> abandoned: most of what needed testing (real carrier services, the connected
> carrier's rates, live automation behaviour) isn't available in a sandbox store,
> so it couldn't answer the questions we had. Integration work therefore happens
> against production, and the safety net is **app-side test mode** (§8b) rather
> than store isolation. Read §8b before letting anyone else use the app.

> Convention: items marked **🚦 LAUNCH-BLOCKING** must exist before the first
> real order — the shipping-speed mapping and the cold-chain / box behaviours
> don't happen without them, and the pull model surfaces no error if they're missing.

## A. App-side prerequisites — users + address book

Not ShipStation config, but the app is unusable without it. Tracked here so
launch has one list. (Origin: ADR-026 carried item b.)

> **Soft launch (from July 28, 2026) is Dirty Cookie internal only — no Cortina
> logins yet.** DC staff already hold internal roles, so **§A.1 is not blocking
> for the soft launch**. It becomes 🚦 LAUNCH-BLOCKING the moment the first
> Cortina salesperson is invited, and the hazard below is not self-correcting —
> read it before sending that first magic link.

### A.1 Seed every Cortina user BEFORE their first sign-in 🚦 blocking at Cortina onboarding

⚠️ **Order matters and the mistake is not self-correcting.** The
`handle_new_auth_user` trigger provisions a profile on first sign-in using
`COALESCE(seed.role, 'ops')`. An unseeded user therefore lands as **`ops`** — an
*internal* role with access to all of Cookie Central, not the Sample-Central-only
gate Cortina is supposed to get. And because the insert is
`ON CONFLICT (id) DO NOTHING`, adding the seed afterwards does **not** fix them;
you'd have to `UPDATE user_profiles SET role='cortina'` by hand.

- [ ] Insert each Cortina salesperson into `user_role_seeds` **first**:
```sql
insert into user_role_seeds (email, full_name, role, title) values
  ('someone@cortinafoods.com', 'Their Name', 'cortina', 'Sales')
on conflict (email) do update set role = excluded.role;
```
- [ ] Only then send the magic link (auth is magic-link only — there is no password path).
- [ ] Verify after they sign in:
```sql
select email, role, active_in_dropdown from user_profiles order by role, email;
```
- [ ] `active_in_dropdown` defaults to `true`, so they appear in the builder's salesperson picker automatically — no extra step.

*As of July 28, 2026: `user_profiles` holds 3 admins and **zero** `cortina` users.*

**Applies to the internal soft launch too.** Any Dirty Cookie tester who has
never signed in provisions as **`ops`** if they aren't in `user_role_seeds` —
broad internal access, granted silently. Seed DC testers with their intended
role first if `ops` isn't what you want them to have.

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

## 2. Shipping-service mapping 🚦 LAUNCH-BLOCKING
The app's checkout offers a **3-tier speed selector** (Ground / 2-Day / Overnight). The export resolves the tier to a real UPS **`serviceCode`** and sends it in `<ShippingMethod>`. Map each **1:1** to the matching ShipStation service (source: `docs/Shipstation Shipping Doc/Shipping Services - 07-23.xlsx`, US domestic):
- [x] **Connected carriers confirmed July 28, 2026: UPS and USPS.** UPS is what matters here — the three codes below are UPS-specific and now known-good. USPS is connected but **deliberately unused by the tier map**: the salesperson picks a speed, not a carrier, so all three tiers resolve to UPS. The co-man can still buy a USPS label at fulfilment if it's cheaper; `ShippingMethod` is a *requested* service, not a mandate. Offering USPS tiers would mean editing `SHIPPING_SPEEDS` in `src/utils/sampleCentral.js` + `supabase/functions/_shared/shipstation.ts` together.
- [ ] `ups_ground` → UPS Ground *(app default — tier `ground`)*
- [ ] `ups_2nd_day_air` → UPS 2nd Day Air® *(tier `2day`)*
- [ ] `ups_next_day_air` → UPS Next Day Air® *(tier `overnight`)*
- [ ] (These are real serviceCodes, so the mapping is 1:1 — no free-text reverse-mapping. Speed uses the dedicated `ShippingMethod` element, so **no CustomField and no automation rule is involved**. Add a row here if the app ever gains a tier.)

## 3. Automation rules 🚦 LAUNCH-BLOCKING
Rule on **order tags / CustomFields / requested method — never on Item SKU** (SKU rules silently ignore multi-item orders):
- [ ] `if order includes the cold-chain product tag` → refrigerated service + insulated box **+ upgrade to a next-day service** (this is how frozen products get expedited, overriding the requested tier — the app itself never expedites).
- [ ] `if CustomField1 = custom-box` → branded mailer package.
- [ ] `if CustomField1 = dc-box` → standard package.
- [ ] `if CustomField2 = custom-request` → route to **manual review** (no auto-fulfil).
- [ ] (**No speed rule needed** — the chosen tier maps 1:1 to a serviceCode in §2, so speed *is* the requested service. Only the cold-chain automation overrides it.)

## 4. Product tags — cold-chain (co-man owns this) 🚦 LAUNCH-BLOCKING for raw samples
- [ ] Create the product tag **`cold-chain`**.
- [ ] Apply `cold-chain` to every **Raw** product record (the SKU→tag map). ShipStation auto-applies it to any imported order containing that product — the two-step indirection. Do **not** write SKU-based rules.
- [ ] (Not blocking today: the current 8 sample-eligible cookies are all Baked. Becomes blocking the day a raw sample is enabled.)

## 5. Box inventory (packages)
- [ ] Define each physical box as a ShipStation **package**: insulated box, branded mailer, standard package (at minimum the three the rules above reference).
- [ ] The app only pushes intent (`dc-box`/`custom-box` in CustomField1, cold-chain via product tag); the co-man owns the physical box mapping.

## 6. Packing slip — collateral + warming instructions
- [ ] Create a **custom packing-slip template**.
- [ ] Add a **Field-Replacement** token bound to the order **Notes / InternalNotes** field (where the app writes the collateral checklist incl. **Warming instructions**, plus custom-item specs + project #s).
- [ ] Do **not** use CustomFields for the collateral list — 100-char silent truncation. The app already puts lists in the 1000-char InternalNotes.

## 7. Email / CC — copy `samplesmngmt@cortinafoods.com`
Copy the sample-mgmt inbox on **all orders, shipments, deliveries** — two places:
- [ ] **Shipment + delivery emails:** Store → Emails/Notifications → **"Blind Copy on Shipment and Delivery Email"** = `samplesmngmt@cortinafoods.com` (BCC; covers shipment + delivery together).
- [ ] **Order confirmation:** the salesperson (`salesperson_user_id` → their `email`, exported as `CustomerCode`) is the recipient; add the sample-mgmt inbox as an additional recipient/notification if order-creation copies are also required.

## 8. Verify — mapping test, no label needed
- [ ] Trigger a **manual store import** in ShipStation.
- [ ] Confirm a sample order lands in the dashboard with fields mapped: ship-to, items (SKU=product_code), ShippingMethod (**resolves to the picked tier's UPS service — test all three**), CustomField1 (box), CustomField2 (custom-request when present), InternalNotes (collateral/warming/custom specs).
- [ ] Confirm an invalid address (bad State/zip) does **not** silently vanish — the export skips+logs it (check the function logs).
- [ ] (Optional) Test a full ship: mark shipped in ShipStation → confirm `shipnotify` updates `sample_shipments` (tracking #, status → shipped).

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

## 9. Go-live
There is no sandbox→production swap (§0) — the store is already production, so
go-live is about **clearing test state**, not migrating environments.

- [ ] Import mapping + shipnotify writeback verified end-to-end.
- [ ] **Remove `VITE_SAMPLE_TEST_MODE` (or set it to anything but `true`) and redeploy.** Confirm the amber banner is gone and a new order numbers as `SMP-####`.
- [ ] Purge `SMP-TEST-%` rows (§8b) **and** cancel the matching orders in ShipStation.
- [ ] Confirm §2 method-mapping, §3 automation rules and §4 product tags are all in place (they're per-store, and nothing warns you if they're missing).
- [ ] Confirm every Cortina user resolves to `role='cortina'` (§A.1) — an unseeded user silently got internal `ops` access.
- [ ] Note: **delivered** is not wired yet — the pipeline ends at *shipped* (no delivery polling).
