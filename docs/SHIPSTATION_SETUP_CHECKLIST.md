# ShipStation Setup Checklist — Custom Store (Caroline + co-man)

Phase 3, account-side config for the **Custom Store** integration (ADR-028). These
are the ShipStation-dashboard settings the app can't set via the API. Do them
against the **sandbox store first**, verify an end-to-end sample order, then
repeat on production (go-live). Pairs with `docs/SHIPSTATION_INTEGRATION.md`.

> Convention: items marked **🚦 LAUNCH-BLOCKING** must exist before the first
> real order — the shipping-speed mapping and the cold-chain / box behaviours
> don't happen without them, and the pull model surfaces no error if they're missing.

## 0. Store + credentials
- [x] ShipStation **account** `support@dirtycookie.com` — already created (Dirty Cookie's single account; the co-man is a user in it).
- [ ] Duplicate the production store into a **sandbox** store (ShipStation's recommended path for integration work).
- [ ] Settings → **Selling Channels → Store Setup → Connect a Store → Custom Store**.
- [ ] Set the **URL to Custom XML Page** = the `shipstation-customstore` Edge Function URL.
- [ ] Set the **Username / Password** (Basic Auth). These same values go into Vault as `SHIPSTATION_CUSTOMSTORE_USER` / `SHIPSTATION_CUSTOMSTORE_PASS` via `set_secret(...)` — the app validates incoming Basic Auth against them. Server-side only.

## 1. Status mapping (Modify Marketplace Settings)
The export sends the app's own status **verbatim** (samples are free — no "paid").
Set the status fields so our statuses route correctly:
- [ ] **Awaiting Shipment Statuses** = `submitted, processing`  (the co-man's work queue)
- [ ] **Shipment Statuses** = `shipped, delivered`
- [ ] Awaiting Payment / Cancelled / On Hold — leave defaults; the app never emits those.

## 2. Shipping-service mapping 🚦 LAUNCH-BLOCKING
The app's checkout offers a **3-tier speed selector** (Ground / 2-Day / Overnight). The export resolves the tier to a real UPS **`serviceCode`** and sends it in `<ShippingMethod>`. Map each **1:1** to the matching ShipStation service (source: `docs/Shipstation Shipping Doc/Shipping Services - 07-23.xlsx`, US domestic):
- [ ] **Confirm the connected carrier is UPS** (`carrierCode = ups`). The three codes below are UPS-specific — if the account ships on a different carrier, stop and update `SHIPPING_SPEEDS` in `src/utils/sampleCentral.js` + `supabase/functions/_shared/shipstation.ts` first.
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

## 8. Verify (sandbox) — mapping test, no label needed
- [ ] Trigger a **manual store import** in ShipStation.
- [ ] Confirm a sample order lands in the dashboard with fields mapped: ship-to, items (SKU=product_code), ShippingMethod (**resolves to the picked tier's UPS service — test all three**), CustomField1 (box), CustomField2 (custom-request when present), InternalNotes (collateral/warming/custom specs).
- [ ] Confirm an invalid address (bad State/zip) does **not** silently vanish — the export skips+logs it (check the function logs).
- [ ] (Optional) Test a full ship: mark shipped in ShipStation → confirm `shipnotify` updates `sample_shipments` (tracking #, status → shipped).

## 9. Go-live
- [ ] Everything verified in sandbox (import mapping + shipnotify writeback).
- [ ] Swap Vault creds + the Custom Store URL to the **production** store.
- [ ] Re-confirm the automation rules + method-mapping + product tags exist on production (they're per-store).
- [ ] Note: **delivered** is not wired yet — the pipeline ends at *shipped* (no delivery polling).
