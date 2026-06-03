# Cookie Central — Architecture

## System Overview

```
                    ┌─────────────┐
                    │   Walmart   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │                         │
      ┌───────▼───────┐        ┌───────▼───────┐
      │  Retail Link   │        │  NOVA (PO     │
      │  OTIF, scores  │        │  edits)       │
      └───────┬───────┘        └───────┬───────┘
              │                         │
              └────────────┬────────────┘
                           │
                ┌──────────▼──────────┐
                │  Cortina — NetSuite │  ← POs, shipments,
                │  (API or export)    │    invoices, payments
                └──────────┬──────────┘
                           │
     ┌─────────────────────┼─────────────────────┐
     │                     │                     │
     │            ┌────────▼────────┐            │
     │            │  Cookie Central │            │
     │            │  Supabase +     │            │
     │            │  Vercel         │            │
     │            └────────┬────────┘            │
     │                     │                     │
     │              ┌──────┴──────┐              │
     │              │   Outputs   │              │
  ···▼···        ┌──▼──┐  ┌──▼──┐           ···▼···
  Manual         │Dash │  │PDF  │           AI Agent
  Uploads        │board│  │Rpt  │           (systems@)
  (DOT,Asm,      └─────┘  └─────┘
   QBO)
```

## Partner Ecosystem

| Partner | Role | System | Data flow |
|---------|------|--------|-----------|
| Cortina Foods | EDI conduit, financier, Kroger PO issuer | NetSuite | POs, shipments, invoices, payments → Cookie Central |
| Assemblers (Chicago) | Co-packer, production | Internal reports | Raw materials, packaging, WIP via CSV upload |
| Summit (Chicago) | Overflow freezer storage | — | Future: separate inventory upload |
| DOT Foods | Redistributor (flow-through to Walmart/Kroger DCs) | DOT portal | Finished goods inventory via CSV upload (48-hr lag) |
| Bentonville Merchants | Broker | Retail Link | Weekly Walmart performance report via email |
| St Charles / Dawn | Raw material distributors | — | Pricing, MOQ, lead times in reference data |

## Payment Flow

**Walmart:** Cortina pays Dirty Cookie first (30 days post-ship) → Walmart pays Cortina (60 days post-receipt)
**Kroger:** Due on receipt (terms per PO)

## Data Sources — Priority and Method

### Automated (Primary)
1. **Cortina NetSuite** — POs, shipments, invoices, payments. CSV upload today (Phase 1), API target (Phase 2).
2. **systems@ email AI agent** (Phase 2, **live**) — reads systems@dirtycookie.com (Gmail, read-only), classifies each message into six categories, and acts: PO/BOL/supplier_confirmation → structured extraction into `po_emails` (+ `po_lot_numbers`, advisory `po_changes`); assemblers_report → auto-imports the emailed .xlsx through the production parser; weekly_report → parses the body into `weekly_reports`; other → logged. The PO-detail AI Insight card now reads the real `extracted_data`. See **AI Email Agent** below.
3. **Bentonville Merchants email** — Weekly Retail Link readout. Lands in `weekly_reports` either via manual upload or the systems@ agent's `weekly_report` path; `/weekly` renders from that table (merged with the legacy seed). The 3 .xlsx attachments (markdowns / supply plan / per-PO OTIF) are a TBD format — recorded but not yet parsed.

### Manual (Supplement)
4. **DOT portal CSV** — finished goods inventory, 48-hr lag (parser behind column-mapping seam)
5. **Assemblers report (one .xlsx)** — Production + Reject + Inventory + Shipment + N Job sheets in a single workbook. The Production parser dispatches each sheet to its respective table; the Inventory sheet delegates through to the standalone assemblers.js parser/importer.
6. **QBO CSV** (Phase 1) → QBO API (Phase 2) — invoices, payments
7. **Manual entry** — reorders + landing, inventory adjustments, transitions, raw-material distributor additions

## AI Email Agent (systems@dirtycookie.com)

Three Supabase Edge Functions over the read-only Gmail API, with Anthropic for classify/extract. Secrets live in Vault, read via the `get_secret`/`set_secret` SECURITY DEFINER RPCs.

```
Connect Gmail (button) → gmail-oauth-callback → Google consent → refresh token → Vault
"Check for new" (button) ─┐
once-daily pg_cron        ┴→ gmail-poll → list new mail → Haiku classify (6 labels)
                                        → gmail_messages (dedupe) → tail-call gmail-extract
                                                         │ dispatch by classification
   PO / BOL / supplier_confirmation     assemblers_report            weekly_report      other
   Sonnet structured extract            download .xlsx →             parse email body   sweep
   → po_emails (+ po_lot_numbers,       production.js parser →       → weekly_reports    (mark
     advisory po_changes 'email')       upload_log(source='email')                       processed)
```

Design notes:
- **Models:** Haiku 4.5 classifies every email (cheap); Sonnet 4.6 extracts the three structured classes (forced tool-use → validated JSON). System+schema prompt is prompt-cached.
- **Advisory extraction:** PO/BOL/confirmation never mutate `purchase_orders` directly — they write `po_emails` + `po_lot_numbers` + `po_changes(change_source='email')` for review, avoiding double-logging against the `log_po_changes` trigger.
- **Reuse, not rewrites:** assemblers_report and weekly_report run the *same* `production.js` / `weeklyEmail.js` parsers the manual `/uploads` flow uses (client dependency-injected so they run under Deno).
- **Parked emails:** if a PO email arrives before the PO is in the DB, it's stored with `po_id` null (po_number in `extracted_data`); the NetSuite parser back-fills it via `link_parked_po_emails` when the PO loads.
- **Idempotent:** `gmail_messages.gmail_message_id` is unique (dedupe); `processed` gates reprocessing; `other` is bulk-swept each run.

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React + Vite + Tailwind | Single-page app, sidebar navigation |
| Backend | Supabase | Postgres, Auth, Edge Functions, Storage |
| Hosting | Vercel | Auto-deploy from GitHub main branch |
| Auth | Supabase email auth | Magic link (default) + password fallback for SMTP outages. Auto-confirm + role-seed trigger provisions `user_profiles` on first sign-in. |
| DB Migrations | `supabase/migrations/` | Forward-only, applied **manually** via the SQL editor in filename order (GitHub auto-deploy currently off). |
| File parsing | Edge Functions / client-side | CSV parsing with Papa Parse |
| PDF generation | Client-side (jsPDF or react-pdf) | Reorder confirmation PDFs |
| Email parsing | Supabase Edge Function | Gmail API for systems@, scheduled + manual trigger |

## User Roles and Access

| Role | Users | Can do | Cannot do |
|------|-------|--------|-----------|
| admin | Shahira, David, Paul, `systems@dirtycookie.com` (Caroline signs in here) | Everything: view + edit + upload + audit log + pricing | — |
| ops | Marc, Maria (when onboarded) | View all, upload data, adjust inventory, confirm reorders, add orders | Edit pricing; read audit log |
| finance | (reserved) | View all, edit pricing/COG/revenue, read audit log | Delete data |

Roles are assigned via `user_role_seeds` and applied by the `handle_new_auth_user` trigger when a user signs in for the first time. To onboard someone outside the seed list, either add them to `user_role_seeds` before they sign in or pre-provision their row in the Auth dashboard.

RLS policies on every write-path table check `role IN ('admin', 'ops')` for writes (or `'admin', 'finance', 'ops'` on the few tables anyone authorised can write). `audit_log` SELECT is gated to `admin` + `finance`.

## UOM Conversion

All from the `subcategories` table. WMT Dough:
- 1 Cookie (base)
- 4 Cookies = 1 Consumer Unit
- 12 CU = 1 Case (48 cookies)
- 189 Cases = 1 Pallet (Ti 9 × Hi 21 = 9,072 cookies)

UOM toggle in sidebar applies globally via React context.

## Audit Log

Every mutation to any table creates a row in `audit_log`:
```
user_id, timestamp, table_name, record_id, action (INSERT/UPDATE/DELETE), field_name, old_value, new_value
```

Pricing changes (COG, revenue, cost per unit) additionally require:
1. Confirmation dialog showing old → new value
2. Role check (finance or admin only)
3. Audit log entry with the confirming user
