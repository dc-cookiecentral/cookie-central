# Cookie Central — Pre-Launch Checklist

One-off tasks to clear before declaring launch. The broader feature/ship
checklist lives in `BUILD_PLAN.md` (§ Launch checklist); day-to-day operational
procedures live in `RUNBOOK.md`. This file is for security/cleanup items that are
easy to forget.

## Security

- [ ] **Rotate the Supabase `service_role` key.**
  It was shared into a dev session on **2026-06-02** to simulate the Cortina
  PO14451 import (used transiently — written to a temp file that was deleted,
  never committed to git, never printed to logs/transcript). No evidence of
  external exposure, so this is precautionary hygiene rather than incident
  response — but rotate it before launch.
  - Supabase dashboard → **Project Settings → API → roll `service_role`**.
  - If `EDGE_CRON_BEARER` (the daily `gmail-poll` cron's bearer) was set to that
    same key, re-point it after rotating:
    `select public.set_secret('EDGE_CRON_BEARER', '<new service_role key>');`
  - No code/redeploy needed — the Edge Functions read their own injected
    `SUPABASE_SERVICE_ROLE_KEY`, not this value.

## Data hygiene

- [ ] **Decide on the simulated `PO14451` row.** It was created by the import
  simulation (real `purchase_orders` row + 2 line items, with the 5 systems@
  email extractions linked). It's harmless — a real Cortina PO PDF upload
  upserts the same `po_number` idempotently. Either leave it, or delete it via
  the **dashboard** (note: `purchase_orders` has no app-side DELETE policy, and
  `po_emails.po_id` is `ON DELETE CASCADE`, so deleting the PO will also delete
  its 5 linked email extractions).
- [ ] **Wipe the 7 prototype demo POs before real Cortina data** (dashboard SQL
  editor — there's no app-side DELETE policy). The demo seed file has been
  removed; this is the one-time cleanup of the rows it created:
  ```sql
  DELETE FROM purchase_orders
  WHERE po_number IN ('PO14201','PO14255','PO14290','PO14326','PO14331','PO14371','PO14400');
  -- CASCADE removes their po_line_items, po_emails, po_changes, po_lot_numbers,
  -- shipments, invoices, payments.
  ```
  (`PO14451` is real — leave it out unless you also want its 5 linked email
  extractions gone. General delete pattern: RUNBOOK §4.2.)

## Demand Planner — before the team starts using it (Aug 24 2026)

The page is live on real Walmart data. These are the things to clear, or at
minimum to have told people, before it becomes a decision-making tool.
Full detail: `DEMAND_PLANNER_KNOWN_ISSUES.md`.

- [ ] 🔴 **Tell the team the supply-side numbers are placeholder.** DC/DOT
  days-on-hand and recommended production divide live demand by frozen
  production data and a non-existent DOT on-hand feed. PB&J reads **363.8 days
  on hand**; every SKU recommends **0 cases**. Someone will otherwise plan a
  co-bakery run off it — it is the single most likely way this page causes harm.
  ✅ **Done Aug 24 2026** — those figures are greyed, struck through and badged
  `placeholder` in the UI, their threshold flags are suppressed, and the summary
  tab carries a non-dismissible notice. Still worth saying out loud to the team.
- [x] 🔴 **Ticket the 1,000-row cap** — ticketed Aug 24 2026 at the top of
  `BUILD_PLAN.md`. ⚠️ **But the thing it warned about has now happened:**
  `purchase_orders` is at **1,265** and `po_line_items` at **1,606** (measured
  Oct 12 2026), both returning exactly 1,000 rows unpaged. Product Orders /
  Payments / Alerts are dropping rows *today* — mitigated only by all three being
  hidden from the nav. Fix = the `fetchAll` pattern in `useDemandFeeds.js`
  applied to `usePurchaseOrders.js`, `usePayments.js`, `useAlerts.js`.
  **Blocker for the Product Orders return.**
- [ ] 🟠 **Add the DOT Order History to the weekly upload routine.** A report now
  arrives every week, so it sits alongside the Retail Link files (card 5 at
  `/uploads`). ⚠️ **Still not happening as of Oct 13 2026** — the last DOT upload
  of any kind was Aug 24 2026 and the export it carried is a 2026-07-16 pull,
  now ~11 weeks behind POS (202625 vs 202636). The Retail Link files are being
  kept current; this one is being skipped. **On the next report, check whether it
  contains any orders with zero cuts**: that settles whether the export is
  exception-filtered and whether it can ever serve as a record of total
  deliveries.
- [ ] 🟠 **Do not raise the "CCF ×5.0 forecast" with Bentonville.** That
  statistic was computed over corrupted cells and has been retracted. The
  defensible observation is CCF 26,549 vs 5,355 at week 202629.
- [ ] 🟡 **Adjudicate the in-stock restatement.** Walmart revised PB&J in-stock
  for weeks 21–27 from 0.62–0.69 up to 0.87–0.98. It divides into demand, so it
  moves the forecast. Both are shown in the Sources tab; nobody has decided.
- [ ] 🟡 **Run `node scripts/smoke-render.mjs` before any Demand Planner
  deploy.** Grepping the built bundle for strings does not prove the page runs —
  it shipped blank three times that way.

## Demand Planner — added Oct 13 2026

- [ ] 🟠 **Confirm the fourth SKU's name and short code.** A new Walmart item
  started shipping in week 202635 (Cortina item **1324**, Walmart prime item
  **686669913**) and was invisible on `/demand-planner` for two weeks, carrying
  22,845 cases / $135,474 of orders and 266k units of forecast. It is now mapped
  as **`BC` — "White Chocolate and Black Currant"**, which was read off Walmart's
  own `item_desc` and vendor stock number, **not** off a Dirty Cookie product
  list. If the official name differs, `SKU_NAMES` in
  `src/pages/DemandPlanner.jsx` is the only place to change it. See ADR-063.
- [ ] 🟡 **There is no database record of retail item numbers at all** — worth
  knowing before anyone goes looking for one. The interim mapping (migration
  `20260617130000`) lived on the old finished-goods `products` table, which was
  renamed to `products_legacy` by `20260714120000` and **dropped** by
  `20260715130000` along with the three `product_id` FK columns (ADR-024,
  deliberately). `po_line_items` now carries text `sku` / `cortina_item_number`
  with no FK, and the only item-number→product translation left anywhere is the
  two hardcoded maps in `src/hooks/useDemandFeeds.js`. That is why a new SKU can
  disappear from a page silently. Re-establishing a real catalogue entry for
  retail items belongs to the pending **Spec Sheet** work.
