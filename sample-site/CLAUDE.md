# Dirty Cookie Sample Ordering Site (Sample Central)

**This folder is the entry point for this project. Start sessions here.**

Cookie Central is several unrelated projects in one repo. This is one of them:
the site where Cortina salespeople build sample shipments, which flow to Dirty
Cookie's co-manufacturer through ShipStation.

## ⚠️ Not this project

If a task is about **inventory, forecasting, POs, weekly Retail Link reports, the
Gmail ingest pipeline, or the Cookulator** — that is a *different* Cookie Central
project. It shares this repo, the Supabase project and some infrastructure, but
its goals, data and decisions are separate. Don't conflate them. The one genuine
overlap is noted under *Shared infrastructure* below.

## Where the code actually lives

Only docs live in this folder. **The code cannot move here**, and that is
deliberate — the Supabase CLI requires `supabase/migrations/` and
`supabase/functions/<name>/` at the repo root (moving them breaks
`db push` / `functions deploy`, and the remote migration history is keyed to
those paths), and Vite builds the frontend from `src/`.

All paths below are relative to the repo root, `..` from here.

| What | Where |
|---|---|
| Sample builder UI | `src/pages/SampleCentral.jsx` |
| Its hook / helpers | `src/hooks/useSampleCentral.js`, `src/utils/sampleCentral.js` |
| Router entry | `src/App.jsx` *(shared with other projects — edit carefully)* |
| ShipStation export + shipnotify | `supabase/functions/shipstation-customstore/` |
| Deliver By sweep | `supabase/functions/shipstation-deliverby/` |
| Pure helpers + tests | `supabase/functions/_shared/shipstation.ts`, `…_test.ts` |
| Migrations | `supabase/migrations/2026071516*`, `2026072*`, `2026080412*` |
| **ADRs** | `docs/DECISIONS.md` — **ADR-026 … ADR-040** are this project. Earlier ones are not. |

ADRs stay in the shared file on purpose: the `supersedes` / `amends` chains cross
into earlier ADRs, and renumbering would break them.

## Running things

```bash
deno test --allow-all supabase/functions/_shared/shipstation_test.ts   # 112 cases
deno check --import-map=supabase/functions/import_map.json supabase/functions/_shared/shipstation.ts
npx supabase functions deploy shipstation-customstore                  # bypasses git — deploys immediately
npm run build
```

`deno` is at `~/.deno/bin/deno` (not on PATH by default). There is **no Docker**,
so `supabase db dump` / local stack do not work. For read-only SQL against the
live database, use the Management API with the CLI's stored token:

```bash
TOK=$(cat ~/.supabase/access-token); REF=$(cat supabase/.temp/project-ref)
curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"query":"select 1;"}'
```

## The ShipStation field contract (as of Aug 4 2026 — ADR-037, ADR-038)

| ShipStation field | Carries |
|---|---|
| `<Items>` | catalog products **with** SKU; custom lines and collateral with an **empty** `<SKU></SKU>` |
| Deliver By (native) | `required_by`, stamped by the 15-min sweep |
| `InternalNotes` | `RUSH` (leading, when flagged) + the site note |
| `CustomerNotes` ("Notes from Buyer") | third-party billing |
| `CustomField1 / 2 / 3` | salesperson / account / **manual temp override** |

Naming quirk: the column is `required_by` everywhere in code; every **human-facing**
label says **"Deliver by"**. Deliberate — renaming the column wasn't worth the churn.

## Gotchas that cost real time

- **The Custom Store is a pull.** ShipStation fetches on its own schedule; a
  malformed export surfaces **no error anywhere**. The unit tests are the only
  thing that catches it before ShipStation does.
- **A missing required XML field rejects the WHOLE batch**, silently. Never drop
  an element to "clean up" without checking the XSD notes in ADR-029.
- **Automation rules run once**, on import. A value changed afterwards never
  re-triggers them.
- **Never write rules on Item SKU** — ShipStation ignores them on any multi-item
  order, and sample manifests are usually multi-item. Use product tags or order tags.
- **No sandbox.** This is the production store. `VITE_SAMPLE_TEST_MODE=true`
  prefixes `SMP-TEST-####` but does **not** withhold orders from the co-man's
  real queue.
- **V2's shipments API does not reflect ORDER status.** `shipment_status` is the
  label lifecycle (`pending`/`processing`/`label_purchased`/`on_hold`/`cancelled`).
  An order in **Awaiting Payment** has no shipment record at all (ADR-039); an
  order **On Hold** still reads `pending` (ADR-040). Anything needing true order
  status needs a **V1 key** — which the project deliberately does not hold.
- **NEVER call `POST /v2/shipments`.** It creates a shipment ShipStation files
  under its own pseudo-store ("API Shipments"), separate from the Custom Store —
  orders there bypass `shipnotify` writeback and the status mapping entirely. A
  one-off probe on Aug 4 2026 created that store and it had to be cleaned up by
  hand. The sweep only ever GETs and PUTs; keep it that way. The sweep's response
  includes a `stores` map as a standing guard — it should always show **one**
  store id for all orders.
- **The export selects on `updated_at` alone — never on status — and the
  `set_updated_at_sample_shipments` trigger fires on every UPDATE.** So anything
  that writes to `sample_shipments` puts that row in the very next export window.
  This built a live feedback loop: the sweep wrote `cancelled`, the trigger
  bumped `updated_at`, the export handed the order back to ShipStation as
  Awaiting Shipment, and the sweep then flipped the site back to `submitted` —
  the cancel erased itself, silently. Fixed via `NO_EXPORT_STATUSES` plus
  explicit `cancelled`/`on_hold` mappings, but **assume any status write you add
  will be re-exported within the window.**
- **`shipnotify` sends `Carrier` as a DISPLAY NAME** — `"UPS"`, not the carrier
  code `"ups"`, and `Service` arrives decorated as `"UPS® Ground"`. Anything
  matching on carrier must normalise, or it will match nothing and fail
  invisibly.
- **`shipstation-deliverby/index.ts` has no unit tests** — the 112-case suite
  covers `_shared` only. A bug there (1,640 no-op UPDATEs, a 2-minute run)
  reached production and was caught by a live run. Verify changes by invoking
  the function, not by trusting `deno check`.
- **`cron.job_run_details.status = 'succeeded'` does NOT mean the job worked.**
  `net.http_post` is fire-and-forget; it only means the request was queued. The
  real outcome is in `net._http_response`. This masked a dead cron for hours.

## Shared infrastructure — the one real overlap

`EDGE_CRON_BEARER` (Vault) is the bearer for **every** pg_cron → Edge Function
call in the repo, this project's and the other project's. It held a 26-char
placeholder until **Aug 4 2026**, so every scheduled job had been returning
`401 UNAUTHORIZED_INVALID_JWT_FORMAT` since creation — the Deliver By sweep from
day one, the other project's Gmail poll for ~2 months. Now set to the real
service-role key (219 chars, 3 segments) and verified `200`.

If a scheduled job ever looks dead, check **`net._http_response`** — not
`cron.job_run_details`.

## Current state

**Live and verified:** the ShipStation export, the Deliver By sweep (15-min cron,
unattended), the field contract, `shipstation-probe`, `cancelled` sync, and the
rebuilt **Shipments** tab (renamed from "Pending Shipments").

**The Salesperson dropdown holds 27 reps** (25 Cortina + Caroline and David
Landeck) as of Aug 11. `sales_reps` is a lookup list, **not auth** — no rep has
a login. The selected rep's email goes to `<BillTo><Email>`, which is the only
address ShipStation notifies. Caveats — a shared mailbox carrying two names,
three name/email mismatches, and a source file that may include non-sales
contacts — are in `docs/SAMPLE_CENTRAL_STATUS.md`.

**The Deliver By sweep no longer pages ShipStation history.** It caches
`shipstation_order_id` on first sight and resolves via `GET /v2/shipments/{id}`,
scanning only for orders it cannot resolve and exiting once they are found.
**~17s → 3.9s**, and it no longer grows with the account. *(The old note here
said this was the pick-up point. It is done.)*

**`on_hold` does NOT work and cannot** — V2's `shipment_status` is the label
lifecycle, so an order On Hold still reads `pending`. Reaching it needs a V1 key.

⚠️ **`delivered` is the live question — and it is nearly free.** Forcing
`SMP-TEST-1053` to `delivered` on Aug 6 proved **every layer already handles it**:
the sweep stops tracking it, the export reports it to ShipStation as `shipped`,
`syncedStatus` refuses to overwrite it, the DB CHECK permits it, the UI renders
it. The whole feature reduces to **one thing writing the column.** What is
missing is only a source:

- `GET /v2/tracking` → **401, entitlement wall.** Probed Aug 6; the message is
  "upgrade your billing plan or add required features". `/v2/carriers` returns
  200 from the same key, which is what proves it is entitlement and not auth.
- `/v2/environment/webhooks` → **200, `[]`.** Webhooks are reachable with no
  subscriptions. Whether the `track` event is gated by the same entitlement is
  **untested** — it needs a POST, which the probe deliberately will not do.
- **Carrier-direct** (UPS/USPS free tracking APIs) needs no ShipStation change at
  all. `tracking_number` and `carrier` are already stored.

**Open, undecided:**
- The `delivered` source, above.
- `processing` is written by **nothing, ever**, and cannot be sourced from V2 —
  its `processing` bucket is the label lifecycle, not "the co-man is picking
  this". It is removed from the UI pipeline but still legal in the DB CHECK.
- `custom-request` has no rule-matchable home (no CustomField, no SKU). An
  **Order Tag** is the only safe route. Unbuilt.

**Read `sample-site/docs/SAMPLE_CENTRAL_STATUS.md` for the authoritative
current state** — it is kept more current than this file.

## Working agreement

The build plan and ADRs are a **living plan, not a contract**. When evidence
contradicts them, say so and propose the amendment — but **confirm with Caroline
before editing them**.
