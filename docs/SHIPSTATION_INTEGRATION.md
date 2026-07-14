# ShipStation Integration Spec

**Boundary principle:** the app pushes *intent* (a clean order + tags); ShipStation resolves *fulfillment* (box, service, labels, emails). Do not duplicate ShipStation logic app-side.

**All ShipStation calls run server-side** — a Supabase Edge Function. API keys never touch the client.

---

## The tag contract (lock with the co-man BEFORE writing integration code)

This vocabulary *is* the integration. Both sides must agree.

| Tag | Meaning | Set by | Drives (ShipStation rule) |
|---|---|---|---|
| `cold-chain` | shipment needs refrigerated handling | **product tag** on raw SKUs (auto-applied on import) | → refrigerated service + insulated box |
| `rush` | expedite | **order tag** pushed by app | → next-day service + priority alert |
| `custom-box` | branded/custom packaging | **order tag** pushed by app | → branded mailer package |
| `dc-box` | standard Dirty Cookie box | **order tag** pushed by app | → standard package |
| `custom-request` | contains a bespoke item (no SKU) | **order tag** pushed by app | → route to manual review (no auto-fulfill) |

**Split rule:** product-inherent attributes (cold chain) = **ShipStation product tags**; order-level choices (rush, box) = **order tags the app pushes**.

---

## The critical pitfall — do NOT rule on raw SKU

ShipStation's **Item SKU** automation criteria **silently ignore any order with more than one product**. Sample manifests are almost always multi-item, so a rule like `if SKU = CCH-2OZ-RAW-C → cold chain` **does nothing** on a real order.

**Correct pattern (two-step indirection):**
1. Tag the **product record** in ShipStation once — raw SKUs get the `cold-chain` product tag. ShipStation auto-applies the tag to any order containing that product on import (works on multi-item orders).
2. Write automation rules against the **order tag**: `if order includes cold-chain → refrigerated service`.

---

## Order push (Edge Function)

- Endpoint: `POST /orders/createorder` (V1 — order-create maturity lives in V1; V1/V2 keys are not interchangeable).
- Payload: ship-to (from `addresses`), line items by **SKU** (must match co-man's stock exactly), order tags per the contract, notes field carrying collateral + warming instructions.
- Custom items (no SKU): ride as an order note + `project_no`; add `custom-request` tag → manual review. Do not attempt a SKU line.
- Store returned `shipstation_order_id` on the `shipments` row.
- Rate limit ≈ 40 req/min per credential set → queue + back off on batch entry.

---

## Status back (webhook receiver Edge Function)

- Subscribe to `ORDER_NOTIFY` (new/updated) and `SHIP_NOTIFY` (shipped) events.
- On event → update `shipments.status` (submitted→processing→shipped→delivered).
- Verify webhook signatures (RSA-SHA256).
- **Gotcha — no "order update" webhook:** ShipStation notifies on new orders and on ship, not on arbitrary edits. If a leader edits a shipment after push, re-push/patch deliberately; the systems can otherwise silently diverge.
- **Gotcha — rules run once, on import.** Edits to an order already in Awaiting Shipment don't re-trigger rules. Same re-push discipline.
- **Gotcha — immutable once shipped.** Orders in shipped/cancelled can't be updated via API. Edits must land before fulfillment.

---

## Collateral & warming instructions → packing slip

Confirmed against the API. Packing slips support **Field Replacements** — bracketed tokens (`[Notes to Buyer]`, `[Gift Message]`, `[Custom Field 1-3]`) that print order data onto the slip.

- Push the collateral checklist (incl. **Warming instructions**) into an order **Notes** field.
- Add the matching token to a **custom packing-slip template** so the co-man packs the right inserts.
- **Watch the 100-char limit** on Custom Fields 1–3 — a long collateral list truncates silently. Use a larger **Notes** field, not a custom field.

---

## Email / CC config (ShipStation-side — document for Caroline to set up)

Requirement: always copy `samplesmngmt@cortinafoods.com` on all orders, shipments, deliveries.

- **Shipment + delivery emails:** the store's **"Blind Copy on Shipment and Delivery Email"** field (Emails/Notifications tab). Enter the address once → BCC on every shipment + delivery notification.
  - Nuance: it's a **BCC** (not CC), and it covers shipment **and** delivery **together** — can't split them.
- **Order confirmation to the salesperson:** separate recipient field. To also copy the sample-mgmt inbox on order creation, add it to the order's recipient emails (comma-separated) at push time, or a dedicated notification.
- **Decision required:** "all orders, shipments, deliveries" = configure in **both** places (Blind Copy for ship/deliver + recipient list for order confirmation).

---

## Box selection (ShipStation-side — document for Caroline to set up)

Don't build a box picker in the app. Define box inventory as ShipStation **packages**, map via automation rules:
- `if order includes cold-chain → insulated box`
- `if custom-box tag → branded mailer`
- `if dc-box tag → standard package`

The app only expresses intent (`box_spec` → tag). The co-man owns the physical box mapping.

---

## Auth / keys
- Keys expire (3/6/12-mo) — rotate before the first lapses; no downtime.
- All keys in Supabase Vault / server env (the repo already has `get_secret`/`set_secret` Vault helpers — reuse them). Never in `VITE_*` client vars.

---

## Build order (Phase 3)
1. Sandbox/duplicate ShipStation store first (their own recommendation).
2. Lock tag vocabulary + SKU-to-tag map with co-man.
3. Edge Function: order push (tags, notes, keys via Vault).
4. Edge Function: webhook receiver (status back, signature verify).
5. Document the ShipStation-side config (email CC, box packages+rules, packing-slip template) for Caroline to apply in the ShipStation UI.
6. Flip from sandbox to production store.
