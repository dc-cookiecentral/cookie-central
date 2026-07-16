# ShipStation Integration Spec — Custom Store pattern

**Supersedes the V1 order-push design.** See ADR-028 (mechanism) + ADR-027 (retained tag vocabulary). Do **not** build the V1 `/orders/createorder` push or the V2 Sales Orders API (beta, not sandbox-testable).

**Boundary principle:** the app pushes *intent* (a clean order + a few fields); ShipStation resolves *fulfilment* (box, service, labels, emails). No fulfilment logic is duplicated app-side.

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
    <OrderStatus>{mapped status}</OrderStatus>          <!-- Paid | Shipped -->
    <LastModified>{updated_at}</LastModified>
    <ShippingMethod>{rush ? 'Next-Day' : 'Ground'}</ShippingMethod>
    <CustomField1>{box_spec → 'dc-box' | 'custom-box'}</CustomField1>
    <CustomField2>{any custom line ? 'custom-request' : ''}</CustomField2>
    <CustomField3></CustomField3>                        <!-- reserved / unused -->
    <InternalNotes><![CDATA[ collateral · Warming instructions · notes ·
        required-by · handling(temp) · custom lines (spec + project #) ]]></InternalNotes>
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
- **No `<Country>`** — US-only; ShipStation defaults to the store country.
- **Custom lines** (`custom = true`, no `product_code`) are **not** emitted as `<Item>` (no SKU). They ride `InternalNotes` (spec + `project_no`) **and** flag `CustomField2 = custom-request`.

### ShipNotify (POST body)
```xml
<ShipNotice>
  <OrderNumber>{shipment_no}</OrderNumber>
  <TrackingNumber>…</TrackingNumber>
  <Carrier>…</Carrier>
  <Service>…</Service>
  <ShipDate>…</ShipDate>
</ShipNotice>
```

---

## Field mapping (Sample Site → Custom Store XML)

Columns are the **real** ADR-026 names.

| Custom Store XML | Source column | Rule / note |
|---|---|---|
| `OrderNumber` | `sample_shipments.shipment_no` | match key for shipnotify |
| `OrderID` | `sample_shipments.id` | |
| `OrderDate` | `created_at` | not `required_by` |
| `OrderStatus` | `status` | submitted/processing → **Paid**; shipped/delivered → **Shipped** |
| `ShippingMethod` | `rush` | `true` → **Next-Day**, else **Ground** (→ ShipStation method-mapping → rush automation rule) |
| `CustomField1` | `box_spec` | `dc-box` / `custom-box` |
| `CustomField2` | any `sample_shipment_items.custom` | `custom-request` (grid-visible + rule-matchable) |
| `CustomField3` | — | reserved |
| `InternalNotes` | `collateral[]` + `notes` + `required_by` + `temp` + custom `custom_spec`/`project_no` | 1000-char field; lists go here, not CustomFields |
| `CustomerCode` | `salesperson_user_id` → `user_profiles.email` | |
| `BillTo/Name` | `account` | |
| `ShipTo/*` | `addresses` `contact_name`/`company`/`street`/`city`/`state`/`zip` | **State 2-char + PostalCode validated** or skip+log |
| `Items/Item` | `sample_shipment_items` `product_code`/`description`/`qty`, `UnitPrice`=0.00 | real lines only |
| **cold-chain** | — (**not exported**) | ShipStation **product tag** on Raw SKUs (co-man); auto-applied on import |

---

## Tags, collateral & the multi-item pitfall (retained from ADR-027)

- **Never rule on raw SKU.** ShipStation *Item SKU* automation criteria silently ignore any multi-item order, and sample manifests are usually multi-item. **cold-chain** is therefore a **product tag** the co-man applies to each Raw product record once; ShipStation auto-applies it to any order containing that product, and automation rules run against the resulting **order** tag. (Today all 8 `sample_eligible` cookies are Baked, so no Raw SKUs carry it yet — the map still must exist for when raw samples ship.)
- **rush** → `ShippingMethod = Next-Day` → ShipStation's requested-service **method-mapping** → automation rule applies the rush/priority handling. One signal, no redundant CustomField.
- **box** → `CustomField1` (`dc-box`/`custom-box`) → automation rule → package.
- **custom-request** → `CustomField2` → automation rule → **manual review** (no auto-fulfil). Kept on a CustomField so it shows in the Orders grid and matches rules — **not** buried in notes.
- **collateral incl. Warming instructions** → `InternalNotes`, printed via a packing-slip **Field-Replacement** token (bind the token to the Notes field). Watch the 100-char CustomField limit — lists go in the 1000-char `InternalNotes`.

## Status mapping

| `sample_shipments.status` | ShipStation |
|---|---|
| `submitted` | Paid (ready to ship — what the co-man works) |
| `processing` | Paid |
| `shipped` | Shipped |
| `delivered` | Shipped *(no ShipStation "delivered"; see limitation below)* |

---

## Known limitations (see ADR-028)

1. **No import acknowledgment** — the pull model gives no per-order confirmation the order reached ShipStation. The only signal is ShipStation hitting our GET export.
2. **`delivered` not wired** — the pipeline ends at **shipped**; no carrier delivery-event polling yet.
3. **Silent import rejection** — a malformed `State` (non-2-char) or `PostalCode` can be dropped by ShipStation with no error; the export validates and skips+logs bad rows.
4. **Automation rules + method-mapping are launch-blocking** — the rush/cold-chain/box behaviours don't exist until configured in ShipStation (see the setup checklist).
5. **Unmatched shipnotify** is logged, not dropped.

---

## Auth / keys
- Basic-Auth creds (`SHIPSTATION_CUSTOMSTORE_USER` / `_PASS`) in Supabase Vault via `set_secret`; reuse the `get_secret`/`set_secret` RPCs (ADR-021). Never in `VITE_*`.

## Account-side setup
See **`docs/SHIPSTATION_SETUP_CHECKLIST.md`** — connect the Custom Store, set the endpoint URL + Basic-Auth creds, map statuses + shipping methods, have the co-man tag Raw SKUs `cold-chain`, set the automation rules (launch-blocking), the email BCC, and the packing-slip token.

## Build order (Phase 3)
1. Sandbox/duplicate ShipStation store first.
2. Lock the tag/field contract with the co-man (ADR-028).
3. Edge Function `shipstation-customstore` (export + shipnotify; Basic Auth via Vault) + the writeback migration.
4. Account-side config (setup checklist), incl. the launch-blocking automation rules + method-mapping.
5. Verify via a **manual store import** in sandbox — confirm a sample order lands with fields mapped (no label purchase needed for the mapping test).
6. Flip Vault creds + webhook to the production store.
