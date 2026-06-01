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
2. **systems@ email AI agent** — PO emails, BOLs, supplier confirmations. Phase 1 surfaces a stub AI Insight card on PO detail; Phase 2 swaps in live structured extraction.
3. **Bentonville Merchants email** — Weekly Retail Link readout. Parsed every Monday 9:30 AM CT into `weekly_reports`; the 3 .xlsx attachments add markdowns / supply plan / per-PO OTIF detail.

### Manual (Supplement)
4. **DOT portal CSV** — finished goods inventory, 48-hr lag (parser behind column-mapping seam)
5. **Assemblers report (one .xlsx)** — Production + Reject + Inventory + Shipment + N Job sheets in a single workbook. The Production parser dispatches each sheet to its respective table; the Inventory sheet delegates through to the standalone assemblers.js parser/importer.
6. **QBO CSV** (Phase 1) → QBO API (Phase 2) — invoices, payments
7. **Manual entry** — reorders + landing, inventory adjustments, transitions, raw-material distributor additions

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
