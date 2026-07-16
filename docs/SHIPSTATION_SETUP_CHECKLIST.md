# ShipStation Setup Checklist (Caroline — apply in the ShipStation UI)

Phase 3, Task 3.4. These are the **ShipStation-side** settings the app can't set
via API — you (with the co-man) apply them in the ShipStation dashboard. Do them
against the **sandbox store first**, verify an end-to-end sample order, then
repeat on production (Task 3.5). Pairs with ADR-027 (the tag contract) and
`docs/SHIPSTATION_INTEGRATION.md`.

## 0. Sandbox store
- [ ] Duplicate the production store into a **sandbox** store (ShipStation's own recommended path for integration work).
- [ ] Generate **V1 API keys** for the sandbox (API key + secret). V1, not V2 — order-create maturity lives in V1 and the keys are not interchangeable.
- [ ] Hand the keys to the app via Vault, not the UI: they go in `SHIPSTATION_API_KEY` / `SHIPSTATION_API_SECRET` via `set_secret(...)` (server-side only).

## 1. Product tags (co-man owns this — the two-step indirection)
- [ ] Create the product tag **`cold-chain`**.
- [ ] Apply `cold-chain` to every **Raw** product record (the SKU-to-tag map in ADR-027). Do NOT write SKU-based automation rules — they silently ignore multi-item orders.
- [ ] Confirm ShipStation auto-applies the product's tag to any imported order containing it.

## 2. Automation rules (rule on the ORDER tag, never the SKU)
- [ ] `if order includes cold-chain` → refrigerated service + insulated box package
- [ ] `if order tag rush` → next-day service + priority alert
- [ ] `if order tag custom-box` → branded mailer package
- [ ] `if order tag dc-box` → standard package
- [ ] `if order tag custom-request` → route to **manual review** (no auto-fulfill)

## 3. Box inventory (packages)
- [ ] Define each physical box as a ShipStation **package**: insulated box, branded mailer, standard package (at minimum the three referenced above).
- [ ] The app never picks a box — it only pushes `dc-box` / `custom-box` / `cold-chain` tags; the co-man owns the package mapping.

## 4. Email / CC — copy `samplesmngmt@cortinafoods.com` on everything
Requirement: copy the sample-mgmt inbox on **all orders, shipments, deliveries**. That's **two** places:
- [ ] **Shipment + delivery emails:** Store → Emails/Notifications → **"Blind Copy on Shipment and Delivery Email"** = `samplesmngmt@cortinafoods.com`. Note: it's a **BCC**, and it covers shipment **and** delivery together (can't split).
- [ ] **Order confirmation:** the salesperson (the shipment's `salesperson_user_id` → their `email`) is the confirmation recipient. To also copy the sample-mgmt inbox on order creation, add it to the order's recipient emails at push time (the app can append it) **or** as a dedicated notification.

## 5. Packing slip — collateral + warming instructions
- [ ] Create a **custom packing-slip template**.
- [ ] Add a **Field Replacement** token that prints the order **Notes** field (where the app writes the collateral checklist incl. **Warming instructions**) — e.g. `[Notes to Buyer]` / `[Notes from Buyer]` bound to the Notes field.
- [ ] Do **not** use Custom Fields 1–3 for the collateral list — they truncate silently at 100 chars. Use the larger Notes field.

## 6. Webhooks (status back to the app)
- [ ] Subscribe the **shipstation-webhook** Edge Function URL to `ORDER_NOTIFY` and `SHIP_NOTIFY` events.
- [ ] Note the webhook signing setup so the function can verify RSA-SHA256 signatures.
- [ ] Remember the edit discipline: no "order update" webhook fires on arbitrary edits; rules run once on import; orders are immutable once shipped/cancelled. Edits must land **before** fulfillment (the app re-pushes deliberately).

## 7. Go-live (Task 3.5)
- [ ] Verify a full sample order end-to-end in sandbox (push → tags/rules → packing slip → BCC emails → ship webhook → `sample_shipments.status` updates).
- [ ] Swap the Vault keys to the **production** store's V1 keys.
- [ ] Re-point the webhook subscription to production.
- [ ] Rotate keys before the first expiry (3/6/12-mo options) — no downtime if rotated ahead.
