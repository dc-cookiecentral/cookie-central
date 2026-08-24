# Cookie Central

Operational dashboard for Dirty Cookie's white-label retail business (Walmart + Kroger) through Cortina Foods.

**Stack:** React + Vite + Tailwind + Supabase + Vercel
**Status** *(Aug 24 2026)*: **Walmart Demand Planner is live on real data** — see the warning block below and `docs/DEMAND_PLANNER_KNOWN_ISSUES.md`. Previously *(Aug 23)*: Phase 1 demo shipped (June 2026); launch hardening in progress. All demo modules are live against Supabase, plus the `systems@` AI email agent (Day 10) and the Lot Traceability chain UI (Day 11). One ship blocker remains before Phase 1 is declared shipped: Cortina NetSuite real-file reconciliation (awaiting Harshita's export sample). See `docs/BUILD_PLAN.md`.

> ## ⚠️ Using the Demand Planner? Read `docs/DEMAND_PLANNER_KNOWN_ISSUES.md` first.
>
> It went live on real Walmart data on **Aug 24 2026**. Most of it reconciles to
> Walmart's own totals. Two things do not, and look just as convincing:
>
> 1. **Do not plan production off it yet.** DC/DOT days-on-hand and the
>    recommended-production figures divide real demand by placeholder supply
>    (`production_runs` holds 5 rows; there is no DOT on-hand feed). PB&J reads
>    363.8 days on hand and every SKU recommends 0 cases. Trust POS, in-store
>    fill, OTIF, forecast, orders and cut recovery — not the supply side.
> 2. **`purchase_orders` is at 892 of Supabase's 1,000-row query cap**, growing
>    ~45–50/month. Around **Nov 2026** Product Orders, Payments and Alerts begin
>    silently dropping rows — no error, just less data. Fix is the `fetchAll`
>    pattern already in `src/hooks/useDemandFeeds.js`.

**Also in this repo — a separate project.** The **Sample Ordering Site (Sample Central)**, where Cortina salespeople build sample shipments that flow to the co-manufacturer through ShipStation. Built July–August 2026 (ADR-025→046) and **launched August 19, 2026** — test mode is off in Production, the table was purged, and the first real order numbers `SMP-1206`. There is still no ShipStation sandbox: **Preview** builds share the production database and store, so a branch-build order is a real order (kept `SMP-TEST-`-prefixed on purpose). It shares this repo, the Supabase project and some infrastructure, but its goals, data and decisions are separate; don't conflate the two.

**Also in this repo — a third project.** The **EOS Tracker** at `/eos`, the standing record for the weekly Level 10 leadership meeting (Scorecard, Issues, Rocks, To-Dos, Accountability Chart, V/TO). Built August 17–19, 2026 (ADR-047), **live since August 21**. 13 measurables with goals set, To-Dos that hang off a measurable and carry forward until ticked. Internal roles only — the `cortina` login cannot see any of it. See `docs/EOS.md`.

**And a new module in the main project.** The **Walmart Demand Planner** at `/demand-planner` — **Service health** (in-store fill rate + OTIF), S&OP summary, chain-flow charts, DOT cut-recovery and tracker, for WC / PBG / CCF. Live since August 21; wired to live data August 24 (ADR-053→056).

**Five of its six series are live** *(as of Aug 24 2026 — migrations applied, all six exports uploaded)* — POS, Walmart forecast, OTIF, DOT cut recovery and NetSuite orders, fed by the six weekly uploads at `/uploads`. Only `production` is still `SEED`, and there is **no DOT on-hand feed at all** (it does not exist), so the forward DOT cascade runs on its opening anchor — which is why days-on-hand and recommended production are **not trustworthy** (see the warning above). Each series falls back to SEED independently, so the banner reports which source won rather than claiming the page is simply "live" or "static". Start from **`docs/DEMAND_PLANNER_KNOWN_ISSUES.md`**, then `docs/DEMAND_PLANNER_FORMULAS.md` ("As built") and `docs/DATA_MODEL.md`.

⚠️ **Walmart restates POS**, so all three feeds upsert and re-uploading overlapping weeks is how the numbers stay correct — not a mistake. Consequently **"the live feed reproduces SEED" is not the acceptance test**; SEED is a stale snapshot (week 202622 moved 1,322 → 2,343 units for PB&J). See ADR-054.

⚠️ **Everything ships from one Vercel project and one Vite bundle.** Any merge to `main` redeploys Sample Central, which serves live Cortina traffic. Verify the deployed bundle after a merge, never the build log.

**Five pages are currently hidden pending rework** — Weekly Report, Product Orders, Payments, EOM Snapshot and Lot Trace. They are marked `hidden: true` in `src/components/Sidebar.jsx`; their **routes still work by URL**, so a page can be reworked without shipping it to everyone. Removing the flag brings one back. Internal users land on `/inventory`.

⚠️ **Hidden is not dead — do not delete these pages or their parsers.** Product Orders and the BOL flow are expected back **around Oct 2026** with substantial changes, and the **`systems@` email reader that feeds them is being kept** (Caroline, Aug 23 2026). The daily `gmail-poll-daily` cron stays on, and `InboxCard` stays on `/uploads`.

**The one genuinely retired feed is the weekly Bentonville Retail Link email** — `weekly_reports` stopped at `2026-07-06`. Keeping its parsers turned out to be the right call: **the same Walmart reports now arrive as file uploads**, and `parsers/weeklyAttachments.js` supplied the column matching for `Sales Summary`, `Markdown`, `Item Data` and the OTIF `Receiver` sheet unchanged. Retiring the email cost the transport, not the parsing. The Demand Planner's feeds are built on top of them — see `docs/DEMAND_PLANNER_FORMULAS.md`.

**Everything else in this README is the other project** — inventory, forecasting, POs, the weekly Retail Link reports and the **`systems@` Gmail agent** are *not* part of Sample Central. The one genuine overlap is `EDGE_CRON_BEARER` (Vault), the shared bearer for every pg_cron → Edge Function call in the repo. **Start any session on Sample Central from `sample-site/CLAUDE.md`**, and read `sample-site/docs/SAMPLE_CENTRAL_STATUS.md` for its current state.
**Builder:** Caroline Friedrich
**Users:** Shahira (CEO/admin), Marc (COO/ops), David + Paul (Biz Exec/admin), Maria (Ops — onboarding later)
**Primary sign-in:** `systems@dirtycookie.com` (admin)

## Quick Start

```bash
npm install
cp .env.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from Supabase dashboard > Settings > API
# Leave VITE_AUTH_BYPASS=false for real auth (true only for offline UI work)
npm run dev
```

Then sign in at `/login` as `systems@dirtycookie.com`. If the user doesn't exist yet, provision it once in the Supabase dashboard (Auth → Users → Add user, with **Auto-confirm** ticked). The `handle_new_auth_user` trigger creates the matching `user_profiles` row with the admin role automatically.

The login form supports both **magic link** (default) and **password** (fallback when SMTP is rate-limited).

## Migrations

Migrations live in `supabase/migrations/` — **68 files as of August 19, 2026**. The Supabase + GitHub integration is currently disabled, so nothing auto-applies on push.

**`npx supabase db push` works.** This README previously said it did not, on the grounds that there is no Docker locally. That was wrong: `db push` connects straight to the remote database and needs Docker only for the *local* stack (`supabase start`, `db diff`, `db reset`). Use `db push --dry-run` first — it prints exactly which files would apply — then `db push --yes`. Pasting into the SQL editor and POSTing to the Management API's `/database/query` endpoint both still work and are still fine for one-offs.

✅ **The ledger is in sync as of August 19, 2026** — all 68 files registered.

⚠️ **It drifts whenever you apply SQL by hand.** The Management API and the SQL editor execute statements without writing a `supabase_migrations.schema_migrations` row, so anything applied that way is invisible to the CLI — and a later `db push` will try to **replay** it. This had accumulated to 12 unregistered Sample Central migrations before being repaired (ADR-047).

If it happens again: verify the objects actually exist in the live schema first, then `npx supabase migration repair --status applied <version> ...` to correct the ledger without re-running the SQL. Always `db push --dry-run` before `db push` — the dry run is what shows you the replay list.

The list below covers Phase 1 only (through June 2). The July–August files are the Sample Central / ShipStation extension track — see `sample-site/docs/SAMPLE_CENTRAL_STATUS.md`.

```
20260521000000_initial_schema.sql              # 20 tables + RLS + triggers
20260521000001_seed_user_profiles.sql          # user_role_seeds + auto-provision trigger
20260526120000_add_po_dot_fulfillment_dates    # PO → DOT leg timeline
20260526130000_link_lots_to_orders             # raw_material_lots.raw_material_order_id FK
20260527120000_po_change_tracking              # po_changes + audit trigger
20260527130000_po_lot_numbers                  # po_lot_numbers + bol_number
20260601120000_production_report               # 5 production tables + lot_shipments
20260601130000_upload_log_production_type      # CHECK constraint update
20260601140000_upload_log_write_policies       # ops/admin INSERT + UPDATE
20260601150000_seed_systems_user               # systems@ admin seed
20260601160000_update_user_seeds               # roster reconciliation
20260601170000_user_profiles_cascade_delete    # cascade FK fix
20260601180000_raw_materials_write_policies    # ops/admin INSERT/DELETE
20260602120000_vault_secret_helpers            # get_secret/set_secret (Vault) for Edge Functions
20260602130000_gmail_agent_tables              # gmail_sync_state + gmail_messages
20260602140000_upload_log_source               # upload_log.source (manual|email)
20260602150000_gmail_poll_cron                 # daily pg_cron → gmail-poll (apply last)
20260602160000_link_parked_po_emails           # back-fill parked email extractions on PO load
```

The Gmail-agent migrations (`20260602*`) and Edge Function deploy steps are in `docs/RUNBOOK.md` §9.

## Project Structure

```
cookie-central/
├── docs/
│   ├── BUILD_PLAN.md            # Phase 1-3 task breakdown + status
│   ├── ARCHITECTURE.md          # Data flow + tech stack + roles
│   ├── DATA_MODEL.md            # Tables, columns, relationships
│   ├── DECISIONS.md             # Architecture decision records — ADR-026…046 are Sample Central, earlier ones are not
│   ├── RUNBOOK.md               # Launch operations: onboarding, troubleshooting, recovery
│   ├── EOS.md                   # The EOS Tracker — schema, goal shapes, weekly operation
│   ├── DEMAND_PLANNER_FORMULAS.md  # Demand planner engine spec + "As built" data wiring
│   ├── DEMAND_PLANNER_KNOWN_ISSUES.md # ⚠️ What to trust on that page and what not to — READ FIRST
│   └── PEOPLE.md                # Org chart + contacts + system emails
├── sample-site/                 # Sample Central — SEPARATE PROJECT, docs only (code stays put)
│   ├── CLAUDE.md                # Start sessions on that project here
│   └── docs/                    # Status, ShipStation integration + setup checklist, email templates
├── supabase/
│   ├── migrations/              # Forward-only schema migrations (manual apply)
│   └── functions/               # Edge Functions. `gmail-*` = this project's email agent.
│                                #   `shipstation-*` = Sample Central, a DIFFERENT project (see above)
├── src/
│   ├── App.jsx + main.jsx
│   ├── pages/                   # Routes (one file per sidebar nav item)
│   ├── components/              # Reusable pieces (Pill, AlertsPanel, …)
│   ├── hooks/                   # Data-fetch + mutation hooks
│   ├── parsers/                 # File parsers (assemblers, netsuite, qbo, dot)
│   ├── contexts/                # Auth, UOM, Retailer filter
│   └── utils/                   # Date helpers, CSV/XLSX dispatch
├── prototype/
│   └── CookieCentral_Complete.jsx   # Approved UI prototype (build spec)
└── .claude/instructions.md      # Claude Code project context
```

## Modules (Phase 1)

| Route | Built | Source data |
|-------|-------|-------------|
| `/weekly` | Weekly Report — renders from `weekly_reports` (agent auto-ingest + legacy seed), newest week first | Bentonville Merchants email (via systems@ agent or manual) |
| `/orders` | Product Orders list + KPIs + Attention banner | `purchase_orders` + `po_line_items` |
| `/orders/:po` | PO detail + Fulfillment Timeline + email thread + Delivery & Lots + **live AI Insight** (from `po_emails.extracted_data`) | + `po_emails`, `po_changes`, `po_lot_numbers` |
| `/payments` + `/payments/:po` | Two-stage payment list + 3-stage timeline | `purchase_orders` + `invoices` + `payments` |
| `/inventory` | Warehouse + Product views + Reorder + Landing | `dot_inventory` + `raw_materials` + lots + orders |
| `/snapshot` | EOM Snapshot (month-pinned KPIs + deltas) | All of the above, month-scoped |
| `/trace` | Lot Traceability — enter any lot (raw / FG / outbound), chain both directions + recall report | `raw_material_lots`, `production_runs`/`_subcomponents`/`_pallets`, `lot_shipments`, `po_lot_numbers` |
| `/reference` | Products + Raw Materials + Transitions | Walmart item master + `raw_materials` + `transitions` |
| `/audit` | Audit log viewer (admin/finance only) | `audit_log` |
| `/uploads` | Drag-drop pipeline (**six weekly exports** first, legacy feeds collapsed — ADR-057) + upload history + **systems@ Inbox** | `upload_log`, `gmail_sync_state` |
| `/demand-planner` | Walmart Demand Planner — Service health (in-store fill + OTIF), S&OP summary, flow charts, cut recovery, tracker | `retail_link_pos_weekly` + `retail_link_forecast` + `retail_link_otif` + `dot_order_history` + `po_line_items`/`purchase_orders` (+ `retail_link_supply_plan`, ingested not wired); `production` from `SEED`; no DOT on-hand feed exists |

## Phase 2

The **`systems@` AI email agent (a Phase 1 extension, Day 10) is live** — Gmail OAuth, daily poll + on-demand button, six-way classification, structured extraction into the PO tables, auto-import of emailed Assemblers/weekly reports, and parked-email back-fill (see `docs/RUNBOOK.md` §9 + ADR-021/022). Remaining Phase 2 items in `docs/BUILD_PLAN.md`: NetSuite API replacing CSV uploads, QBO API, production-plan allocation surface.

## Key Links

- **Operational email + sign-in:** `systems@dirtycookie.com`
- **Prototype (UI spec):** `prototype/CookieCentral_Complete.jsx`
- **Supabase project:** see `.env.local`
- **GitHub repo:** dc-cookiecentral/cookie-central
