# Cookie Central — Data Model

## Schema Location
`supabase/migrations/` — forward-only, applied manually via the Supabase SQL editor in filename order. Initial schema is `20260521000000_initial_schema.sql`. Subsequent migrations are timestamped (YYYYMMDDhhmmss). Never edit a migration that has been applied; write a new one.

## Entity Relationship Overview

```
subcategories ──< products
products ──< po_line_items
purchase_orders ──< po_line_items
purchase_orders ──< shipments
purchase_orders ──< invoices
invoices ──< payments
raw_materials ──< raw_material_suppliers (distributor/brand/cost/MOQ)
raw_materials ──< raw_material_orders
raw_materials ──< inventory_adjustments
raw_materials ──< raw_material_lots (FIFO)
raw_materials ──< bill_of_materials (links to products)
production_runs ──< production_pallets         (FG output, pallet-level)
production_runs ──< production_subcomponents   (raw lots consumed → FG lot)
production_runs ──< production_rejects         (per-event waste/loss)
lot_shipments (standalone, lot-level outbound from Assemblers facility)
purchase_orders ──< po_emails                  (extracted email thread; po_id null = "parked" until the PO loads)
purchase_orders ──< po_changes                 (every PO field mutation, audit-linked)
purchase_orders ──< po_lot_numbers             (delivered FG lots + BOL; po_id null when parked)
po_emails ──< po_lot_numbers                   (extracted_from_email_id — lots the agent pulled from an email)
weekly_reports (standalone; Bentonville email — manual upload OR systems@ agent auto-ingest)
gmail_messages (standalone; one row per systems@ email — classification + processing audit)
gmail_sync_state (standalone; Gmail connection + poll cursor, one logical row)
audit_log (standalone, logs all changes)
upload_log (standalone, tracks every uploaded file; source = manual | email)
user_role_seeds ──> user_profiles              (role assignment at first sign-in)
auth.users ──> user_profiles                   (1:1 via trigger; ON DELETE CASCADE)
```

The **systems@ AI email agent** (Phase 2, live) writes into `po_emails`, `po_lot_numbers`,
`po_changes` (`change_source='email'`), `weekly_reports`, and `upload_log` (`source='email'`).
See the Gmail-agent tables + functions at the end of this doc.

## Tables

### subcategories
Defines UOM conversion chains per product category.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | "WMT Dough" |
| retailer | text | "Walmart", "Kroger" |
| cookies_per_cu | int | 4 |
| cu_per_case | int | 12 |
| cookies_per_case | int | 48 (computed) |
| ti | int | 9 |
| hi | int | 21 |
| cases_per_pallet | int | 189 |
| cookies_per_pallet | int | 9072 (computed) |

### products
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| sku | text UNIQUE | "C-F-SC-WCCB-12-12-WMT" |
| short_name | text | "WCCB" |
| full_name | text | |
| subcategory_id | uuid FK → subcategories | |
| retailer | text | "Walmart", "Kroger" |
| status | text | active, upcoming, discontinued |
| launch_date | date | |
| cog_per_case | numeric | Editable (finance role) |
| revenue_per_case | numeric | Editable (finance role) |
| shelf_life_days | int | 270 |
| notes | text | |

### purchase_orders
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| po_number | text UNIQUE | "PO14326" |
| retailer | text | "Walmart", "Kroger" |
| order_date | date | |
| mabd | date | Must-arrive-by date |
| ship_date_original | date | From NetSuite |
| ship_date_actual | date | Updated on ship |
| delivery_date | date | |
| destination_dc | text | "Walmart DC", "Kroger DC Shelbyville IN" |
| ship_status | text | pending, shipped, delivered |
| payment_status | text | pending, paid_cortina, paid_retailer, awaiting_retailer |
| payment_terms | text | "Net 30/60", "Due on receipt" |
| carrier | text | |
| freight_handler | text | |
| bol_received | boolean | |
| customer_order_number | text | Kroger order # |
| invoice_number | text | |
| total_cases | int | |
| total_amount | numeric | |
| paid_amount | numeric | |
| nova_changes | text | NOVA edit notes |
| email_count | int | Emails linked to this PO |
| cortina_po | boolean | true (all POs flow through Cortina) |
| revenue_per_case | numeric | Per-PO pricing (may differ by retailer) |
| ship_to_dot_date | date | Planned ship-to-DOT date (upstream of retailer ship) |
| ship_to_dot_actual | date | Actual ship-to-DOT; UI flags red if after planned |
| dot_receipt_date | date | DOT-confirmed receipt at warehouse |
| bol_number | text | BOL number; the systems@ agent surfaces it from delivery emails as an advisory `po_changes` row (doesn't write this column directly) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### po_line_items
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| po_id | uuid FK → purchase_orders | |
| product_id | uuid FK → products | |
| sku | text | "WCCB", "PBG" |
| quantity_cases | int | |
| unit_cost | numeric | From NetSuite PO |
| line_total | numeric | |


**Added `20260824150000` — `cut_reason` (text) and `actual_delivery_date` (date).**

`cut_reason` comes from the Cortina export's long-ignored **Cut Reason** column — 194 of 1,155 lines on the 2026-08-22 file, 170 of them `Restricted Supply - Supplier`. Stored **verbatim, never normalised**: values are already compound (`Restricted Supply - Supplier | Dot Out Of Stock-Contact Csr`) and the list grows, so an enum or CHECK would start rejecting real rows. Partial index `WHERE cut_reason IS NOT NULL` — only ~17% of lines carry one and the question is always "which were cut".

`actual_delivery_date` is promoted out of `metadata->>'actual_delivery_date'` to a typed column. It is **per line, not per PO** — different DCs on one SO deliver on different days — and the demand planner buckets on it.

⚠️ **The demand planner reads these two dates differently, and it matters:**

```
req, cuts  →  purchase_orders.ship_date_original   (scheduled delivery week)
dlv, rev   →  po_line_items.actual_delivery_date   (actual delivery week)
```

Verified against `SEED.orders`: `req` 49/49 and `cuts` 49/49 exact. `cuts` is a **count of lines** carrying a reason, not a sum of cut cases. See ADR-059.

### shipments
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| po_id | uuid FK → purchase_orders | |
| asn_number | text | |
| ship_date | date | |
| delivery_date | date | |
| carrier | text | |
| tracking_bol | text | |
| ship_from | text | |
| ship_to | text | |

### invoices
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| po_id | uuid FK → purchase_orders | |
| invoice_number | text | |
| invoice_date | date | |
| total_amount | numeric | |
| status | text | pending, paid, partial |

### payments
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| invoice_id | uuid FK → invoices | |
| po_id | uuid FK → purchase_orders | |
| payment_type | text | cortina_to_dc, retailer_to_cortina |
| payment_date | date | |
| amount | numeric | |
| deductions | numeric | Chargebacks, short-pays |
| notes | text | |

### dot_inventory
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| upload_batch_id | uuid FK → upload_log | |
| sku | text | |
| product_id | uuid FK → products | |
| on_hand | int | Cases |
| incoming | int | |
| in_transit_to_retailer | int | |
| allocated | int | Against open POs |
| available | int | Computed: on_hand - allocated |
| weekly_velocity | numeric | Trailing 8-week average |
| weeks_of_supply | numeric | Computed |
| snapshot_date | timestamptz | |

### raw_materials
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| code | text UNIQUE | "111006" |
| name | text | "Thermopure Flour" |
| quantity | numeric | Current on-hand |
| unit | text | "lbs", "units" |
| lot_count | int | |
| expiry_status | text | good, almost_expired, partial_expired |
| expired_quantity | numeric | |
| default_lead_days | int | Editable |
| category | text | raw_material, packaging, wip, finished_good |
| last_upload_at | timestamptz | |

### raw_material_suppliers
One ingredient can have multiple distributors, each with different brands/pricing.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| raw_material_id | uuid FK → raw_materials | |
| distributor | text | "St Charles", "Dawn" |
| brand | text | "Ardent Mills", "Gold Medal" |
| cost_per_unit | numeric | Editable (finance role, audit logged) |
| moq | numeric | Minimum order quantity |
| lead_time_days | int | Editable |
| is_active | boolean | |
| last_ordered | date | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### raw_material_orders
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| raw_material_id | uuid FK → raw_materials | |
| supplier_id | uuid FK → raw_material_suppliers | |
| distributor | text | Denormalized for display |
| brand | text | Denormalized |
| quantity | numeric | |
| cost_per_unit | numeric | Cost at time of order |
| order_date | date | |
| expected_delivery | date | |
| actual_delivery | date | |
| bol_reference | text | |
| source | text | email (auto), manual |
| status | text | pending, confirmed, delivered |
| created_at | timestamptz | |

### raw_material_lots (FIFO)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| raw_material_id | uuid FK → raw_materials | |
| raw_material_order_id | uuid FK → raw_material_orders | Landing provenance — which order this lot landed against (1 order can land as N lots) |
| lot_number | text | "FL-2401" |
| quantity | numeric | |
| received_date | date | |
| expiry_date | date | |
| fifo_order | int | 1 = oldest (use first) |

### bill_of_materials
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| product_id | uuid FK → products | |
| raw_material_id | uuid FK → raw_materials | |
| quantity_per_batch | numeric | lbs/batch |
| unit | text | |

### inventory_adjustments
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| raw_material_id | uuid FK → raw_materials | |
| adjustment_type | text | shrink, expired, damaged, disposed, other |
| quantity | numeric | Amount removed |
| notes | text | |
| adjusted_by | uuid FK → user_profiles | |
| created_at | timestamptz | |

### weekly_reports
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| week_number | text | "WK15" |
| report_date | date | |
| headline | text | |
| kpis | jsonb | Array of {label, value, delta, color} |
| findings | jsonb | Array of {number, title, detail, action, owner, due} |
| todos | jsonb | Array of {date, task} |
| source_email | text | |
| source_subject | text | |
| received_at | timestamptz | |
| auto_generated | boolean | |
| retailer_scope | text | "Walmart" (Kroger TBD) |
| raw_email_data | jsonb | Parsed email content for reference |

### po_emails
Email thread per PO. Written by the systems@ agent (`source='email'`) on PO/BOL/supplier_confirmation classes, and renderable on PO detail.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| po_id | uuid FK → purchase_orders | **Nullable.** Null = "parked" — the email arrived before the PO was loaded from NetSuite; `extracted_data.po_number` holds the number, and `link_parked_po_emails` attaches it when the PO lands |
| email_timestamp | timestamptz | When the email was sent (column name avoids clash with the `timestamp` type; hooks alias as `timestamp`) |
| sender_name | text | |
| sender_org | text | "Cortina", "DC Ops", "SunTeck" |
| summary | text | Agent's one/two-line plain-language summary |
| extracted_data | jsonb | Normalized agent fields: po_number, carrier, bol_number, ship_date, mabd, delivery_date, total_amount, total_cases, destination_dc, lots (count), anomalies[], classification |
| source | text | email, manual |

### po_changes
Per-field PO mutation history (drives the "Original vs Current" diff + Change History on PO detail). Written by the `log_po_changes` trigger on every UPDATE to tracked columns.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| po_id | uuid FK → purchase_orders ON DELETE CASCADE | |
| field_name | text | "ship_date_actual", "payment_status", "bol_number", etc. |
| original_value | text | |
| new_value | text | |
| change_source | text | internal, email, manual |
| change_reason | text | Free-text notes |
| changed_by | uuid FK → user_profiles | |
| created_at | timestamptz | |

### po_lot_numbers
FG lots that arrived for a PO (the traceability key from outbound → received). Entered manually (Delivery & Lots UI) or extracted by the systems@ agent (`source='email'`).
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| po_id | uuid FK → purchase_orders ON DELETE CASCADE | **Nullable.** Null when the parent email is parked; back-filled with the email via `link_parked_po_emails` |
| lot_number | text | "6147AM" (matches production_runs.fg_lot_code) |
| sku | text | "WCCB" |
| quantity_cases | int | |
| bol_reference | text | |
| received_date | date | |
| source | text | email, manual, dot_report |
| extracted_from_email_id | uuid FK → po_emails | |
| created_at | timestamptz | |

### audit_log
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK → user_profiles | |
| timestamp | timestamptz | DEFAULT now() |
| table_name | text | |
| record_id | uuid | |
| action | text | INSERT, UPDATE, DELETE |
| field_name | text | Specific field changed |
| old_value | text | |
| new_value | text | |

### upload_log
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| upload_type | text | dot, assemblers, production, qbo, netsuite, weekly_report |
| filename | text | |
| uploaded_by | uuid FK → user_profiles | |
| row_count | int | |
| status | text | processing, complete, error |
| errors | jsonb | |
| source | text | manual (drag-drop) or email (systems@ agent auto-import, e.g. an emailed Assemblers workbook) |
| uploaded_at | timestamptz | |

### user_profiles
ON DELETE CASCADE to `auth.users` so dashboard user-deletes don't error on the FK. Created automatically by the `handle_new_auth_user` trigger when a user first signs in.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK → auth.users(id) ON DELETE CASCADE | |
| email | text | |
| full_name | text | |
| role | text | admin, finance, ops |
| title | text | |
| created_at | timestamptz | |

### user_role_seeds
Email-to-role mapping that `handle_new_auth_user` reads when provisioning a `user_profiles` row. Adding someone here BEFORE they sign in gives them the right role on first sign-in; missing entries default to `ops`.
| Column | Type | Notes |
|--------|------|-------|
| email | text PK | Lower-case |
| full_name | text | |
| role | text | admin / finance / ops |
| title | text | |

### production_runs
One Assemblers production job → one finished-good lot. `job_id` is the Assemblers Job number (UNIQUE). `assemblers_po` is Assemblers' internal manufacturing PO (≠ `purchase_orders.po_number`).
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| job_id | text UNIQUE | "9375706" |
| produced_date | date | |
| work_order | text | "6538048/ PO 017-2026" |
| assemblers_po | text | "PO 017-2026" |
| fg_item_code | text | "123006" |
| fg_item_description | text | |
| fg_lot_code | text | "6147AM" |
| fg_expiry_date | date | |
| quantity_produced | numeric | Authoritative from Job sheet header |
| quantity_unit | text | "cs", "ea" |
| job_start_at | timestamptz | |
| job_end_at | timestamptz | |
| reference_1 | text | Usually echoes assemblers_po |
| reference_2 | text | "$8.16 per case" / "MASTER BATCH" |
| source_upload_id | uuid FK → upload_log | |

### production_pallets
Pallet-level FG output (Production sheet rows).
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| run_id | uuid FK → production_runs ON DELETE CASCADE | |
| produced_date | date | |
| pallet_number | text | "M2593256" |
| fg_item_code | text | |
| fg_lot_code | text | |
| fg_expiry_date | date | |
| units_produced | numeric | |
| unit_of_measure | text | |
| source_upload_id | uuid FK → upload_log | |

### production_subcomponents
Per-run raw-lot consumption from each Job sheet's subcomponent table — the cost-rollup + traceability backbone tying raw lots to the FG lot. `quantity_used = consumed + rejected`.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| run_id | uuid FK → production_runs ON DELETE CASCADE | |
| subcomponent_code | text | "111006", "WMT CCF- Batch" |
| subcomponent_description | text | |
| raw_lot_code | text | "26071-83" |
| raw_lot_expiry | date | |
| quantity_consumed | numeric | Went into the product |
| quantity_rejected | numeric | Waste portion |
| quantity_used | numeric | Total drawn |
| unit_of_measure | text | "lb", "ea" |
| reject_pct | numeric | 56.87 (percent, not 0.5687) |
| source_upload_id | uuid FK → upload_log | |

### production_rejects
Per-event reject rows from the Reject sheet — adds timestamp + reason taxonomy the Job-sheet rollup drops. Reasons observed: Waste Product, Yield Loss, QA Test, Damage By Machine, Floor contact, Formulation Trial, Inventory Variance, Crushed Corrugate, Rework Scrap. Stub `production_runs` is created when a reject references a job whose FG output rows haven't landed yet.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| run_id | uuid FK → production_runs ON DELETE CASCADE | |
| work_order | text | |
| item_code | text | |
| item_description | text | |
| base_quantity | numeric | |
| rejected_at | timestamptz | |
| reject_reason | text | Free text (taxonomy is evolving) |
| lot_code | text | |
| expiry_date | date | |
| source_upload_id | uuid FK → upload_log | |

### lot_shipments
Pallet/lot-level outbound from the Assemblers facility (Shipment sheet) — DISTINCT from PO-level `shipments`. Includes non-retailer destinations (COMPACTOR for waste, freight handlers like Wilson Freire). `ship_order_id` links to NetSuite when `ship_to = DOT FOODS`.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| shipment_number | text | "4815846" (facility) |
| ship_order_id | text | "4262458" |
| ship_date | date | |
| ship_to | text | "DOT FOODS", "COMPACTOR", ... |
| item_code | text | |
| item_description | text | |
| lot_code | text | |
| expiry_date | date | |
| base_quantity | numeric | |
| base_unit | text | "eaches" / "pounds" |
| case_quantity | numeric | |
| case_unit | text | "cases" / "Roll" |
| source_upload_id | uuid FK → upload_log | |

### transitions
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| transition_id | text | "TR-001" |
| from_sku | text | |
| to_sku | text | |
| from_name | text | |
| to_name | text | |
| transition_type | text | spec_change, new_product, discontinuation |
| launch_date | date | |
| cutoff_date | date | |
| status | text | planning, in_progress, complete |
| notes | text | |
| checklist | jsonb | Array of {task, done} |

## Gmail agent tables (Phase 2 — live)

The systems@ AI email agent runs as three Supabase Edge Functions (`gmail-oauth-callback`, `gmail-poll`, `gmail-extract`). These two tables hold its state; everything it extracts lands in the existing PO / weekly / upload tables above. RLS is read-only for app users — all writes come from the Edge Functions via the service role.

### gmail_sync_state
Gmail connection + poll cursor. One logical row.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| connected_email | text | The granted inbox (expect `systems@dirtycookie.com`) |
| connected_at | timestamptz | When OAuth was completed |
| last_history_id | text | Gmail historyId cursor (reserved) |
| last_polled_at | timestamptz | Last poll run |
| last_poll_count | int | New messages classified on the last run |
| updated_at | timestamptz | |

### gmail_messages
One row per systems@ message — dedupe key + classification + an audit trail of what the agent did with it.
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| gmail_message_id | text UNIQUE | Dedupe key (makes polling idempotent) |
| gmail_thread_id | text | |
| internal_date | timestamptz | |
| from_email / from_name | text | |
| subject / snippet | text | |
| classification | text | PO, BOL, supplier_confirmation, assemblers_report, weekly_report, other (Haiku) |
| classified_at | timestamptz | |
| processed | boolean | false until acted on; "other" is bulk-swept to true |
| po_id | uuid FK → purchase_orders | Set if the extraction matched a PO |
| po_email_id | uuid FK → po_emails | The po_emails row this produced |
| upload_log_id | uuid FK → upload_log | The import row (assemblers_report) this produced |
| error | text | Failure detail (still marked processed to avoid retry loops) |
| raw | jsonb | Attachment metadata + downstream refs (e.g. weekly_report_id) |
| created_at | timestamptz | |

## Database functions (Phase 2)

- **`get_secret(name)` / `set_secret(name, value)`** — `SECURITY DEFINER`, service-role only. Read/write Vault secrets (`ANTHROPIC_API_KEY`, `GMAIL_OAUTH_CLIENT_ID/SECRET`, `GMAIL_REFRESH_TOKEN`) from Edge Functions, since the `vault` schema isn't exposed to PostgREST. (migration `20260602120000`)
- **`link_parked_po_emails(p_po_id, p_po_number)`** — `SECURITY DEFINER`, returns count. Attaches parked `po_emails` + their `po_lot_numbers` (po_id null) to a PO, matched by `po_number`. Called by the NetSuite parser per upserted PO so email extractions that arrived before the PO back-fill automatically. (migration `20260602160000`)

## EOS tables (`/eos` — live)

Seven tables backing the weekly Level 10 meeting. Design reasoning is in **ADR-047**; the project doc is `docs/EOS.md`. All seven carry `id uuid PK`, `created_at`, `updated_at` (trigger-maintained via `update_updated_at()`), and RLS.

**RLS is uniform across all seven and stricter than the rest of this schema:** one `FOR ALL` policy granting `admin` / `finance` / `ops`, with no public read. The `cortina` role is excluded entirely.

### `eos_seats` — Accountability Chart
| Column | Type | Notes |
|--------|------|-------|
| `major_function` | text NOT NULL | Leadership / Sales / Operations / Finance. **Not** `function` — too close to reserved for PostgREST |
| `seat` | text NOT NULL | Unique together with `major_function` |
| `owner` | text | Free text, not an account FK. `OPEN` / `HIRE` / `TBD` render highlighted |
| `accountable_for` | text | |
| `gwc_get`, `gwc_want`, `gwc_capacity` | boolean | **Nullable** — unset is distinct from "no" |
| `sort_order` | int | |
| `active` | boolean | Removal is a soft delete |

### `eos_rocks` — 90-day priorities
| Column | Type | Notes |
|--------|------|-------|
| `quarter` | text NOT NULL | Label, e.g. `'2026-Q3'` |
| `seq` | int | Number within the quarter |
| `title`, `owner`, `notes` | text | |
| `status` | text | `on_track` / `off_track` / `done` / `dropped` |
| `due_date` | date | |

Indexed on `(quarter, sort_order)`.

### `eos_scorecard_metrics` — the measurables
| Column | Type | Notes |
|--------|------|-------|
| `name` | text NOT NULL UNIQUE | |
| `owner`, `notes` | text | |
| `unit` | text | `number` / `usd` / `percent` / `days` / `ratio` |
| `goal_value` | numeric | **Nullable, and NULL on every seeded row** — the team baselines 3–4 weeks before locking goals |
| `goal_max` | numeric | Upper bound when `goal_direction = 'between'` |
| `goal_direction` | text | `gte` / `lte` / `between` |
| `is_primary` | boolean | The ★ metric — leadership reacts first |
| `active`, `sort_order` | | |

**There is no status column.** R/Y/G is derived at render by `scoreEntry()` in `src/utils/eosWeek.js`, so setting a goal re-scores all history.

### `eos_scorecard_entries` — one number, one week
| Column | Type | Notes |
|--------|------|-------|
| `metric_id` | uuid FK → `eos_scorecard_metrics` | ON DELETE CASCADE |
| `week_start` | date NOT NULL | **CHECK `EXTRACT(ISODOW FROM week_start) = 1`** — always a Monday |
| `value` | numeric | |
| `note` | text | |
| `entered_by` | uuid FK → `user_profiles` | |

`UNIQUE (metric_id, week_start)`; indexed `(week_start DESC, metric_id)`. **Clearing a value deletes the row** rather than writing NULL, so "never entered" and "cleared" remain the same state.

### `eos_issues` — the IDS list
| Column | Type | Notes |
|--------|------|-------|
| `title`, `detail`, `owner` | text | |
| `status` | text | `open` / `solved` / `dropped` / `parked` (`parked` = the Parking Lot) |
| `raised_week`, `solved_week` | date | Mondays, so they join against the scorecard |
| `solution` | text | |
| `priority` | int | `CHECK (NULL OR BETWEEN 1 AND 3)` — the **weekly top-three IDS pick**, not a severity grade |

Indexed on `(status, priority NULLS LAST, sort_order)`.

### `eos_todos` — seven-day commitments
| Column | Type | Notes |
|--------|------|-------|
| `title`, `owner` | text | |
| `created_week`, `due_week` | date | |
| `done` | boolean | `done_at` timestamptz alongside |
| `issue_id` | uuid FK → `eos_issues` | ON DELETE SET NULL — preserves the trail from "we discussed this" to "someone did something" |
| `metric_id` | uuid FK → `eos_scorecard_metrics` | ON DELETE SET NULL. Hangs the To-Do off a **measurable** instead of an issue — what the Scorecard's `▸` panel reads. Never CASCADE: retiring a measurable must not silently delete outstanding commitments |
| `metric_week` | date | Which week's cell raised it. By the time anyone reads a carried-forward To-Do the context is gone, so it says "from Aug 10" — the same reasoning as `raised_week` on an issue |

Partial index on `(due_week) WHERE NOT done`.
Partial index on `(metric_id) WHERE metric_id IS NOT NULL` — most To-Dos carry no metric, and the Scorecard only asks for the ones that do.
**Unique on `(issue_id, title) WHERE issue_id IS NOT NULL`** (`20260823160000`). Not on `issue_id` alone: one issue legitimately spawns several *different* To-Dos, which is how an issue gets solved. What is never legitimate is the same issue producing the same To-Do text twice — which it did three times before this guard.

⚠️ **Carry-forward is a query, not stored state.** An open To-Do with a `metric_id` keeps appearing under its measurable every week until `done` flips, because `useMetricTodos` does not filter by week at all. Nothing copies rows forward; copying would produce one duplicate per week, each needing its own tick.

### `eos_meetings` — one row per week held
| Column | Type | Notes |
|--------|------|-------|
| `week_start` | date NOT NULL **UNIQUE** | CHECKed to a Monday. Its presence is what marks a week "held" |
| `held_on` | date | The actual Tuesday |
| `rating` | numeric | `CHECK (NULL OR BETWEEN 1 AND 10)` — the standard EOS close-out |
| `attendees` | text[] NOT NULL DEFAULT `'{}'` | |
| `notes` | text | |

**The V/TO is not in this schema.** The 5-year, 3-year and 1-year plans, core values and core focus live in `src/data/eosVto.js` — annual prose, not meeting data. See ADR-047.

## Retail Link demand feeds (`/demand-planner` — built, migration not yet applied)

Added by `20260824120000_retail_link_demand_feeds.sql`. The demand side of the Walmart Demand Planner. Populated **only** by uploads at `/uploads` → Retail Link; nothing writes here automatically. See ADR-053/054/055/056 and `docs/DEMAND_PLANNER_FORMULAS.md`.

⚠️ **All three UPSERT, and that is a correctness requirement.** Walmart restates POS after the fact — week 202622 moved 1,322 → 2,343 units for PBG between the Aug 13 snapshot and the WK28 export. The later file must win. An insert-based importer would preserve a number Walmart has withdrawn.

`item_number` is the Walmart **Prime Item Nbr** and is the durable key everywhere. The short codes the planner displays (WC / PBG / CCF) are a display concern, mapped in `WM_ITEM_TO_SKU` in `src/pages/DemandPlanner.jsx` and mirrored in `src/hooks/useDemandFeeds.js` — deliberately **not** stored, so adding an item needs no migration.

### `retail_link_pos_weekly` — POS by item by Walmart week
Source: the `All Item Detail` sheet of `Dirty Cookie WK##.xlsx`. Long-format in the file (one row per item × measure, ~55 week columns); pivoted to one row per week here. **One upload backfills the entire year.**

| Column | Type | Notes |
|--------|------|-------|
| `walmart_week` | int NOT NULL | e.g. `202628` — Walmart week, Sat–Fri |
| `item_number` | text NOT NULL | Prime Item Nbr, e.g. `'679640563'` |
| `item_desc` | text | |
| `pos_units`, `pos_dollars` | numeric | "POS Qty" / "POS Sales $" |
| `pos_units_if_instock` | numeric | Walmart's own un-suppressed demand. The engine derives `trueDemand` as `units ÷ instock`; the two disagree slightly (WC 202620: `5920/0.9459 = 6258` vs `6240.272` supplied). **Prefer the supplied column** — `useDemandFeeds` hands the engine an in-stock that reproduces it exactly |
| `units_per_store_week` | numeric | "Units per Store per Week (w/zeros)" — per **traited** store, so it does *not* yield stores-selling (ADR-055) |
| `avg_price` | numeric | |
| `traited_stores` | int | |
| `instock_pct` | numeric | A **fraction** (`0.9875`), not a percent |
| `wmt_forecast_units`, `variance` | numeric | Walmart's forecast as restated in this sheet |
| `store_on_hand`, `whse_on_hand` | int | ⚠️ **Current week only.** No weekly on-hand history exists in any export. NULL for backfilled weeks — never 0, because the engine blanks `storeOhDoh` on null and would compute a false zero |
| `source_week` | int | The week of the *file* this row came from |
| `upload_id` | uuid FK → `upload_log` | |

`UNIQUE (walmart_week, item_number)`; indexed on `walmart_week`.

⚠️ **Only weeks up to the file's own week are written.** Later week columns exist and read `0` — a future week has not happened, and storing that zero is undetectable downstream because null and 0 mean different things to the engine.

### `retail_link_forecast` — Walmart forecast, snapshot × target
Source: the `Forecast` sheet. One row per (item × `walmart_calendar_week`); a pure forward view from the file's week.

| Column | Type | Notes |
|--------|------|-------|
| `snapshot_week` | int NOT NULL | The week the forecast was **pulled**, taken from the file — never the upload date |
| `target_week` | int NOT NULL | `walmart_calendar_week` |
| `item_number` | text NOT NULL | |
| `item_desc`, `vendor_stock_id` | text | |
| `forecast_units` | numeric | `final_forecast_each_quantity` |
| `upload_id` | uuid FK → `upload_log` | |

`UNIQUE (snapshot_week, target_week, item_number)`; `CHECK (target_week > snapshot_week)`; indexed `(target_week, item_number)`.

⚠️ **`mape` stays blank until two weeks of files are loaded.** Accuracy scoring needs the latest snapshot *strictly before* each target, so history accumulates from the first upload onward. Snapshots earlier than that are unrecoverable. This is expected, not a bug.

The sheet also carries an **embedded pivot table** to the right whose totals do not reconcile with the raw block (WK28: raw PBG 202629 = `2589.32`, pivot = `5058.75`). Only the raw block is parsed — it is the one with a documented grain.

### `retail_link_otif` — DC service / OTIF by PO
Source: the `Receiver` sheet of `OTIF STORE Performance PO DETAILS *.xlsx`. **OTIF = In Time and In Full.** The only Retail Link sheet whose records each carry a real Walmart Week.

| Column | Type | Notes |
|--------|------|-------|
| `walmart_week` | int NOT NULL | |
| `host_po` | text NOT NULL | "Host PO Nbr" — zero-padded, kept as text |
| `oms_po` | text | |
| `mabd` | date | Must Arrive By Date |
| `delivery_window` | text | |
| `cases_ordered`, `cases_early`, `cases_on_time`, `cases_late`, `cases_unfilled` | numeric | Field names match the export's literal headers. `cases_unfilled` is the "cut" in planner terms |
| `otif_pct` | numeric | A **fraction** (`0.6462`), not a percent |
| `upload_id` | uuid FK → `upload_log` | |

`UNIQUE (walmart_week, host_po)`; indexed on `walmart_week`.

Grain is **per PO, not per week**, deliberately: the cut-recovery panel needs the PO count, and per-week totals are a trivial aggregate of these rows while the reverse is not. The export's leading grand-total line has no PO number and is **not** stored.

⚠️ **Never average `otif_pct`.** Roll up as `SUM(cases_on_time) / SUM(cases_ordered)`. Verified against the file's own total: `0.646224` vs the stated `0.6462`, where averaging the per-PO percentages gives `0.6844`. See ADR-056.

⚠️ **Files overlap by design.** A "WK 24 to 27" and a "WK 27 to 27" export arrive together; across both, 234 PO rows collapse to 194 unique `(week, PO)`. The parser also de-duplicates *within* one file, because Postgres rejects `ON CONFLICT DO UPDATE` affecting a row twice in one batch.

### `retail_link_supply_plan` — Walmart's forward ORDER plan
Source: the **`Data`** sheet of `Dirty Cookie Supply Plan Wk##.xlsx`. Added by `20260824130000`. The workbook's `Supply Plan` tab is a monthly pivot and is ignored; `metadata` names the dataset **"Order Forecast"**.

⚠️ **Not the same thing as `retail_link_forecast`.** That is what Walmart expects consumers to *buy*; this is what Walmart plans to *order from us*. Different points in the chain — adding them together double-counts demand, and their totals do not reconcile.

| Column | Type | Notes |
|--------|------|-------|
| `snapshot_date` | date NOT NULL | The pull date, from the file's own `sugg_order_dt` — never the upload date |
| `item_number` | text NOT NULL | `wm_item_nbr` |
| `item_desc` | text | |
| `order_place_date` | date NOT NULL | `order_place_dt` |
| `order_place_week` | int NOT NULL | Derived at parse time from the Walmart calendar (week 202605 begins Sat 2026-02-28). Verified against all 48 weeks of `SEED.weeks` — exact. Stored, not computed on read, so the bucketing rule lives in one place |
| `dc_nbr` | text NOT NULL **DEFAULT `''`** | Empty in the "Total Company" exports. **Not nullable** — NULL never equals NULL, so a nullable column would break the unique key |
| `order_each_quantity` | numeric | **EACHES**, the file's own unit. Everything observed is a clean multiple of 12 (vendor pack), so cases = eaches / 12 — but conversion is left to the reader, matching the rule that units→cases happens exactly once |
| `upload_id` | uuid FK → `upload_log` | |

`UNIQUE (snapshot_date, item_number, order_place_date, dc_nbr)`; indexed `(order_place_week, item_number)`. Verified on WK28: 60 rows = 3 items × 20 order-place dates, all unique, bucketing to weeks 202629–202648.

⚠️ **Excel serials, converted directly.** Reading these dates with SheetJS's `cellDates` produced values like `2026-08-15T23:00:21Z` — a fractional serial rendered in local time, which lands on the **wrong day** west of Greenwich. The parser converts serials against the 1899-12-30 epoch instead.

### `dot_order_history` — DOT outbound orders and cuts
Source: the DOT `Order History (N).xlsx` export, sheet "Outbound Orders". Added by `20260824140000`. Drives the planner's cut-recovery panel.

⚠️ **Not `dot_inventory`.** That is a pallet-level ON-HAND snapshot (still empty, parser still FORMAT UNCONFIRMED). This is an ORDER/CUT feed. Both are called "the DOT report"; they answer different questions.

| Column | Type | Notes |
|--------|------|-------|
| `dot_order_number` | text NOT NULL **UNIQUE** | The natural key — unique on all 221 rows of the sample. Text, not a number: an identifier is never arithmetic |
| `customer_po` | text | The Walmart PO — **joins `retail_link_otif.host_po`** (62 of 169 matched in the sample; partial only because the exports covered different windows). Indexed |
| `corporate_account`, `temperature`, `order_status` | text | `Open` / `Picked` / `Loaded` / `Delivered` |
| `ordered_cases`, `expected_cases`, `reconciled_cases`, `shipped_cases`, `cut_cases` | numeric | **CASES**, always multiples of 21 (the pallet layer) |
| `order_date`, `delivery_date`, `requested_delivery_date`, `customer_arrival_date`, `reconciled_date` | date | Source writes US `M/D/YYYY`; parsed to bare `YYYY-MM-DD` |
| `delivery_week` | int | Derived at parse time from the Walmart calendar. **`delivery_date` is the bucketing date** — it is what reproduces `SEED.dotService`; Order Date does not |
| `appointment_at` | text | Verbatim (`'07/22/2026, 04:00 PM'`). Kept as text because the source carries no timezone and a timestamptz would invent one |
| `originating_dc`, `fulfilling_dc`, `destination`, `load_numbers` | text | `destination` looks like `Walmart/Gdc #6042` |
| `upload_id` | uuid FK → `upload_log` | |

`UNIQUE (dot_order_number)`; indexed on `delivery_week` and `customer_po`.

⚠️ **The quantity identity has three terms:** `ordered = expected + cut + reconciled` (holds 221/221). The two-term version `ordered = expected + cut` holds on only 148/221 — dropping `reconciled` makes a third of the file look corrupt. The parser checks this on import and warns rather than fails.

🔴 **The sample export was pulled 2026-07-16 and is stale** (delivery weeks 202620–25). Every one of its 221 rows carries a cut; 146 are fully cut — either it is exception-filtered or that window is the documented supply crisis. Safe for cut recovery, **unsafe as a delivery record** until a current export settles it (ADR-060).

✅ **The PO join is solid regardless:** `customer_po` reconciles to NetSuite on 169/169 POs. NetSuite cases **== DOT reconciled on 155/169**, which shows NetSuite records what was *delivered*, not ordered, on a cut PO. The DOT export's unique contribution is the **original order quantity** — 12,747 cases against 2,768 in NetSuite for the same POs.

✅ **Validated by exact reproduction:** bucketed by delivery week this file reproduces `SEED.dotService` exactly on ordered, cut and order count for all six weeks. Unlike POS — which Walmart restates, so exact agreement would be suspicious — this export is a fixed slice, so exact agreement is the correct test.

### RLS
All five: `"All can read"` for any authenticated user, `"Internal write"` for `admin` / `finance` / `ops` — the EOS convention. The `cortina` role is gated out of `/demand-planner` at the router anyway (`InternalOnly` in `App.jsx`).

`upload_log.upload_type` gained `'retail_link'` and `'retail_link_otif'` in `20260824120000`, `'retail_link_supply_plan'` in `20260824130000`, and `'dot_order_history'` in `20260824140000`.
