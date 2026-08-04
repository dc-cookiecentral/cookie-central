# ShipStation Integration Spec — Custom Store pattern

**Supersedes the V1 order-push design.** See ADR-028 (mechanism) + ADR-027 (retained tag vocabulary) + ADR-029 (as-built) + **ADR-031** (rush replaces the shipping-speed selector; no `ShippingMethod` is sent). Do **not** build the V1 `/orders/createorder` push or the V2 Sales Orders API (beta, not sandbox-testable).

**Boundary principle:** the app pushes *intent* (a clean order + a few fields); ShipStation resolves *fulfilment* (box, service, labels, emails). As of ADR-031 that boundary moved further toward ShipStation: the app no longer expresses a service or a box at all. No fulfilment logic is duplicated app-side.

**All ShipStation traffic is server-side** — one Supabase Edge Function (`shipstation-customstore`). Basic-Auth creds live in Vault, never in the client.

---

## The flow (3 steps)

```
1. Cortina places a sample order          →  sample_shipments (+ sample_shipment_items) row
   in the Sample Site
2. ShipStation Custom Store import (GET)   →  order appears in Dirty Cookie's ShipStation
   pulls our Orders XML                        dashboard; the co-man (a user in DC's one
                                                account) views it, prints the pack list,
                                                picks dims, buys the label, ships
3. ShipStation POSTs shipnotify (tracking) →  we update sample_shipments (tracking #,
   back to our endpoint                        carrier, status → shipped) and advance the pipeline
```

ShipStation's **Custom Store** is purpose-built for an order source with no pre-built integration: it **GET**s orders from an endpoint we expose and **POST**s a `shipnotify` back when the co-man ships. One ShipStation account (Dirty Cookie's); the co-man logs in as a user.

---

## The endpoint contract

One Edge Function, two actions dispatched by an `action` query param, both Basic-Auth protected:

### `GET  …/shipstation-customstore?action=export&start_date=…&end_date=…&page=N`
- ShipStation calls this on its import schedule (and on a manual "import orders" click).
- `start_date` / `end_date` are UTC in `MM/dd/yyyy HH:mm`. Return orders whose `created_at`/`updated_at` fall in the window.
- Emit Custom Store **Orders XML** (schema below). Support paging: honour `page` and return the `pages` attribute on `<Orders>`.
- CDATA-wrap all free-text (names, notes, item names).

### `POST …/shipstation-customstore?action=shipnotify`
- ShipStation calls this when an order ships. Body is a `ShipNotice` XML (ShipStation may also pass `order_number` / `tracking_number` / `carrier` as query params).
- Match `OrderNumber` → `sample_shipments.shipment_no`; write `tracking_number`, `carrier`, `service`, `shipped_at`, set `status = 'shipped'`; return 200.
- **If no shipment matches, log it and return 200-with-warning — never silently drop the tracking update.**

### Auth
Basic HTTP Auth on both actions. Expected creds read from Vault via `get_secret`: `SHIPSTATION_CUSTOMSTORE_USER`, `SHIPSTATION_CUSTOMSTORE_PASS`. Non-matching → **401**. (Server-side only; never `VITE_*`.)

---

## XML schemas

### Orders export (GET response)
```xml
<?xml version="1.0" encoding="utf-8"?>
<Orders pages="1">
  <Order>
    <OrderID>{sample_shipments.id}</OrderID>
    <OrderNumber>{shipment_no}</OrderNumber>
    <OrderDate>{created_at, MM/dd/yyyy HH:mm}</OrderDate>
    <OrderStatus>{status}</OrderStatus>                 <!-- app status verbatim: submitted|processing|shipped|delivered -->
    <LastModified>{updated_at}</LastModified>
    <!-- ShippingMethod deliberately omitted (XSD minOccurs="0") — ShipStation owns service choice (ADR-031) -->
    <OrderTotal>0.00</OrderTotal>                        <!-- REQUIRED by ShipStation's XSD; samples are free -->
    <CustomField1>{rush ? 'rush' : ''}</CustomField1>
    <CustomField2>{any custom line ? 'custom-request' : ''}</CustomField2>
    <CustomField3></CustomField3>                        <!-- reserved / unused -->
    <InternalNotes><![CDATA[ notes · deliver-by · handling(temp) ·
        custom lines (spec + project #) ]]></InternalNotes>
    <Customer>
      <CustomerCode>{salesperson email}</CustomerCode>
      <BillTo><Name><![CDATA[{account}]]></Name></BillTo>
      <ShipTo>
        <Name><![CDATA[{addresses.contact_name}]]></Name>
        <Company><![CDATA[{addresses.company}]]></Company>
        <Address1><![CDATA[{addresses.street}]]></Address1>
        <City><![CDATA[{addresses.city}]]></City>
        <State>{addresses.state — must be 2-char}</State>
        <PostalCode>{addresses.zip — validated}</PostalCode>
        <Country>US</Country>                        <!-- required by ShipStation's ShipTo schema -->
      </ShipTo>
    </Customer>
    <Items>
      <Item>                                             <!-- real lines only (product_code not null) -->
        <SKU>{product_code}</SKU>
        <Name><![CDATA[{description}]]></Name>
        <Quantity>{qty}</Quantity>
        <UnitPrice>0.00</UnitPrice>
      </Item>
    </Items>
  </Order>
</Orders>
```
- **`<Country>` = `US`** — required by ShipStation's `ShipTo` schema; a missing Country makes ShipStation reject the whole import batch. Samples are US-only.
- **Custom lines** (`custom = true`, no `product_code`) **are** emitted as `<Item>` under the stable synthetic SKU **`CUSTOM`**, with the spec + `project_no` as the `<Name>`. They *also* ride `InternalNotes` and flag `CustomField2 = custom-request` (the manual-review rule keys on that). *(Changed Aug 4 2026 — ADR-035; previously excluded for lacking a SKU.)*
- **Collateral** is emitted as one `<Item>` per piece under `COLLATERAL-<SLUG>`, quantity 1, and is **no longer written to `InternalNotes`** — it would otherwise print twice on the packing slip.

### ShipNotify (POST body)

ShipStation calls the **same endpoint** with `?action=shipnotify`, and also passes
`order_number` / `carrier` / `service` / `tracking_number` as **query params** —
the handler prefers the body and falls back to the query string.

```xml
<ShipNotice>
  <OrderNumber>ABC123</OrderNumber>        <!-- → sample_shipments.shipment_no (match key) -->
  <OrderID>123456</OrderID>
  <CustomerCode>customer@mystore.com</CustomerCode>
  <CustomerNotes/> <InternalNotes/> <NotesToCustomer/>
  <NotifyCustomer/>                        <!-- bool: did ShipStation email the buyer -->
  <LabelCreateDate>10/19/2019 12:56</LabelCreateDate>  <!-- → label_created_at -->
  <ShipDate>10/19/2019</ShipDate>          <!-- DATE-ONLY → shipped_at -->
  <Carrier>USPS</Carrier> <Service>Priority Mail</Service>
  <TrackingNumber>1Z909084330298430820</TrackingNumber>
  <ShippingCost>4.95</ShippingCost>        <!-- → shipping_cost -->
  <CustomField1/> <CustomField2/> <CustomField3/>
  <Recipient>…</Recipient>
  <Items>…</Items>
</ShipNotice>
```

- **`<ShipDate>` is date-only**; `<LabelCreateDate>` carries the time. Both are captured.
- **`<ShippingCost>` is the only place a sample's real cost appears** — samples export at `UnitPrice 0.00` / `OrderTotal 0.00` by design.
- Respond **200/2xx** or ShipStation treats the notification as failed.

⚠️ **This is the ONLY push ShipStation makes.** There is no delivery event and no
order-status event — the guide states the POST exists to notify "when you ship
orders". `processing` and `delivered` are therefore unreachable through the
Custom Store; they would need ShipStation **Webhooks** (a separate feature) or
carrier tracking polling. See ADR-033.

---

## Field mapping (Sample Site → Custom Store XML)

Columns are the **real** ADR-026 names.

| Custom Store XML | Source column | Rule / note |
|---|---|---|
| `OrderNumber` | `sample_shipments.shipment_no` | match key for shipnotify |
| `OrderID` | `sample_shipments.id` | |
| `OrderDate` | `created_at` | not `required_by` |
| `OrderStatus` | `status` | app status **verbatim**; ShipStation Marketplace mapping routes submitted/processing → **Awaiting Shipment**, shipped/delivered → **Shipped** |
| `ShippingMethod` | — (**not exported**) | Omitted entirely (ADR-031). The app expresses no service preference; ShipStation's store default + automation rules decide |
| `CustomField1` | `rush` | `rush` when flagged, else empty. Internal urgency signal — **not** a speed instruction; drives the team notification |
| `CustomField2` | any `sample_shipment_items.custom` | `custom-request` (grid-visible + rule-matchable) |
| `CustomField3` | — | reserved |
| `InternalNotes` | `notes` + third-party billing **only** | 1000-char field. Collateral/custom specs are `<Item>` lines (ADR-035); deliver-by is native (ADR-034); salesperson/account/rush are CustomFields (ADR-036) |
| `CustomField1` | `salesperson.full_name` (falls back to email) | 100-char, truncated |
| `CustomField2` | `account` | 100-char, truncated |
| `CustomField3` | `rush` → `'rush'` \| `''` | ⚠️ moved from CF1 — **re-point the automation rule** |
| `CustomerCode` | `salesperson_user_id` → `user_profiles.email` | |
| `BillTo/Name` | `account` | |
| `ShipTo/*` | `addresses` `contact_name`/`company`/`street`/`city`/`state`/`zip` | **State 2-char + PostalCode validated** or skip+log |
| `Items/Item` | `sample_shipment_items` `product_code`/`description`/`qty`, `UnitPrice`=0.00 | real lines only |
| **cold-chain** | — (**not exported**) | ShipStation **product tag** on Raw SKUs (co-man); auto-applied on import |

---

## Tags, collateral & the multi-item pitfall (retained from ADR-027)

- **Never rule on raw SKU.** ShipStation *Item SKU* automation criteria silently ignore any multi-item order, and sample manifests are usually multi-item. **cold-chain** is therefore a **product tag** the co-man applies to each Raw product record once; ShipStation auto-applies it to any order containing that product, and automation rules run against the resulting **order** tag. A ShipStation automation keyed on that cold-chain tag applies **refrigerated handling + insulated box + a next-day service recommendation** — cold orders are expedited in ShipStation, not by the app. (Today all 8 `sample_eligible` cookies are Baked, so no Raw SKUs carry it yet — the map still must exist for when raw samples ship.)
- **rush** (supersedes the shipping-speed tiers — ADR-031) → **`CustomField1`** = `rush`. An *internal urgency flag*, not a service: a 2-day order can be urgent and an overnight one routine. The app sends **no `ShippingMethod` at all**, so ShipStation owns service selection outright. CF1 is grid-visible and rule-matchable, which is what makes it usable as a notification trigger.

  ⚠️ The checkout tells the salesperson that ticking Rush emails the team. **Nothing sends that email yet** — see ADR-031.

- **custom-request** → `CustomField2` → automation rule → **manual review** (no auto-fulfil). Kept on a CustomField so it shows in the Orders grid and matches rules — **not** buried in notes.
- **collateral incl. Warming instructions** → real `<Item>` lines (`COLLATERAL-<SLUG>`, qty 1), so they appear on the order page and the pick list natively — no packing-slip token needed for them. Free-text that remains in `InternalNotes` still needs the token. Never use CustomFields for lists (100-char silent truncation).

## Status mapping

The export sends `sample_shipments.status` **verbatim**; ShipStation's Marketplace
status fields route each value (samples are free — no "paid"). Configure:
**Awaiting Shipment Statuses** = `submitted, processing`; **Shipment Statuses** = `shipped, delivered`.

| `sample_shipments.status` (exported verbatim) | ShipStation bucket |
|---|---|
| `submitted` | Awaiting Shipment (what the co-man works) |
| `processing` | Awaiting Shipment |
| `shipped` | Shipped |
| `delivered` | Shipped *(no ShipStation "delivered"; see limitation below)* |

---

## Known limitations (see ADR-028)

1. **No import acknowledgment** — the pull model gives no per-order confirmation the order reached ShipStation. The only signal is ShipStation hitting our GET export.
2. **`delivered` not wired** — the pipeline ends at **shipped**; no carrier delivery-event polling yet.
3. **Silent import rejection** — a malformed `State` (non-2-char) or `PostalCode` can be dropped by ShipStation with no error; the export validates and skips+logs bad rows.
4. **Automation rules are launch-blocking** — the cold-chain, custom-request and rush behaviours don't exist until configured in ShipStation (see the setup checklist). Service mapping is no longer needed: the app sends no `ShippingMethod` (ADR-031).
5. **Unmatched shipnotify** is logged, not dropped.

---

## Auth / keys
- Basic-Auth creds (`SHIPSTATION_CUSTOMSTORE_USER` / `_PASS`) in Supabase Vault via `set_secret`; reuse the `get_secret`/`set_secret` RPCs (ADR-021). Never in `VITE_*`.

## Account-side setup
See **`docs/SHIPSTATION_SETUP_CHECKLIST.md`** — connect the Custom Store, set the endpoint URL + Basic-Auth creds, map statuses + shipping methods, have the co-man tag Raw SKUs `cold-chain`, set the automation rules (launch-blocking), the email BCC, and the packing-slip token.

## Build order (Phase 3)
1. ~~Sandbox/duplicate ShipStation store first.~~ **Abandoned** — the behaviours needing test aren't available in a sandbox store. Work runs against production, with app-side **test mode** (`VITE_SAMPLE_TEST_MODE`) as the safety net. See ADR-029 and checklist §8b.
2. Lock the tag/field contract with the co-man (ADR-028).
3. Edge Function `shipstation-customstore` (export + shipnotify; Basic Auth via Vault) + the writeback migration.
4. Account-side config (setup checklist), incl. the launch-blocking automation rules + method-mapping.
5. Verify via a **manual store import** — confirm a sample order lands with fields mapped (no label purchase needed for the mapping test).
6. Internal stress test under **test mode** (`VITE_SAMPLE_TEST_MODE=true`), then clear the flag and purge `SMP-TEST-%` on both sides at go-live — checklist §8b/§9.
