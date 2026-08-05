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
| **ADRs** | `docs/DECISIONS.md` — **ADR-026 … ADR-038** are this project. Earlier ones are not. |

ADRs stay in the shared file on purpose: the `supersedes` / `amends` chains cross
into earlier ADRs, and renumbering would break them.

## Running things

```bash
deno test --allow-all supabase/functions/_shared/shipstation_test.ts   # 100 cases
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
- **NEVER call `POST /v2/shipments`.** It creates a shipment ShipStation files
  under its own pseudo-store ("API Shipments"), separate from the Custom Store —
  orders there bypass `shipnotify` writeback and the status mapping entirely. A
  one-off probe on Aug 4 2026 created that store and it had to be cleaned up by
  hand. The sweep only ever GETs and PUTs; keep it that way. The sweep's response
  includes a `stores` map as a standing guard — it should always show **one**
  store id for all orders.
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

**Live:** the ShipStation export (item lines, the CustomField contract, RUSH,
billing) and the Deliver By sweep function — both deployed, verified against
`SMP-TEST-1055`.

**Blocked:**
1. **The "Deliver by" UI rename is not live.** `feat/shipstation` is pushed but
   Vercel builds production from `main`, so the site still reads "Required by".
   Needs a PR merge.
2. **The rush rule is mis-pointed** — still reads `CustomField1 = rush`. Must
   become `Internal Notes contains RUSH` or rush orders notify no one.

**Open, undecided:**
- `delivered` is unreachable — the Custom Store has no delivery event, and V2's
  `shipment_status` enum (`pending`/`processing`/`label_purchased`/`on_hold`/
  `cancelled`) has no `delivered`. `GET /v2/tracking` is gated behind a plan
  upgrade. Routes left: a ShipStation webhook, or BCC'ing the Delivered
  notification into a mailbox.
- `cancelled` / `on_hold` are visible in ShipStation but invisible to the site —
  `sample_shipments.status` has no such values.
- `custom-request` has no rule-matchable home (no CustomField, no SKU). An
  **Order Tag** is the only safe route. Unbuilt.

**Read `sample-site/docs/SAMPLE_CENTRAL_STATUS.md` for the authoritative
current state** — it is kept more current than this file.

## Working agreement

The build plan and ADRs are a **living plan, not a contract**. When evidence
contradicts them, say so and propose the amendment — but **confirm with Caroline
before editing them**.
