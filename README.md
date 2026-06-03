# Cookie Central

Operational dashboard for Dirty Cookie's white-label retail business (Walmart + Kroger) through Cortina Foods.

**Stack:** React + Vite + Tailwind + Supabase + Vercel
**Status:** Phase 1 complete — demo shipped (June 2026). All eight build-plan modules functional against live Supabase data. Now in launch hardening / Phase 2 prep.
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

Migrations live in `supabase/migrations/`. The Supabase + GitHub integration is currently disabled; migrations are applied **manually** via the SQL editor by pasting the migration file contents and running them in filename order.

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

Optional seed data for a populated demo: `supabase/seeds/demo_purchase_orders.sql` (7 prototype POs + line items + emails + payment events). Idempotent; safe to drop later when real Cortina data lands.

## Project Structure

```
cookie-central/
├── docs/
│   ├── BUILD_PLAN.md            # Phase 1-3 task breakdown + status
│   ├── ARCHITECTURE.md          # Data flow + tech stack + roles
│   ├── DATA_MODEL.md            # Tables, columns, relationships
│   ├── DECISIONS.md             # Architecture decision records (ADRs)
│   ├── RUNBOOK.md               # Launch operations: onboarding, troubleshooting, recovery
│   └── PEOPLE.md                # Org chart + contacts + system emails
├── supabase/
│   ├── migrations/              # Forward-only schema migrations (manual apply)
│   └── seeds/                   # Demo data (idempotent, removable)
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
| `/reference` | Products + Raw Materials + Transitions | Walmart item master + `raw_materials` + `transitions` |
| `/audit` | Audit log viewer (admin/finance only) | `audit_log` |
| `/uploads` | Drag-drop pipeline + upload history + **systems@ Inbox** (Connect Gmail, Check for new) | `upload_log`, `gmail_sync_state` |

## Phase 2

The **AI agent over `systems@` emails is live** — Gmail OAuth, daily poll + on-demand button, six-way classification, structured extraction into the PO tables, auto-import of emailed Assemblers/weekly reports, and parked-email back-fill (see `docs/RUNBOOK.md` §9 + ADR-021/022). Remaining Phase 2 items in `docs/BUILD_PLAN.md`: NetSuite API replacing CSV uploads, QBO API, production-plan allocation surface.

## Key Links

- **Operational email + sign-in:** `systems@dirtycookie.com`
- **Prototype (UI spec):** `prototype/CookieCentral_Complete.jsx`
- **Supabase project:** see `.env.local`
- **GitHub repo:** dc-cookiecentral/cookie-central
