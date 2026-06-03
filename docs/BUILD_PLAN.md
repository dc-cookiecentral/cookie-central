# Cookie Central — Build Plan

## Timeline
- **Start:** Wednesday May 21, 2026
- **Phase 1 demo:** delivered June 2026 (Marc + David) ✅
- **Phase 1 ship:** in progress. Demo modules are live; remaining work: AI email reader (Day 10), Cortina real-file reconciliation, lot-traceability chain UI.
- **Phase 2:** weeks following Phase 1 ship
- **Phase 3:** late summer 2026

## Blockers (Phase 1)
- [x] systems@dirtycookie.com access — DONE
- [x] Shahira sign-off on prototype — DONE
- [x] Assemblers **inventory** report sample received — parser reconciled
- [x] Assemblers **production** report format — confirmed; one multi-sheet workbook covers Production / Reject / Inventory / Shipment + N Job sheets. Parsed end-to-end. Outbound (Shipment sheet) folded in. Raw-ingredient **landing/BOL** is captured separately via the Inventory → Reorder → Landing flow.
- [x] Cortina NetSuite PO export — parser built behind column-mapping seam; interim Cortina PO **PDF** parser added for manual upload until the NetSuite API lands (demo POs since removed)
- [x] DOT portal sample — parser built behind column-mapping seam; format still pending
- [x] EOM summary — built from live PO + adjustment + weekly_report data, no separate export needed
- [x] QBO sample — parser built behind column-mapping seam pending real file

## Phase 1 outcome (as of 2026-06-01)

**Status:** demo modules shipped + live on Vercel + populated against the seeded Assemblers workbook. NOT a launch-ready Phase 1 yet — still outstanding: the AI email reader (Day 10), Cortina/DOT/QBO real-file reconciliation, and the lot-traceability chain UI (Day 11). 15 migrations applied; 7 prototype POs + Assemblers Production workbook seeded.

Module-by-module:

- **Day 1 — Foundation:** ✅ complete (1.1–1.9).
- **Day 2 — Parsers + upload pipeline:** ✅ pipeline + upload log + parsers. Assemblers report (one workbook) is the canonical Assemblers upload — Inventory delegated through to the original assemblers.js parser; DOT/QBO/NetSuite behind column-mapping seams ("format unconfirmed").
- **Day 3 — Product Orders:** ✅ list (3.1) + detail (3.2) + Fulfillment Timeline + 3 DOT-leg columns. Email thread renders `po_emails` (3.3). **AI Insight card (3.4)** now reads live `po_emails.extracted_data` from the systems@ agent (with a PO-state fallback before any email lands).
- **Day 4 — Inventory Warehouse:** ✅ 3-view toggle (4.1), DOT (4.2), Assemblers raw + packaging (4.3 + 4.4), raw→Reference deep-link (4.5), per-warehouse upload links + timestamps (4.6).
- **Day 5 — Reorder + landing + product view:** ✅ reorder preview (5.3) with distributor/brand select (5.5) + Marc override (5.4). **Product view (5.1)** + **Adjust Inventory (5.2)** built — shrink/expired/damaged/disposed with audit-log writes. Landing flow added (lot origin: land date + 1:many lots). Allocation view (5.6) pending real production-consumption data.
- **Day 6 — Payments / Reference / Weekly:** ✅ Payments list (6.1) + detail (6.2) with 3-stage timeline. Reference > Products (6.3) from Walmart item master. **Reference > Raw Materials (6.4)** with distributor / FIFO / orders / usage + inline + Add Distributor / + Add Order. **Reference > Transitions (6.5)** with interactive checklist + new-transition form. Weekly Report shell + WK16 Bentonville parser (6.6).
- **Day 7 — EOM / Alerts / Audit / Demo:** ✅ **EOM Snapshot (7.1)** month-pinned with vs-prev deltas. **Alerts engine (7.2)** computed over live state, surfaced on Product Orders + Weekly Report. **Audit Log viewer (7.3)** with table/action/user/range filters, RLS-gated to admin/finance. Real-data testing (7.4) covered by the live Assemblers upload. Loading/error states (7.5) in place. Demo (7.6) delivered.
- **Day 8–9 — Phase 1 wrap-up:** Weekly Report email parser (8.2) and Bentonville attachments parser landed earlier; "Check for new" (8.3) + week archive (8.4) wired off the parsed `weekly_reports` table. NetSuite API (8.1) deferred to Phase 2.

### Added beyond the original Day-1-7 plan
- `raw_material_lots.raw_material_order_id` FK (lot→order provenance)
- DOT-leg dates on `purchase_orders` (3 new columns)
- `po_changes` + `po_lot_numbers` + `bol_number` for delivery traceability
- `user_role_seeds` + `handle_new_auth_user` trigger for auto-provisioning roles on first sign-in
- Password sign-in fallback (sidesteps email-rate-limit failures)
- 5 production tables (`production_runs`, `production_pallets`, `production_subcomponents`, `production_rejects`, `lot_shipments`) — the Assemblers production workbook's full breakdown
- ~~Demo seed pattern (`supabase/seeds/`) — idempotent prototype data~~ — removed June 2026 as real Cortina data (PDF upload) landed
- Consolidated Assemblers upload (single card, one workbook covers all sheets)

## Launch checklist

**Ship blockers (must close before declaring Phase 1 shipped):**
- [x] **AI email reader** — Day 10.1–10.5 — built + deployed (3 Edge Functions, OAuth connected to systems@, 6-way classification, structured extraction + attachment auto-import + parked-email back-fill). See RUNBOOK §9.
- [ ] **Cortina NetSuite real-file reconciliation** — Harshita sample → column-mapping pass against parser
- [ ] **Lot Traceability chain UI** — Day 11.1–11.4

**Already done:**
- [x] Eight demo modules functional + live on Vercel
- [x] All migrations applied (15 total) and in `main`
- [x] Demo seed data removed once real Cortina data (PDF upload) landed
- [x] systems@dirtycookie.com admin sign-in provisioned (magic link + password fallback)
- [x] RLS policies cover INSERT/UPDATE/DELETE on every write-path table
- [x] Audit log gated to admin/finance; ops users see explicit "restricted" panel
- [x] Cascade-delete FK so user lifecycle ops don't error
- [x] Production deploy to Vercel
- [x] Supabase Auth Site URL + Redirect URLs pointed at the Vercel domain
- [ ] **Talk to David about the QBO connection** — confirm the QBO API access path he can grant, and whether Phase 1 stays on CSV upload or jumps straight to API
- [ ] **Cortina NetSuite PO export sample** — still waiting on Harshita; reconcile real file against the parser's column-mapping seam once received
- [ ] Real DOT portal CSV reconciled against the parser
- [ ] **Phase 1 invites** — Marc (ops), David (admin), Paul (admin). Pre-provision in Auth dashboard with password + Auto-confirm, share Vercel URL.
- [ ] **Shahira invite** — deferred until Phase 2 is fully shipped (post-AI-agent).
- [ ] **Kroger reporting source** — parked for now (Walmart's Bentonville feed covers `/weekly`; Kroger equivalent TBD).
- [ ] **Ingredient master data** (`raw_material_suppliers`: distributor, brand, cost/unit, MOQ, lead time per ingredient) — needs population. Two paths to confirm with Marc: (a) one-time spreadsheet entry, or (b) let the Day 10 AI agent backfill from order confirmation emails as they arrive. Option (b) is incremental + lower upfront effort but slower to a complete picture.
- [ ] **Subdomain on dirtycookie.com** — hidden + protected entry. David owns the website infra; conversation needed on which subdomain (`ops.`/`central.`/something else), how to gate access beyond Supabase Auth (IP allowlist? Vercel password protection? basic auth at the edge?), and who manages DNS + the cert.
- [x] **Anthropic console + ANTHROPIC_API_KEY** — provisioned + stored in Supabase Vault.
- [x] **Gmail OAuth for systems@dirtycookie.com** — OAuth client provisioned; systems@ granted refresh-token consent; token stored in Vault. Agent connected and processing live mail.
- [x] **AI Agent build (Day 10.1 – 10.5)** — Gmail OAuth, polling Edge Function (daily cron + button), six-way classification, structured extraction into `po_emails` + `po_lot_numbers` + `po_changes`, PO-detail AI Insight card swapped to live extraction, supplier-confirmation + emailed-Assemblers/weekly auto-capture. Deployed. (Cron migration `..150000` applied separately; see RUNBOOK §9.1.)

---

## PHASE 1 — Visibility (~58 hrs, 8–9 working days)

### Day 1 (Wed May 21): Foundation
| # | Task | Est | Notes |
|---|------|-----|-------|
| 1.1 | Init Vite + React project, Tailwind, folder structure | 0.5h | |
| 1.2 | Link Supabase project (already connected to GitHub), configure env vars | 0.5h | `supabase link`, copy URL + anon key to .env.local |
| 1.3 | Push initial migration — `npx supabase db push` | 0.5h | All 20 tables, indexes, RLS, triggers auto-deploy via GitHub |
| 1.4 | Set up Supabase Auth with magic link | 0.5h | Roles: admin, finance, ops |
| 1.5 | Seed user_profiles table with initial users | 0.5h | Shahira, Marc, David, Paul, Maria, Caroline |
| 1.6 | Deploy to Vercel, connect GitHub for auto-deploy | 0.5h | |
| 1.7 | Build sidebar navigation + layout shell | 1h | Match prototype sidebar exactly |
| 1.8 | Build UOM context provider | 1h | Cases/CU/Cookies/Pallets conversion |
| 1.9 | Build retailer filter context | 0.5h | All/Walmart/Kroger, persists across pages |

### Day 2 (Thu May 22): Parsers + Upload Pipeline
| # | Task | Est | Notes |
|---|------|-----|-------|
| 2.1 | Upload pipeline component (drag-drop, validate, preview) | 2h | Reusable across all upload types |
| 2.2 | Upload log table + UI | 0.5h | Shows all uploads with timestamps |
| 2.3 | Assemblers report parser | 3h | 389 rows → categorize raw/packaging/FG, flag expired |
| 2.4 | DOT portal CSV parser | 1.5h | Pallet-level → SKU aggregate |
| 2.5 | ~~QBO CSV parser~~ → moved to Phase 2 (P2.0) | — | Parser already built; integration deferred until David confirms feed |

### Day 3 (Fri May 23): Product Orders
| # | Task | Est | Notes |
|---|------|-----|-------|
| 3.1 | Product Orders list view | 2h | Retailer badges, Days column, urgency sort, KPIs, alerts |
| 3.2 | PO detail view | 2h | Info cards, line items, NOVA changes |
| 3.3 | Email thread display | 1h | Timeline UI with extracted data tags |
| 3.4 | AI agent insight card | 0.5h | Was a Phase-1 stub; now reads live `po_emails.extracted_data` (Day 10 agent) |
| 3.5 | NetSuite CSV parser (if sample received) | 3h | Map Harshita's fields to schema |

### Day 4 (Mon May 26): Inventory — Warehouse View
| # | Task | Est | Notes |
|---|------|-----|-------|
| 4.1 | Inventory page with 3-view toggle | 0.5h | Warehouse / Product / Reorder |
| 4.2 | DOT warehouse section (collapsible) | 2h | Waterfall: on-hand → incoming → transit → alloc → avail → weeks |
| 4.3 | Assemblers warehouse section (collapsible) | 2h | Raw materials with Makes/Wks columns, lead time flag |
| 4.4 | Packaging section | 0.5h | Simple table |
| 4.5 | Raw material click → Reference detail routing | 0.5h | |
| 4.6 | Upload buttons per warehouse with timestamps | 0.5h | |

### Day 5 (Tue May 27): Inventory — Product View + Reorder
| # | Task | Est | Notes |
|---|------|-----|-------|
| 5.1 | Product view with expand/collapse per item | 2h | Location breakdown, velocity, allocation |
| 5.2 | Inventory adjustment (shrink/expired/damaged) | 1.5h | Reason codes, audit log, feeds EOM |
| 5.3 | Reorder preview mode | 3h | Velocity calc, stockout, suggested qty, urgency sort |
| 5.4 | Marc's editable override column | 0.5h | |
| 5.5 | Distributor/brand selection on reorder | 1h | Dropdown populated from raw_material_suppliers |
| 5.6 | Confirm → summary + allocation view | 1.5h | POs against DOT inventory, shortfall detection |

### Day 6 (Wed May 28): Payments + Reference + Weekly Report
| # | Task | Est | Notes |
|---|------|-----|-------|
| 6.1 | Payments list with retailer filter | 1.5h | Two-stage tracking, terms column |
| 6.2 | Payment detail view | 1.5h | Line items, NOVA, paid vs outstanding, timeline |
| 6.3 | Reference — Products & UOM | 1.5h | Conversion chain, product table, product detail with BOM |
| 6.4 | Reference — Raw Materials master | 2h | Distributor/brand table, + Add Distributor, + Add Order, FIFO, audit |
| 6.5 | Reference — Transitions | 1h | From/to SKU, launch/cutoff, checklist |
| 6.6 | Weekly Report shell + WK15 data | 2h | KPIs, findings, EOS sections |

### Day 7 (Thu May 29): Polish + Demo
| # | Task | Est | Notes |
|---|------|-----|-------|
| 7.1 | EOM Snapshot | 1.5h | Monthly KPIs with vs-last-month deltas |
| 7.2 | Alerts engine | 2h | MABD risk, low inventory, expiring, unpaid, lead time |
| 7.3 | Audit log table + viewer | 1h | Filterable by user, date, table |
| 7.4 | Real data testing — first uploads | 2h | Fix parser edge cases |
| 7.5 | Loading states, error handling, responsive | 1h | |
| 7.6 | **Demo to Marc + David** | — | All modules functional |

### Day 8–9 (Fri May 30 – Mon Jun 2): Remaining Phase 1
| # | Task | Est | Notes |
|---|------|-----|-------|
| 8.1 | NetSuite API connection (if API ready) | 4h | OAuth, pagination, Edge Function |
| 8.2 | Weekly Report email parser | 3h | Parse Bentonville Merchants email format |
| 8.3 | "Check for new" manual refresh | 1h | |
| 8.4 | Week archive navigation | 1h | |
| 8.5 | Bug fixes from demo feedback | 2h | |

### Day 10+ (Phase 1 extension): AI Agent over systems@ — ✅ DELIVERED
The agent reads systems@dirtycookie.com via Gmail API, classifies each message into six categories, and extracts structured data into the existing PO tables — replacing the Phase 1 state-derived AI Insight stub with real extraction. Built as three Edge Functions (`gmail-oauth-callback`, `gmail-poll`, `gmail-extract`) + 5 migrations (`20260602*`); deployed and processing live mail. Anthropic key + Gmail OAuth creds in Vault. Beyond the original scope: also auto-imports emailed Assemblers production workbooks and the Bentonville weekly through the existing parsers, and back-fills parked PO emails when their NetSuite PO loads. See `docs/RUNBOOK.md` §9 and ADR-021/022/023.
| # | Task | Est | Notes |
|---|------|-----|-------|
| 10.1 | Gmail OAuth + refresh-token storage | 3h | Google Cloud Console project, OAuth client, systems@ grants consent. Tokens in Supabase Vault next to ANTHROPIC_API_KEY. |
| 10.2 | Edge Function: poll Gmail + thread classification | 5h | Cron-scheduled. Per thread: identify retailer/PO/topic; attach to `po_emails` and link to `purchase_orders` by extracted PO number. |
| 10.3 | Edge Function: structured extraction | 8h | Per thread: dates, costs, carrier, BOL, FG lot numbers. Writes to `po_emails.extracted_data`, `po_lot_numbers`, `po_changes`. |
| 10.4 | Swap PO-detail AI Insight card from stub → live extraction | 1h | Same component, reads `extracted_data` + recent agent runs rather than deriving from PO state. |
| 10.5 | Auto-capture supplier confirmations → update pending orders | 4h | Extracted ship-date / cost / BOL → update matching `raw_material_orders` or PO. Audit-logged. |

### Day 11 (Phase 1 ship blocker): Lot Traceability chain UI
The tables hold the full traceability chain — raw_material_lots → production_subcomponents.raw_lot_code → production_runs.fg_lot_code → production_pallets → lot_shipments → po_lot_numbers — but nothing in the UI surfaces it. Recall scenarios + cost rollup + FIFO discipline all need this view to be useful, so it's a Phase 1 ship blocker.
| # | Task | Est | Notes |
|---|------|-----|-------|
| 11.1 | `/trace` page: enter any lot code, render full chain both directions | 5h | Backward from FG lot → which raw lots fed the batch (subcomponents joined to raw_material_lots). Forward from FG lot → which pallets it made + which shipments it left in + which PO it arrived against (po_lot_numbers). Same view handles raw, FG, and outbound lot codes by inferring direction from the table it's found in. |
| 11.2 | "Trace this lot" deep-link from Delivery & Lots, PO-detail, and Reference > Raw Materials FIFO table | 1h | Each row in those tables gets a trace icon → `/trace?lot=<code>`. |
| 11.3 | Reconcile production_subcomponents.raw_lot_code text against raw_material_lots.lot_number | 3h | Phase 1 stores raw_lot_code as plain text — needs normalisation (case, whitespace) and a join helper so the trace view doesn't drop rows on format drift. Optionally promote to FK in a later migration. |
| 11.4 | Recall report — "every PO/customer touching raw lot X" | 2h | One-page export. Critical if a raw-material recall lands; today this is a chain of manual SQL. |

---

## PHASE 2 — Operations (~40 hrs, weeks 3–6)

| # | Task | Est | Deps |
|---|------|-----|------|
| P2.0 | **QBO CSV integration** — adopt the existing parser, reconcile against David's first export, surface in `/payments` reconciliation | 2h once file lands | L14 (David conversation) |
| P2.1 | Honeymoon validation (Marc compares forecasts to actuals) | Ongoing | 2–3 weeks |
| P2.2 | Activate reorder Confirm — PDF generation | 3h | |
| P2.3 | Pending refills in inventory (italic → confirmed on email) | 4h | Day 10 agent live |
| P2.4 | Production plan surface (allocate runs against POs) | 8h | |
| P2.5 | QBO API connection (replace CSV) | 6h | P2.0 reconciled, QBO API creds |
| P2.9 | Forecasting foundation — historical velocity model | 4h | |

---

## PHASE 3 — Financials + Rollout (~35 hrs, weeks 6–9)

| # | Task | Est | Deps |
|---|------|-----|------|
| P3.1 | Margin per PO (revenue – cost from QBO) | 4h | QBO API |
| P3.2 | Cash on hand from QBO | 2h | |
| P3.3 | Chargeback tracking linked to POs | 3h | |
| P3.4 | EOM Snapshot auto-generation with real financials | 3h | |
| P3.5 | Trend views (revenue/month, chargebacks, fill rate) | 5h | |
| P3.6 | Committed revenue forecast (30/60/90d) | 4h | |
| P3.7 | Slack integration — notify owners on assignments/changes | 6h | |
| P3.8 | Raw material spend tracking from order history | 3h | |
| P3.9 | Bug fixes + UX refinement | 4h | |
| P3.10 | Scope e-commerce/corporate rollout | Planning | |

---

## Done (Design Phase)
- [x] Architecture designed + scoping locked (David + Marc)
- [x] Cortina meeting — NetSuite confirmed as data source
- [x] Field list sent to Harshita for NetSuite
- [x] systems@dirtycookie.com access confirmed
- [x] Full navigable prototype approved by Shahira
- [x] Real PO data integrated (PO14326, PO14331, PO14371, PO14400)
- [x] Real WK15 Retail Link data from Bentonville Merchants
- [x] Assemblers inventory report analyzed (389 rows → 28 items)
- [x] Kroger scope discovered and integrated (retailer filter)
- [x] EOS structure designed (Scorecard, Rocks, To-Dos, Issues)
- [x] Distributor/brand structure designed (St Charles, Dawn)
- [x] Audit log + role-based pricing changes designed
- [x] Shrink/expired reconciliation designed
- [x] Transition timeline designed (WCCB 12ct → 8ct)
- [x] AI agent architecture scoped
- [x] QBO analysis completed
- [x] Reorder calculator with honeymoon designed
