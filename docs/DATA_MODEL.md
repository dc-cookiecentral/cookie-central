# Cookie Central — Data Model

## Schema Location
`supabase/migrations/001_initial_schema.sql` — initial migration (linked to GitHub)
Future schema changes go in `002_*.sql`, `003_*.sql`, etc.

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
weekly_reports (standalone, from email)
audit_log (standalone, logs all changes)
upload_log (standalone, tracks CSV uploads)
user_profiles ──< (role-based access)
```

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
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| po_id | uuid FK → purchase_orders | |
| timestamp | timestamptz | |
| sender_name | text | |
| sender_org | text | "Cortina", "DC Ops", "SunTeck" |
| summary | text | |
| extracted_data | jsonb | {shipDate, carrier, etc.} |
| source | text | email, manual |

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
| upload_type | text | dot, assemblers, qbo, netsuite |
| filename | text | |
| uploaded_by | uuid FK → user_profiles | |
| row_count | int | |
| status | text | processing, complete, error |
| errors | jsonb | |
| uploaded_at | timestamptz | |

### user_profiles
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK (matches auth.users.id) | |
| email | text | |
| full_name | text | |
| role | text | admin, finance, ops |
| title | text | CEO, COO, Biz Exec, Ops, Admin |
| created_at | timestamptz | |

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
