# Cookie Central — Architecture Decisions

## ADR-001: White label scope only (Phase 1-3)
**Date:** May 2026
**Decision:** Cookie Central tracks white-label retail POs only. E-commerce and corporate sales are post-Phase 3.
**Rationale:** White label is the critical operational need. E-comm/corporate have different fulfillment patterns.

## ADR-002: Read-mostly app with selective write-backs
**Date:** May 2026
**Decision:** Cookie Central is primarily a visibility tool. Write-backs limited to: reorder confirmations, inventory adjustments, manual order entry.
**Rationale:** Production orders to Assemblers go via email/PDF (Marc's existing workflow). Cookie Central generates the document; Marc sends it.

## ADR-003: Multi-retailer with filter (not retailer-specific)
**Date:** May 20, 2026
**Decision:** Show all retailers (Walmart + Kroger) in one dashboard with a retailer filter. Not separate apps or views.
**Rationale:** Inventory, production, and raw materials are shared across retailers. Separating would create blind spots. Discovered when Kroger POs (PO14371, PO14400) appeared in the same Cortina/NetSuite pipeline.

## ADR-004: "Cortina" not "National"
**Date:** May 20, 2026
**Decision:** Use "Cortina" exclusively in all UI, docs, and code. Never "National" or "National Food Trading."
**Rationale:** Consistency. The entity name is Cortina Foods.

## ADR-005: Reorder calculator with honeymoon period
**Date:** May 2026
**Decision:** Reorder tab visible from Phase 1 in preview mode. Active (Confirm enabled) only after 2-3 weeks of Marc validating forecasts against actual orders.
**Rationale:** Build trust in the data before Marc depends on it. Preview mode lets Marc compare suggestions to what he's actually ordering via email.

## ADR-006: Raw materials have multiple distributors/brands
**Date:** May 20, 2026
**Decision:** Each ingredient can have multiple rows in raw_material_suppliers, one per distributor/brand combination. Each has its own cost, MOQ, and lead time.
**Rationale:** St Charles and Dawn carry different brands of the same ingredient at different prices. Marc needs to see options when reordering. Future forecasting will compare suppliers.

## ADR-007: Audit log on all mutations, pricing requires Finance role
**Date:** May 20, 2026
**Decision:** Every data change logs to audit_log. Pricing edits (COG, revenue, cost_per_unit) require finance or admin role and a confirmation dialog.
**Rationale:** Shahira meeting requirement. Prevents accidental pricing changes and provides accountability.

## ADR-008: EOS integration in Weekly Report
**Date:** May 2026
**Decision:** Weekly Report structures data for Level 10 meetings: Scorecard (fixed metrics), Rocks (placeholder until quarterly planning), To-Dos (7-day commitments from IDS), Issues List (auto-populated from alerts).
**Rationale:** Company transitioning to EOS. Cookie Central should support the L10 workflow, not create a parallel one.

## ADR-009: Weekly Report from Bentonville Merchants email
**Date:** May 2026
**Decision:** Weekly ops summary auto-generated from blayn@bentonvillemerchants.com email. Subject: "Dirty Cookie | Weekly Reporting | WK##". Scheduled Monday 9:30 AM CT. Manual "Check for new" button. Archive by week.
**Rationale:** This is the existing data source for Walmart Retail Link performance. Kroger reporting source TBD.

## ADR-010: Slack notifications in Phase 3
**Date:** May 20, 2026
**Decision:** Phase 3 adds Slack integration. Owners assigned to Findings, To-Dos, and Issues receive automatic notifications. Tied to login credentials.
**Rationale:** Approved by Shahira. Deferred to Phase 3 to prioritize core functionality first.

## ADR-011: Payment terms are per-retailer
**Date:** May 20, 2026
**Decision:** Payment terms stored per PO. Walmart: Net 30/60 (Cortina pays DC at 30d, Walmart pays Cortina at 60d). Kroger: Due on receipt. Payment timeline UI adapts labels per retailer.
**Rationale:** Discovered from Kroger PO PDFs showing "Due on receipt" vs Walmart's established 30/60 terms.

## ADR-012: DOT is retailer-agnostic
**Date:** May 2026
**Decision:** DOT Foods inventory view does not filter by retailer. DOT is a redistributor — product flows through to whichever retailer DC it's allocated to. The subtitle says "Redistributor" not "Pipeline to Walmart."
**Rationale:** Same WCCB inventory at DOT serves both Walmart and Kroger POs.

## ADR-013: Shrink/expired product reconciliation
**Date:** May 20, 2026
**Decision:** Inventory adjustment capability with reason codes (shrink, expired, damaged, disposed, other). Logged to audit trail. Feeds into EOM Snapshot as a line item.
**Rationale:** Marc needs to write down inventory when product is lost or expires. Currently tracked informally.

## ADR-015: Assemblers report parser — column mapping
**Date:** May 26, 2026
**Decision:** Parse the Assemblers "Inventory Snapshot Report" (.xlsx) by reading ALL sheets and merging — the export splits items across two sheets with identical headers (Sheet1 holds 3 codes, incl. the Kroger finished-goods SKUs, missing from the main sheet). 384 pallet-level rows aggregate to 28 items by `Item code`. Category is derived from `Item type` (FINISHED → finished_good) and base UOM (RAW + `ea` → packaging for Trays/Films/Master-cases; RAW + `lb` → raw_material). Expired quantity comes from the explicit `Inventory status = Expired` value, not inferred from dates; dates only drive `almost_expired` (≤60 days).
**Rationale:** Validated against the real 2026-05-06 export. `Item type` has no PACKAGING value, so packaging is distinguished by `ea` UOM. `Inventory status` is authoritative for expiry. `Regulatory Hold` / `Inventory Freeze` are quality holds (65k units in the sample) with no schema field yet — surfaced in the upload summary; a `held_quantity` column on `raw_materials` is a candidate follow-up if hold stock must be excluded from availability.

## ADR-016: XLSX upload support (lazy-loaded SheetJS)
**Date:** May 26, 2026
**Decision:** The upload pipeline accepts `.xlsx`/`.xls` (Assemblers) in addition to CSV (DOT/QBO). `parseFile()` dispatches on extension; SheetJS (`xlsx`) is dynamically imported only when an Excel file is uploaded, keeping the ~330 KB lib out of the initial bundle (separate `xlsx-*.js` chunk).
**Rationale:** The real Assemblers export is Excel with multiple sheets. CSV-only would force a manual export step. Lazy-loading avoids penalizing the common case.

## ADR-014: Supabase connected to GitHub
**Date:** May 20, 2026
**Decision:** Supabase project linked to the cookie-central GitHub repo. Database migrations managed through `supabase/migrations/` with sequential numbering. Initial schema is `001_initial_schema.sql`. All subsequent changes are new migration files, never editing applied migrations.
**Rationale:** Version-controlled schema changes, team visibility, rollback capability. Supabase CLI (`supabase db push`) applies migrations. GitHub integration means schema changes are tracked alongside code changes.
