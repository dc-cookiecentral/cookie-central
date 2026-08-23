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
| Cortina copy/print order sheet | `src/utils/orderSheet.js` *(one builder for both — paste and PDF cannot drift)* |
| ShipStation export + shipnotify | `supabase/functions/shipstation-customstore/` |
| Deliver By sweep | `supabase/functions/shipstation-deliverby/` |
| Read-only inspector | `supabase/functions/shipstation-probe/` |
| Pure helpers + tests | `supabase/functions/_shared/shipstation.ts`, `…_test.ts` |
| Migrations | `supabase/migrations/20260715 16–18*`, `202607 2*`, and everything from `20260804*` on |
| **ADRs** | `docs/DECISIONS.md` — **ADR-026 … ADR-046** are this project. Earlier ones are not. |

ADRs stay in the shared file on purpose: the `supersedes` / `amends` chains cross
into earlier ADRs, and renumbering would break them.

## Running things

```bash
deno test --allow-all supabase/functions/_shared/shipstation_test.ts
deno check --import-map=supabase/functions/import_map.json supabase/functions/_shared/shipstation.ts
npx supabase functions deploy shipstation-customstore                  # bypasses git — deploys immediately
npm run build
```

`deno` lives at `~/.deno/bin/deno`; call it by full path if your shell's PATH
does not have it. There is **no Docker**, so `supabase db dump` and the local
stack (`supabase start`) do not work.

✅ **`supabase db push` DOES work — this doc used to say otherwise and was
wrong.** It talks to the remote database directly; Docker is needed only for the
local stack. Corrected in ADR-047, which used it to repair the ledger.

⚠️ **Ledger drift is real but small, and it is self-inflicted.** Every migration
applied through the Management API executes **without recording a history row**,
so the ledger falls behind by exactly the number applied that way. The 12-file
drift that stood from Aug 11 was repaired on **Aug 19** (`migration repair
--status applied`, after probing the live schema to confirm each was genuinely
present).

**As of Aug 23 2026 the ledger is IN SYNC: 72 registered, 72 files, 0
unregistered.** It drifted by 3 earlier the same day — the EOS migrations applied
through the Management API — and was repaired with
`npx supabase migration repair --status applied <version>`, which marks a
migration registered **without re-running it**. That is the right tool when the
SQL is already applied; `db push` would re-run it (safe here, since all are
guarded, but it is not what happened).

Do not read `migration list` as the truth about what is applied.

**If you apply SQL through the Management API, you have just created drift.**
Register it afterwards or write it down.

For read-only SQL against the live database — and for *applying* a migration,
which is how every one since `20260805050000` has gone in — use the Management
API with the CLI's stored token:

```bash
TOK=$(cat ~/.supabase/access-token); REF=$(cat supabase/.temp/project-ref)
curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"query":"select 1;"}'
```

## The ShipStation field contract (ADR-037, ADR-038 — current as of Aug 14 2026)

| ShipStation field | Carries |
|---|---|
| `<Items>` | catalog products **with** SKU; custom lines and collateral with an **empty** `<SKU></SKU>`. Custom lines are name-prefixed `Requested Benchtop: ` (ADR-046) — a label, **not** a rule-matchable signal |
| Deliver By (native) | `required_by`, stamped by the 15-min sweep |
| `InternalNotes` | `RUSH` (leading, when flagged) + the site note |
| `CustomerNotes` ("Notes from Buyer") | third-party billing |
| `CustomField1 / 2 / 3` | salesperson / account / **manual temp override** |
| `<ShippingMethod>` | **nothing — deliberately not sent.** ShipStation owns service choice (ADR-031); the omission is enforced by a test, so do not "fix" the missing element |

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
- **No sandbox.** This is the production store. `VITE_SAMPLE_TEST_MODE` only
  ever prefixed `SMP-TEST-####`; it never withheld orders from the co-man's real
  queue. **Off in Production since Aug 19**, still on for **Preview** — and
  preview builds share this database and this store, so a branch-build order is
  a real order with a distinguishable number.
- **An unseeded first sign-in silently becomes internal `ops`, and this has
  happened.** Aug 19: an account created as `samplesmgmt@…` (no `n`) missed the
  `samplesmngmt@…` seed by one letter, provisioned as `ops`, and signed in with
  access to POs, payments and inventory. Copy-paste addresses into the dashboard;
  never retype them.
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
- **`shipstation-deliverby/index.ts` has no unit tests** — the suite covers
  `_shared` only. A bug there (1,640 no-op UPDATEs, a 2-minute run)
  reached production and was caught by a live run. Verify changes by invoking
  the function, not by trusting `deno check`.
- **A passing build proves nothing about the output.** Twice in one session a
  change built cleanly and was absent or wrong in the artifact: a component that
  was never rendered got tree-shaken out, and a mechanical class rewrite produced
  valid CSS with the wrong values. **Grep the built bundle for a distinctive
  string from the change.** Same for string-replace edits — they fail silently
  when the anchor text has drifted.
- **An effect that grabs focus must not depend on a value that changes as the
  user types.** `useDialog` depended on an inline `onClose`, so every keystroke
  re-ran it and threw the caret to the first focusable element. One character
  per attempt, in every field of the drawer.
- **Grid headers and rows are separate grid containers.** Tracks must be fixed
  px or `minmax(0,1fr)`; `auto` or `minmax(0,Xpx)` size to each container's own
  content, so the header drifts out from over its column.
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

## Current state — orientation only

⚠️ **`docs/SAMPLE_CENTRAL_STATUS.md` is the authoritative current state.** What
follows is only enough to orient; it is deliberately short, because the longer
version of this section drifted out of agreement with STATUS.md — and with
itself — within days. **If this section and STATUS.md disagree, STATUS.md wins,
and this section is the bug.**

**Live and verified:** the ShipStation export, the Deliver By sweep (15-min cron,
unattended, 3.9s — it caches `shipstation_order_id` and no longer pages history),
the field contract, `shipstation-probe`, `cancelled` sync, both fulfilment routes
(ADR-044), the issue log and cold-chain season (ADR-045), the Monthly Report tab,
and the rebuilt **Shipments** tab.

**Statuses:** `submitted`, `shipped` and `cancelled` work end to end.
`delivered` **is built and deployed** (ADR-043) via
`GET /v2/labels?tracking_number=` → `GET /v2/labels/{id}/track` — the `/v2/tracking`
401 that stalled this for a week was ShipEngine's path, not an entitlement wall.
`on_hold` **cannot** work without a V1 key, and `processing` is written by
nothing, ever.

**LAUNCHED Aug 19 2026.** Test mode is off in Production, `sample_shipments` is
empty, the counter floor is **1206**, and the seasonal cold rule exists in
ShipStation. The first real order will number `SMP-1206`.

**What is actually outstanding:**
- **A real carrier `DE` has never been observed.** Every layer is proven; the
  first genuine delivery is the remaining proof for ADR-043. The go-live purge
  removed the only order that ever had a tracking number, so this now rides on
  real traffic.
- **No custom SMTP.** Auth email is capped at **2/hour, project-wide** — magic
  link is unusable for anyone added later. Today's one Cortina account is
  password-provisioned, so nothing is blocked. `site_url` is also `http://` and
  the allow-list lacks the bare `https://` origin; fix both together.

**Accounts and the roster.** `sales_reps` holds **28 reps** (25 Cortina + Caroline,
David Landeck and Paul Hardy) — a lookup list, **not auth**. Logins are separate
and far rarer: `user_role_seeds` + `user_profiles`. **Seed anyone before their
first sign-in** — `COALESCE(seed.role, 'ops')` plus `ON CONFLICT (id) DO NOTHING`
means an unseeded sign-in silently becomes internal `ops` and never self-corrects.
Roster caveats (a shared mailbox under two names, three name/email mismatches, a
source file that may include non-sales contacts) are in STATUS.md.

## Working agreement

The build plan and ADRs are a **living plan, not a contract**. When evidence
contradicts them, say so and propose the amendment — but **confirm with Caroline
before editing them**.
