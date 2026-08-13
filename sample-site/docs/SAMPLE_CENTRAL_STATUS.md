# Sample Central + ShipStation — Current State

**As of August 13, 2026.** The authoritative answer to "what's built, what's live,
what's next." Design *rationale* lives in `DECISIONS.md` (ADR-024→040);
account-side setup lives in `SHIPSTATION_SETUP_CHECKLIST.md`. This file is state,
not reasoning — if it disagrees with an ADR about *why*, the ADR wins. If it
disagrees with an ADR about *what is true now*, this file wins.

---

## Deployed and verified

| Layer | State |
|---|---|
| Schema | All migrations applied incl. `20260812190000` (fulfilled_by). **Remote ledger is NOT in sync** — see below |
| `shipstation-customstore` | Deployed. `verify_jwt=false`, Basic Auth. Export withholds exception statuses |
| `shipstation-deliverby` | Deployed. 15-min cron. Resolves by cached `shipstation_order_id` — **3.9s**, no longer pages history |
| `shipstation-probe` | Deployed. Read-only inspector; `shipment_no`, `export_hours`, `capabilities` |
| Frontend | On `main`. **Vercel auto-deploys `main`** — merging is enough, no manual redeploy |
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
connection to auth** (ADR-042; migrations `20260807000500` /
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

`supabase_migrations.schema_migrations` tops out at **`20260805050000`** with 52
rows registered. **11 repo migrations are applied to the database but
unregistered**, because the no-Docker workflow runs SQL through the Management
API, which executes without recording a history row:

```
20260806235500_seed_caroline              20260811140000_sample_shipment_delivery
20260807000500_sales_reps                 20260812120000_addresses_active
20260807001500_drop_salesperson_user_id   20260812150000_sample_shipment_issues
20260807120000_seed_david_sales_rep       20260812170000_sample_settings
20260810120000_seed_cortina_sales_reps    20260812190000_fulfilled_by
20260811120000_seed_cortina_ordering_account
```

All of them replay cleanly — every one is `INSERT … ON CONFLICT DO UPDATE`,
`ADD COLUMN IF NOT EXISTS`, or otherwise `IF EXISTS`-guarded — so a `db push`
would apply them against the live database without error and leave it in its
current state. Bookkeeping gap, not a landmine. *(Reasoned from the SQL plus the
live schema; not tested by an actual push, since there is no Docker and no
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
| `delivered` | the sweep's delivery poll (ADR-043) | yes — **but no real carrier `DE` observed yet** |
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

## `delivered` — solved, and the 401 was a red herring (ADR-043)

`GET /v2/tracking` is **ShipEngine's** path and is not part of ShipStation V2 at
all — the V2 release notes list only `POST /v2/tracking/stop` under it. Its 401
means "this API does not offer that", **not** "your plan is too small". No
upgrade would have fixed it, and the account was never the problem. ADR-034,
ADR-039 and every note since said otherwise for about a week.

What works, on every plan, verified live Aug 11:

```
GET /v2/labels?tracking_number=…   200   label_id
GET /v2/labels/{label_id}/track    200   status_code, actual_delivery_date
```

The 15-minute sweep now has a **third job**: for `shipped` orders it resolves a
`label_id` once (cached in `shipstation_label_id`), then polls the track log.
`status_code === 'DE'` writes `status='delivered'` + `delivered_at` from the
carrier's own timestamp. `SP` (locker / collection point) is deliberately NOT
delivered — the rep does not have it.

⚠️ **Still unproven end to end.** The endpoint is verified, the mapper has 10
unit tests, and the poll has run live against two real labels — caching their
ids and correctly declining to deliver them. But **no genuine `DE` has been
observed**, because both test parcels were marked shipped by hand and never
entered UPS's network. The first real delivery is the remaining proof.

## Two fulfilment routes (ADR-044)

`sample_shipments.fulfilled_by` — `'Dirty Cookie | Kukibell'` (default) or
`'Cortina'`. Cortina ships some samples from their own warehouse; those orders
must never reach the co-man's queue.

**The export filters on an ALLOWLIST**, sending only rows exactly equal to
`SHIPSTATION_FULFILLER`. A typo, a rename or a third fulfiller fails by NOT
reaching the co-man — the safe direction. `!= 'Cortina'` would fail the other
way, silently. The same filter is on the sweep, without which every Cortina
order pages ShipStation's bucket history every 15 minutes hunting a shipment
that does not exist.

One table, not two: the monthly report needs both routes in one query. The
separation is presentational — a "Cortina orders" section in the Shipments tab,
with only the columns that can ever be filled (items, deliver-by, placed).

**Confirmation for Cortina orders is manual.** They get no ShipStation email, so
the expanded card offers **Copy for email** (writes `text/html` and `text/plain`
in one `ClipboardItem`, so a Gmail paste keeps its formatting) and **Print /
Save as PDF** (a print window; no PDF library). Both render from one builder in
`src/utils/orderSheet.js`, so paste and PDF cannot drift. The footer points at
**Cortina's Samples Management team** — they pack, ship and hold these parcels;
Dirty Cookie can do none of those.

An automated sender is **parked**, blocked on a provider API key and SPF/DKIM on
`dirtycookie.com`. The existing Gmail integration cannot be reused: scope is
deliberately `gmail.readonly`, and it belongs to the other project in this repo.

## Site-owned operational data (ADR-045)

Neither of these is sent to ShipStation, for one shared reason: every outbound
field is an instruction sent *before* fulfilment and rewritten on each export
(and writing one re-exports the order — ADR-041), nothing comes back but
`shipnotify`, and shipment tags — the only real surface — stop existing once an
order leaves Awaiting Shipment, which is exactly when this data appears.

- **Issue log** (`issue_flags`, `issue_note`, `issue_at`). Seven flags plus free
  text, **delivered orders only** — every flag is a post-arrival judgement.
  Clearing everything nulls `issue_at`, so reporting never counts a shipment
  that turned out fine. Reporting query is in the migration header.
- **Cold-chain season** (`sample_settings.cold_chain_season`). A live switch,
  **currently ON** (set Aug 12). Forces every new order to Cold and the badge
  reads "from summer season". Read by any signed-in user, written by admin/ops.
  Existing orders keep the temp they were created with — a stored snapshot
  (ADR-026), not a live attribute.

⚠️ **The ShipStation half of the season does not exist.** Its cold-chain rules
key off product tags on Raw SKUs, so a Baked-only order says Cold on the site
and is **not** auto-upgraded there. A blanket seasonal automation rule closes
it, and needs no per-order signal precisely because it applies to everything.
**Until then the two systems disagree, and the site is the one making the
claim.**

## Monthly report

A tab, on-screen only (no CSV, by choice). Month picker, five stat tiles
(shipments, cookies, freight, on-time, with-issues) and a table across **both**
fulfilment routes. Windowed by ship date, falling back to order date for Cortina
rows — which have no ship date and would otherwise appear in no month at all.

Two deliberate choices: Cortina rows show `n/a` rather than `—` in carrier
columns ("not applicable", not "not yet known"), and **on-time counts only rows
with both a deliver-by and an actual delivery date**, so Cortina orders are not
phantom failures in a measure they cannot participate in.

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
| §A.1 Cortina user seeding | **done Aug 11.** The 25 reps needed no seeds — they are `sales_reps` rows, not logins. The single ordering account, `samplesmngmt@cortinafoods.com` ("Samples Management", role `cortina`), is seeded and verified (`20260811120000`). It has **not signed in yet**, which is precisely why the seed had to land first: an unseeded first sign-in provisions as internal `ops` and does not self-correct |
| §9 go-live cleanup | **partly done.** `SMP-TEST-%` purged and labels voided Aug 11; counter floor raised 1100 → **1200** and deployed (burnt: 1044–1061, 1100–1101 — voiding a label does not free the number). **Still outstanding: clear `VITE_SAMPLE_TEST_MODE`** — it is still `true` in the live bundle |
| §3/§4 seasonal cold rule | **outstanding, and now load-bearing** — the site asserts Cold on every new order (ADR-045); ShipStation will not act on it without a blanket rule |

## Loose ends

- ~~**`SMP-TEST-1053` is still forced to `delivered`**~~ — **resolved**, and
  1100/1101 went with the Aug 11 purge too. The table now holds one row:
  **`SMP-TEST-1200`**, placed Aug 12, `submitted`, awaiting the co-man's label.
  Its export was verified clean via `shipstation-probe` `{"export_hours": 4}`.
- **The first real delivery is the outstanding proof** for ADR-043. Everything
  else in that chain is built, deployed and unit-tested.
- ~~**No ADR yet for the cancelled-resurrection loop.**~~ — **resolved.** It is
  **ADR-041**, which corrects ADR-040's "verified end to end".
- **`DECISIONS.md` still says "Pending Shipments"** in ADR-030/032. Left alone
  deliberately — those record what was decided at the time.
