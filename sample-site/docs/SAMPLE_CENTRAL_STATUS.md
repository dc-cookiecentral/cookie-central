# Sample Central + ShipStation — Current State

**As of August 11, 2026.** The authoritative answer to "what's built, what's live,
what's next." Design *rationale* lives in `DECISIONS.md` (ADR-024→040);
account-side setup lives in `SHIPSTATION_SETUP_CHECKLIST.md`. This file is state,
not reasoning — if it disagrees with an ADR about *why*, the ADR wins. If it
disagrees with an ADR about *what is true now*, this file wins.

---

## Deployed and verified

| Layer | State |
|---|---|
| Schema | All migrations applied incl. `20260810120000` (Cortina rep roster). **Remote ledger is NOT in sync** — see below |
| `shipstation-customstore` | Deployed. `verify_jwt=false`, Basic Auth. Export withholds exception statuses |
| `shipstation-deliverby` | Deployed. 15-min cron. Resolves by cached `shipstation_order_id` — **3.9s**, no longer pages history |
| `shipstation-probe` | Deployed. Read-only inspector; `shipment_no`, `export_hours`, `capabilities` |
| Frontend | On `main`, deployed via Vercel |
| ShipStation Custom Store | Connected to the **production** store (no sandbox — ADR-029). One store id: `se-531764` |
| Test mode | `VITE_SAMPLE_TEST_MODE=true` — orders are `SMP-TEST-####` but still reach the co-man's real queue |

## The field contract as built (ADR-037, ADR-038)

| Element | Carries |
|---|---|
| `<Items>` | catalog products **with** SKU; custom lines and collateral with an **empty** `<SKU></SKU>` |
| Deliver By (native) | `required_by`, stamped by the 15-min sweep |
| `InternalNotes` | `RUSH` (leading, when flagged) + the site note |
| `CustomerNotes` ("Notes from Buyer") | third-party billing |
| `CustomField1 / 2 / 3` | salesperson / account / manual temp override |
| `ShippingMethod` | **not sent** — ShipStation owns service choice (ADR-031) |

## Salesperson roster — loaded August 11

The Salesperson dropdown reads `sales_reps`, a plain lookup list with **no
connection to auth** (ADR pending; migrations `20260807000500` /
`20260807001500`). A rep is a name to display and an email to notify, not a
login — modelling it as authentication was the earlier mistake, and it would
have meant 25 dormant magic-link-capable accounts.

**27 reps live: 25 Cortina + Caroline and David Landeck (Dirty Cookie).** The
Cortina roster came from "Cortina OF Sales Mktg Innovations Supplier Partners
List.xlsx" (Employee Directory, 26 rows) on Aug 11 and was applied via the
Management API.

The selected rep's email is what ShipStation notifies:

| Element | From |
|---|---|
| `<BillTo><Email>` | `sales_rep.email` — **the notify target** |
| `<Customer><CustomerCode>` | `sales_rep.email` — identity key for grouping, not a notify target |
| `CustomField1` | `sales_rep.full_name` |

No app change was needed for any of that; `buildOrderXml` already emitted all
three. Covered by two tests in the 115-case suite.

Three transforms were applied to the source file, all documented in the
migration header:

- **Names title-cased.** The file mixes `AGARWAL, AMIT K` with `David Rahal`,
  and the dropdown both displays and *orders by* `full_name`. This flattens
  `LiDestri` → `Lidestri` for two reps; uniform casing was the explicit call.
- **Emails lowercased.** Postgres `UNIQUE` on `text` is case-sensitive, so
  `AAgarwal@` and `aagarwal@` would otherwise both be insertable.
- **25 rows, not 26.** `murgese@cortinafoods.com` appears twice under two
  different names ("Cope, Maria Antonietta" and "Mery Urgese"). `email` is
  `UNIQUE` and both are to be selectable, so that mailbox carries **both names
  in one row**. Split it if Cortina confirms two people with two addresses.

⚠️ **Three name/email mismatches went in as the file has them** — `Alexa C
Flynn → ahill@`, `Scott C Robbins → crobbins@`, `Heather Sandford →
heather.sanford@` (one `d`). They read as name changes or preferred names, not
typos, and the email is the operative field. **If a rep reports never receiving
a notification, start here.**

⚠️ **The source file is titled "Sales Mktg Innovations Supplier Partners"** and
may include marketing, innovation and supplier contacts, not only salespeople.
Everyone in it is now selectable as the notified party on a real sample
shipment.

## Migration ledger drift

`supabase_migrations.schema_migrations` tops out at **`20260805050000`**. Five
repo migrations are applied to the database but **unregistered**, because the
no-Docker workflow runs SQL through the Management API, which executes without
recording a history row:

```
20260806235500_seed_caroline
20260807000500_sales_reps
20260807001500_drop_salesperson_user_id
20260807120000_seed_david_sales_rep
20260810120000_seed_cortina_sales_reps
```

All five were read and **replay cleanly** — every one is either
`INSERT … ON CONFLICT DO UPDATE` or `IF EXISTS`-guarded DDL, so a `db push`
would apply them against the live database without error and leave it in its
current state. Bookkeeping gap, not a landmine. *(Reasoned from the SQL plus
the live schema — not tested by an actual push, since there is no Docker and no
staging copy.)*

## Store status mapping — confirmed, not inferred

Read off the connection dialog **August 6, 2026**. ADR-039 had inferred these
from behaviour; they are now verified:

| ShipStation bucket | Token |
|---|---|
| Awaiting Payment | `unpaid` |
| Awaiting Shipment | `paid` |
| Shipped | `shipped` |
| Cancelled | `cancelled` |
| On Hold | `on_hold` |

The export maps to these explicitly (`ssStatus`): `submitted`/`processing` →
`paid`, `shipped`/`delivered` → `shipped`, `cancelled` → `cancelled`, `on_hold`
→ `on_hold`. **`NO_EXPORT_STATUSES` additionally withholds `cancelled`/`on_hold`
from the export entirely** — ShipStation owns fulfilment state, so pushing it
back would overwrite its own source of truth.

## Writeback (`shipnotify`)

Fires **once, when the co-man buys a label**. Lands `tracking_number`, `carrier`,
`service`, `shipped_at`, `label_created_at`, `shipping_cost`, and sets
`status = 'shipped'`. **There is no second callback** — nothing later moves the
order forward. That is why `delivered` needs a different mechanism entirely.

Note `carrier` arrives as a **display name** (`"UPS"`), not a carrier code, and
`service` arrives decorated (`"UPS® Ground"`). Anything matching on carrier must
normalise.

## Status reality

| Status | Written by | Works? |
|---|---|---|
| `submitted` | order creation | yes |
| `processing` | **nothing, ever** | no — and cannot be sourced from V2 (see below) |
| `shipped` | `shipnotify` on label purchase | yes |
| `delivered` | **nothing yet** | every layer handles it correctly; only a source is missing |
| `cancelled` | the sweep, from ShipStation | yes — verified end to end |
| `on_hold` | the sweep | **no** — V2 cannot detect an order-level hold |

**`processing` was removed from the UI pipeline (Aug 6).** V2 has a `processing`
bucket, but it is the *label* lifecycle, not "the co-man is picking this order."
The value remains legal in the DB CHECK and `pipelineIndex()` maps it onto
`submitted`'s slot so such a row cannot fall off the stepper.

**`delivered` was proven end to end on Aug 6** by forcing `SMP-TEST-1053` to that
status: the sweep correctly stopped tracking it, the export correctly reported
it to ShipStation as `shipped`, `syncedStatus` refused to overwrite it, and the
UI rendered the full pipeline. **The entire feature reduces to one thing writing
the column.**

## The `delivered` decision — open

Probed live August 6 (`{"capabilities": true}`):

```
/v2/carriers              200   9 carriers      ← key works; not a credential problem
/v2/environment/webhooks  200   []              ← webhooks reachable, no subscriptions
/v2/tracking              401   "You must upgrade your billing plan or
                                 add required features to access this endpoint."
```

The 200 on `/v2/carriers` is what makes this conclusive: `/v2/tracking` is a
genuine **entitlement wall**, not auth. ADR-034's original reading was correct.

Routes remaining:
1. **Enable the tracking feature** on the ShipStation account, then poll
   `/v2/tracking` for shipped orders. Reuses the Vault credential.
2. **The `track` webhook.** The webhooks endpoint is open, but whether the
   tracking event type is gated by the same entitlement is **untested** —
   finding out needs a `POST` (a write), which the probe deliberately will not do.
3. **Carrier-direct.** `tracking_number` and `carrier` are already stored; UPS
   and USPS both publish free tracking APIs, not plan-gated. One integration per
   carrier.

## UI — rebuilt August 6

Tab renamed **Pending Shipments → Shipments**. Three-stage pipeline
(`submitted → in transit → delivered`). Two sections with **independent 10-day
windows** — an order is recent by when it was *placed*, a shipment by when it
*shipped*:

- **Ordered** — order, account/salesperson, items, deliver by (+ urgency), flags
- **Shipped** — order, account, shipped, carrier, tracking (clickable), cost
- **Needs attention** — never windowed away; cancelled/on-hold orders

Search by order number **ignores the window** (the order you cannot find is
usually the old one). Expand-all acts on what is visible. Rows are grids with
per-section columns; below `sm` they collapse to stacked label/value pairs.

Status remains **read-only** (ADR-032).

## Fixed August 6

1. **Cancelled orders resurrected themselves.** `ssStatus()` had no entry for
   `cancelled`/`on_hold` and the fallback is `paid`; the export filters only on
   `updated_at`, which the trigger bumps on every UPDATE. The sweep's own write
   put the row in the next export window, where it was handed back as Awaiting
   Shipment. The cancel erased itself, silently. Fixed in two layers.
2. **Ship To had never rendered.** The frontend query never selected the address
   embed, so every card showed `—` and `, ,`. Display-only; the export was
   unaffected.
3. **Sweep scaling.** Was paging the unbounded `cancelled` bucket every run
   (~17s against a 30s timeout). Now resolves by cached `shipstation_order_id`.

## Known gaps, accepted

- **No import acknowledgment.** The Custom Store is pull-only; nothing confirms
  an order reached ShipStation. `shipstation-probe` with `export_hours` is the
  workaround — it calls our own export exactly as ShipStation does.
- **`on_hold` cannot work** without a V1 key. V2's `shipment_status` is the label
  lifecycle, so a held order still reads `pending` (ADR-040).
- **`custom-request` has no rule-matchable home.** No CustomField and no SKU, and
  ShipStation ignores Item SKU rules on multi-item orders. An **Order Tag** is
  the only safe route — unbuilt.
- **Third-party billing is informational.** No billing elements exist in the
  Custom Store XML; the co-man keys the account in by hand.
- **No sandbox.** Test mode labels orders but does not withhold them from the
  co-man's real queue.
- **`shipstation-deliverby/index.ts` has no unit tests.** The 112-case suite
  covers `_shared` only. A bug in the id-caching change (1,640 no-op UPDATEs)
  reached production and was caught by a live run, not by a test.

## Launch checklist

| Item | State |
|---|---|
| §3 rush automation rule | **done** (re-pointed to `Internal Notes contains RUSH`) |
| §4 cold-chain product tags | **done** |
| §1 store status mapping | verified correct as configured |
| §A.1 Cortina user seeding | **narrowed, still outstanding.** The 25 reps need no seeds at all now — they are `sales_reps` rows, not logins. What remains is the **single Cortina ordering account**, and that is still not self-correcting: an unseeded user provisions as internal `ops`, and seeding afterwards does not fix it |
| §9 go-live cleanup | **outstanding** — clear `VITE_SAMPLE_TEST_MODE`, redeploy, purge `SMP-TEST-%` in Supabase **and** cancel the matching orders in ShipStation |

## Loose ends

- **`SMP-TEST-1053` is still forced to `delivered`** from the Aug 6 experiment,
  with no `shipped_at`. It shows in the Shipped section. Revert when convenient.
- **No ADR yet for the cancelled-resurrection loop.** It corrects ADR-040's
  "cancelled sync works — verified end to end", which tested the sweep direction
  but never an export landing in between.
- **`DECISIONS.md` still says "Pending Shipments"** in ADR-030/032. Left alone
  deliberately — those record what was decided at the time.
