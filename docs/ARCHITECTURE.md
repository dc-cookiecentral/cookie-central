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
1. **Cortina NetSuite** — POs, shipments, invoices, payments. API target, CSV fallback.
2. **systems@ email AI agent** — PO emails, BOLs, supplier confirmations. AI extracts structured data.
3. **Bentonville Merchants email** — Weekly Retail Link readout. Parsed every Monday 9:30 AM CT.

### Manual (Supplement)
4. **DOT portal CSV** — finished goods inventory, 48-hr lag
5. **Assemblers report CSV** — raw materials, packaging, WIP
6. **QBO CSV** (Phase 1) → QBO API (Phase 2) — invoices, payments
7. **Manual entry** — orders, audits, lead times, inventory adjustments

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React + Vite + Tailwind | Single-page app, sidebar navigation |
| Backend | Supabase | Postgres, Auth, Edge Functions, Storage |
| Hosting | Vercel | Auto-deploy from GitHub main branch |
| Auth | Supabase magic link | Email-based, no passwords |
| DB Migrations | Supabase CLI + GitHub | `supabase/migrations/` — auto-linked to repo |
| File parsing | Edge Functions / client-side | CSV parsing with Papa Parse |
| PDF generation | Client-side (jsPDF or react-pdf) | Reorder confirmation PDFs |
| Email parsing | Supabase Edge Function | Gmail API for systems@, scheduled + manual trigger |

## User Roles and Access

| Role | Users | Can do | Cannot do |
|------|-------|--------|-----------|
| admin | Caroline | Everything | — |
| finance | Shahira, David, Paul | View all, edit pricing/COG/revenue, approve changes | Delete data |
| ops | Marc, Maria | View all, upload data, adjust inventory, confirm reorders, add orders | Edit pricing |

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
