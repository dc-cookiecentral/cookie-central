# Sample Central + ShipStation — Current State

**As of August 19, 2026 — LAUNCHED.** Test mode is off, the table is empty and
the first real order will number `SMP-1206`. The authoritative answer to "what's
built, what's live, what's next."

⚠️ **Still zero orders as of Oct 13 2026 — eight weeks after launch.**
`sample_shipments` and `sample_shipment_items` both hold **0 rows** (verified
against the live database; both tables have a public-read policy, so that is a
real zero and not RLS hiding anything). The first real order will still number
`SMP-1206`. Nothing is broken that anyone has found — but nothing has been used
either, and it is worth establishing whether that is genuinely no demand or the
Cortina account never being used. See the account note below.

Design *rationale* lives in `DECISIONS.md` (ADR-024→046);
account-side setup lives in `SHIPSTATION_SETUP_CHECKLIST.md`. This file is state,
not reasoning — if it disagrees with an ADR about *why*, the ADR wins. If it
disagrees with an ADR about *what is true now*, this file wins.

---

## Deployed and verified

| Layer | State |
|---|---|
| Schema | All migrations applied incl. `20260814120000` (seed_paul_hardy). **Remote ledger is NOT in sync** — see below |
| `shipstation-customstore` | Deployed. `verify_jwt=false`, Basic Auth. Export withholds exception statuses; strips XML-illegal control characters (Oct 27) |
| `shipstation-deliverby` | Deployed. 15-min cron. Resolves by cached `shipstation_order_id` — **3.9s**, no longer pages history. Emails systems@ when an order never imports (Oct 27; **send blocked until Gmail is reconnected**) |
| `shipstation-probe` | Deployed. Read-only inspector; `shipment_no`, `export_hours`, `capabilities` |
| Frontend | On `main`. **Vercel auto-deploys `main`** — merging is enough, no manual redeploy |
| ShipStation Custom Store | Connected to the **production** store (no sandbox — ADR-029). One store id: `se-531764` |
| Test mode | **OFF in Production since Aug 19.** The variable was removed from Vercel and the site rebuilt; the bundle's env literal reads `const $S=""`. Still set on **Preview** on purpose — preview builds share this database and this ShipStation store, so the prefix is what keeps a branch-build order distinguishable |
| Shipment numbering | Floor **1206** (`SHIPMENT_NO_FLOOR`), deployed before the purge. Burnt: 1044–1061, 1100–1101, 1200–1205 |

## The field contract as built (ADR-037, ADR-038)

| Element | Carries |
|---|---|
| `<Items>` | catalog products **with** SKU; custom lines and collateral with an **empty** `<SKU></SKU>`. Custom lines are name-prefixed `Requested Benchtop: ` (ADR-046) — a human-readable label, **not** rule criteria |
| Deliver By (native) | `required_by`, stamped by the 15-min sweep |
| `InternalNotes` | `RUSH` (leading, when flagged) + the site note |
| `CustomerNotes` ("Notes from Buyer") | third-party billing |
| `CustomField1 / 2 / 3` | salesperson / account / manual temp override |
| `ShippingMethod` | **not sent** — ShipStation owns service choice (ADR-031) |

## Accounts — who can sign in (August 14; state re-verified Oct 12 2026)

Distinct from the roster below, and the distinction is the whole of ADR-042: a
`sales_reps` row is a **name in a dropdown**, a `user_role_seeds` row is a
**login**. Most people need exactly one of the two.

| Account | Role | State |
|---|---|---|
| `systems@dirtycookie.com` | `admin` | canonical admin sign-in (ADR-020) |
| `caroline@dirtycookie.com` | `admin` | seeded `20260806235500` |
| `david@dirtycookie.com` | `admin` | seeded `20260601160000` |
| `paul@dirtycookie.com` | `admin` | **Paul Hardy, President.** Auth user since Jun 2 2026 and signed in that day; `20260814120000` added his `sales_reps` row and re-asserted the seed. Role verified `admin` Aug 19 |
| `samplesmgmt@cortinafoods.com` | `cortina` | the one Cortina ordering account — **no `n`**. Originally seeded as `samplesmngmt@` (typo) by `20260811120000`; the real address signed up Oct 14 2026, landed as `ops`, and was corrected to `cortina` by `20261014200000` |

**Two accounts have appeared since this table was written** (both internal, neither Sample Central specific) — `ellen@dirtycookie.com` (`finance`, signed in Sep 1 2026) and `shahira@dirtycookie.com` (`admin`, signed in Oct 9 2026). There is also one unintended `ops` account, `dlandeck@gmail.com`, created Sep 18 2026 by the unseeded-sign-in fallback this section warns about — the hazard below is not hypothetical, and that is a separate incident from the Cortina account's. Full roster and the open decision: `docs/PEOPLE.md`.

**Paul is `admin`, not `ops` or `cortina`, deliberately** — he is the President
and is meant to see everything. `cortina` is gated to Sample Central alone by the
InternalOnly wrapper, and `ops` reaches 34 tables but no admin surface. He also
has a `sales_reps` row, because he places orders himself and the selected rep's
address is what `<BillTo><Email>` notifies — the two rows are unrelated and both
were needed.

⚠️ **Seed before the magic link, every time.** `handle_new_auth_user` reads
`COALESCE(seed.role, 'ops')` and inserts `ON CONFLICT (id) DO NOTHING`, so an
unseeded first sign-in provisions as internal `ops` and **seeding afterwards does
not fix it** — only a manual `UPDATE` does, once someone notices.

⚠️ **This fired for real on Aug 19 and again on Oct 14, 2026 — and the first
fix was backwards.** The correct address is **`samplesmgmt@cortinafoods.com` — no
`n`** (Caroline, Oct 14). The Aug 11 seed read `samplesmngmt@` (with an `n`), so
the real address missed it, provisioned as internal **`ops`**, and signed in;
`InternalOnly` redirects only `cortina`, so it reached POs, payments, inventory
and the audit log. On Aug 19 that account was taken for the typo, deleted, and
re-created under the wrong seed spelling — so on Oct 14 the real address signed
up again as `ops`. `20261014200000` seeds the correct spelling, repairs the
profile to `cortina`, and deletes the `samplesmngmt@` seed. **Copy-paste the
address into the dashboard — never retype it — and confirm the spelling with the
owner before seeding.** Two addresses one letter apart is the whole failure mode.

⚠️ **And again on Sep 18, 2026, by a different route.** `dlandeck@gmail.com` —
a personal address with no seed — signed in and provisioned as internal `ops`.
Nobody created it by hand; it was simply an unseeded sign-in. Unlike the Aug 19
case it has **not** been resolved: the row is still there, still `ops`, with
write access to `purchase_orders`, `production_runs` and `cortina_invoices`.
Detail and the open decision: `docs/PEOPLE.md`. **The lesson generalises past
typos — any address a person might plausibly use needs a seed, not just the one
you expect.**

## Salesperson roster — loaded August 11, extended August 14

The Salesperson dropdown reads `sales_reps`, a plain lookup list with **no
connection to auth** (ADR-042; migrations `20260807000500` /
`20260807001500`). A rep is a name to display and an email to notify, not a
login — modelling it as authentication was the earlier mistake, and it would
have meant 25 dormant magic-link-capable accounts.

**28 reps live: 25 Cortina + Caroline, David Landeck and Paul Hardy (Dirty
Cookie).** The Cortina roster came from "Cortina OF Sales Mktg Innovations
Supplier Partners List.xlsx" (Employee Directory, 26 rows) on Aug 11 and was
applied via the Management API. Paul Hardy was added Aug 14
(`20260814120000`) — he is the third Dirty Cookie entry and, unlike the Cortina
25, also holds a login (see *Accounts* above).

The selected rep's email is what ShipStation notifies:

| Element | From |
|---|---|
| `<BillTo><Email>` | `sales_rep.email` — **the notify target** |
| `<Customer><CustomerCode>` | `sales_rep.email` — identity key for grouping, not a notify target |
| `CustomField1` | `sales_rep.full_name` |

No app change was needed for any of that; `buildOrderXml` already emitted all
three. Covered by two tests in the `_shared` suite (125 cases as of Aug 14).

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

## Migration ledger drift — repaired Aug 19, 3 files behind again

**Resolved once, and it will keep recurring, so read the mechanism not the
number.** Any migration applied through the Management API executes **without
writing a `supabase_migrations.schema_migrations` row**, so the ledger falls
behind by exactly the count applied that way.

- **Aug 11 → Aug 19:** 12 Sample Central migrations unregistered. Repaired in
  ADR-047 — each was probed in the live schema to confirm it was genuinely
  applied, then `migration repair --status applied` corrected the ledger.
- **Aug 23:** drifted by 3 — the EOS migrations applied that day through the
  Management API (`20260823120000`, `20260823140000`, `20260823160000`) —
  **and repaired the same day.**

- **Aug 24:** the four Demand Planner migrations (`20260824120000`–`150000`)
  landed registered — no repair needed.

**Current state: 76 registered, 76 files, 0 unregistered. In sync — re-verified
Oct 13 2026** with `npx supabase migration list` (every entry `local` ==
`remote`). Was 72/72 at Aug 23 2026.

✅ **`supabase db push` works.** This doc and the README both used to say it did
not, for want of Docker. That was wrong: `db push` talks to the remote database
directly, and Docker is only needed for the local stack (`supabase start`).

**Use `migration repair --status applied <version>` when the SQL is already
applied** — it registers without re-running. `db push` re-runs, which is safe
for guarded migrations but is not the same operation. Both fix the ledger.

⚠️ Never read `migration list` as the truth about what is applied.

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

One table, not two: the Reports tab needs both routes in one query. The
separation is presentational — a "Cortina orders" section in the Shipments tab,
with only the columns that can ever be filled (items, deliver-by, placed).

**Confirmation for Cortina orders is manual.** They get no ShipStation email, so
the expanded card offers **Copy for email** (writes `text/html` and `text/plain`
in one `ClipboardItem`, so a Gmail paste keeps its formatting) and **Print /
Save as PDF** (a print window; no PDF library). Both render from one builder in
`src/utils/orderSheet.js`, so paste and PDF cannot drift. The footer points at
**Cortina's Samples Management team** — they pack, ship and hold these parcels;
Dirty Cookie can do none of those.

An automated sender was scoped and **abandoned** on Aug 13 (ADR-044) — a vendor
account, a key in Vault and SPF/DKIM surgery on a domain that already sends
through Google Workspace, all to replace a button press on the exception route.
Manual is the decision, not a stopgap. *(The existing Gmail integration was
never an option either: scope is deliberately `gmail.readonly`, and it belongs
to the other project in this repo.)*

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

## Reports — renamed from Monthly Report, Oct 21 2026

Five stat tiles (shipments, cookies, freight, on-time, with-issues) over
**both** fulfilment routes. Columns: Order, Order Date, Account, Salesperson,
Label Bought, Shipped, **Shipping Cost** (was "Cost"), Deliver by, Delivered,
Issues. (*Shipped by* was dropped Oct 22. The Cortina section and the
shipped-by filter carry the route now.)

**Deliver by / Delivered (Oct 22 2026)** answer a different question before and
after delivery. Until the order is delivered, *Deliver by* shows the date and a
countdown (`5d left`, `due today`, `2d overdue`; amber within 2 days, red when
past). Once it is delivered, *Delivered* shows **On time** or **N days late**,
with the delivery date underneath. Days are compared as local calendar days,
so arriving at any time on the deliver-by date counts as on time
(`deliveryOutcome` in `src/utils/sampleCentral.js`). Cortina and cancelled/on-hold
orders get no countdown, since nothing will ever deliver them. The CSV carries
the same text in a *Delivery* column.

**Status sections (Oct 22 2026):** the rows are split by status, in pipeline
order: **In process** (`submitted`/`processing`), **Shipped**, **Delivered**,
then **Cortina orders** and **Cancelled / on hold** when either has rows.
Cortina rows get their own section for the same reason as on the Shipments tab:
they never leave `submitted`. When printed, each section starts on a new page.

**Filters, selection and CSV export (Oct 22 2026; this reverses the earlier
"no CSV" choice):** status, salesperson, shipped-by, order-no./account search
and "with issues only", on top of the date filter. The stat tiles follow the
filters. Rows have tick boxes, and each section has a tick-all box. **Export**
downloads the ticked rows, or every filtered row when none are ticked. Ticks on
rows the filters have hidden are ignored. The CSV has the table's columns plus
Status, Issue note and Cookies, with dates as `YYYY-MM-DD` and a UTF-8 BOM for
Excel.

**Detail window:** double-clicking a row (or clicking its order number, which is
the keyboard route) opens the same detail the Shipments tab expands to,
including the issue log. Both views render the shared `ShipmentDetail`
component. The issue panel keeps its rule: it shows for delivered orders, or any
order that already has an issue.

**Date filter** (replaced the month picker on Oct 21): a From/To range, presets
(This month, Last month, Last 30 days, Year to date, All time), and a choice of
**which date** the range applies to:

| Filter by | Column | Meaning |
|---|---|---|
| Ordered *(default)* | `created_at` | placed on the site |
| Label bought | `label_created_at` | ShipStation bought the label |
| Shipped | `shipped_at` | the ShipDate **on the label** — not a carrier scan; the site has no pickup event |

Cortina orders have no label or ship date, so they only appear under
**Ordered**. The tab says so under the controls rather than inventing a date.

Two deliberate choices: Cortina rows show `n/a` rather than `—` in carrier
columns ("not applicable", not "not yet known"), and **on-time counts only rows
with both a deliver-by and an actual delivery date**, so Cortina orders are not
phantom failures in a measure they cannot participate in.

### Wall-clock dates — fixed Oct 21 2026

`shipped_at` and `label_created_at` are **not real instants.** `parseSSDate`
stores ShipStation's wall-clock values as if they were UTC, and `<ShipDate>` is
date-only, so it lands at `00:00Z`. Rendered in local time, every ship date read
**a day early** in the US (SMP-1209: shipped Oct 21, displayed Oct 20) and label
times were hours off. Both tabs now read these two columns in UTC
(`dayKey` / `wallClockDate` / `wallClockDateTime` at the top of
`SampleCentral.jsx`). `created_at` and `delivered_at` are real timestamps and
are still read in local time.

Not fixed: the Shipments tab's 10-day "recently shipped" window still compares
`shipped_at` as an instant — at most a few hours' drift at the edge.

## Hidden test orders — Oct 21 2026

`sample_shipments.excluded` (migration `20261021120000`, applied via the
Management API) hides a row from **every** list and report total on the site.
Set on five cancelled post-launch test orders: SMP-1206, -1207, -1210, -1211,
-1212.

- **A flag, not a DELETE:** shipment numbers are minted from the max existing
  `shipment_no`, so deleting SMP-1212 would hand that number out again — and
  ShipStation already holds it. The hook filters `excluded` **client-side** and
  passes the unfiltered `allShipments` to `createShipment` for exactly this
  reason. Don't move the filter into the query.
- **No UI for it.** Hide an order by SQL:
  `update sample_shipments set excluded = true where shipment_no = '…'`.
  That bumps `updated_at` and puts the row in the next export window — harmless
  only if it is `cancelled` or `on_hold` (`NO_EXPORT_STATUSES`). **Cancel it in
  ShipStation first.**
- The export and the Deliver By sweep do not read `excluded`; both already skip
  cancelled orders.

## Never reached ShipStation — Oct 27 2026 (ADR-064)

SMP-1213 sat four days unimported: its ship-to state was `New Jersey`, the
export skips any non-2-letter state, and the only trace was a function log.

- **Alert.** The sweep emails `systems@dirtycookie.com` once when an open,
  Dirty-Cookie-fulfilled order has no `shipstation_order_id` 60 minutes after
  submission (`importAlertDue`). Latched by `not_imported_alerted_at`; the latch
  write re-queues the order for export. The site shows a **Not in ShipStation**
  flag on the same rule (`notInShipStation`, mirrored constant).
- **Sender.** systems@ itself, through the Gmail grant, which now asks for
  `gmail.send`. ⚠️ **The live grant predates that** (refresh token from Jun 2),
  so sends fail — logged in the sweep's `failed` — until someone reconnects.
  Nothing is latched on a failed send, so the first sweep after reconnect sends.
- **Fixed alongside:** control characters in the export (one U+000B invalidated
  the whole batch); a blank custom line passing the item check; unbounded
  custom-line quantity (now 1–999 and `qty >= 1`).
- **Still open:** order + items are two inserts (see BUILD_PLAN, Oct 27);
  split-order numbers and re-export overwrites are unverified.

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

### Catalog SKU labels — August 19

Catalog rows, cart lines and the pre-submit review sheet lead with the product
**type**, with the SKU alone on the line beneath:

```
COOKIE SHOT | Gourmet - Chocolate Chip 2.0 oz - Baked
CC-2OZ-BAK-G
```

`productType()` in `src/utils/sampleCentral.js` derives the three types from
`form` + `prep` — **Raw is tested first**, because every raw row is
`form=Stuffed` and reading `form` first would label all of them STUFFED COOKIE.
The label is composed in the app, **not stored**: `products.description` is
shared with the Spec Sheet and the `price_list` view, which belong to the other
Cookie Central project.

Two knock-on effects, both deliberate: the label is snapshotted into
`sample_shipment_items.description` at submit, so it is also the ShipStation item
`<Name>` and the Cortina order-sheet line (SKU codes and product tags are
untouched, so no automation rule changes behaviour); and the drawer cart line and
review list **wrap instead of truncating**, because the type prefix would
otherwise clip the flavour off the front of the very list that exists to catch
"the wrong cookie entirely".

### The catalog is 12 SKUs, and that is correct

`sample_eligible` is true on **12** products — 4 Gourmet Shot, 4 Classic
Stuffed/Baked, 4 Classic Raw. No Gourmet stuffed, no 2.0 oz stuffed, no 1.5 oz
shot. Note that migration `20260728120000` set the flag on all 27 and its verify
comment still expects Baked 18/18 and Raw 9/9 — the catalog was narrowed after
it. **Confirmed intentional by Caroline, Aug 19 2026.** Don't "fix" it back.

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
- **No sandbox.** Test mode only ever labelled orders — it never withheld them
  from the co-man's real queue. It is off in Production as of Aug 19 and remains
  on for Preview builds, which share this database and this store.
- **Auth email is capped at 2/hour, project-wide.** `rate_limit_email_sent = 2`
  with no custom SMTP configured (`smtp_host` is null — Supabase's built-in
  sender). Not per user, not per day: every magic link, confirmation and recovery
  across the whole project shares it. Dashboard **Add user + password + Auto
  Confirm** sends no email and sidesteps it. Custom SMTP is the real fix.
- **`site_url` is `http://cookiecentral.dirtycookie.com/`** and the allow-list
  carries `https://…/sample-central` but not the bare `https://` origin. Since
  `signInWithEmail` passes `emailRedirectTo: window.location.origin`, an https
  origin fails to match and falls back to the insecure site_url.
- **`shipstation-deliverby/index.ts` has no unit tests.** The suite covers
  `_shared` only. A bug in the id-caching change (1,640 no-op UPDATEs)
  reached production and was caught by a live run, not by a test.

## Launch checklist

| Item | State |
|---|---|
| §3 rush automation rule | **done** (re-pointed to `Internal Notes contains RUSH`) |
| §4 cold-chain product tags | **done** |
| §1 store status mapping | verified correct as configured |
| §A.1 Cortina user seeding | **done Aug 11.** The 25 reps needed no seeds — they are `sales_reps` rows, not logins. The single ordering account, `samplesmgmt@cortinafoods.com` ("Samples Management", role `cortina`), was seeded Aug 11 under a typo (`samplesmngmt@`, `20260811120000`), so its first real sign-in on Oct 14 2026 provisioned as internal `ops` — exactly the hazard the seed exists to prevent. Corrected by `20261014200000` (correct seed + profile repaired to `cortina`) |
| §9 go-live cleanup | **done Aug 19.** Sequence was: raise the floor 1200 → **1206** and *deploy it*, cancel the ShipStation orders, purge the table, then remove `VITE_SAMPLE_TEST_MODE` and rebuild. Order matters — the counter derives from the table, so purging before the floor deploys reissues burnt numbers |
| §3/§4 seasonal cold rule | **done Aug 19** — created in ShipStation by Caroline. ⚠️ Not verifiable from this repo: automation rules are not exposed by the V2 API and `shipstation-probe` reads orders only. If cold handling ever fails to fire, check the rule is keyed on **Raw SKU product tags**, not Item SKU — Item SKU rules are ignored on multi-item orders, and sample manifests usually are |

## Loose ends

- ~~**`SMP-TEST-1053` is still forced to `delivered`**~~ — **resolved**, and
  1100/1101 went with the Aug 11 purge too.
- ~~**`SMP-TEST-1200` is still live**~~ — **resolved Aug 19.** The go-live purge
  removed all six test orders (1200–1205, 26 items; `sample_shipment_items`
  cascades). `sample_shipments` is **empty**. 1201 and 1202 were **Cortina-fulfilled**
  and had no ShipStation record at all, which is why the sweep only ever
  `considered` three — it filters on `fulfilled_by = SHIPSTATION_FULFILLER`.
- **The first real delivery is the outstanding proof** for ADR-043. Everything
  else in that chain is built, deployed and unit-tested. ⚠️ The purge removed
  `SMP-TEST-1200`, the only order that ever carried a real tracking number, so
  this now rides entirely on real traffic.
- **Two cron runs returned no response** on Aug 19 (20:00 and 20:15 UTC:
  `status_code` null in `net._http_response`), recovering unaided at 20:30. Watch
  it. `cron.job_run_details` reports `succeeded` either way — `net._http_response`
  is the table that tells the truth.
- ~~**No ADR yet for the cancelled-resurrection loop.**~~ — **resolved.** It is
  **ADR-041**, which corrects ADR-040's "verified end to end".
- **`DECISIONS.md` still says "Pending Shipments"** in ADR-030/032. Left alone
  deliberately — those record what was decided at the time.
