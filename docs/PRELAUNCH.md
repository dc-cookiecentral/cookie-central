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
- [ ] 🔴 **Ticket the 1,000-row cap** before ~Nov 2026. `purchase_orders` is at
  892 and grows ~45–50/month; at 1,000, Product Orders / Payments / Alerts begin
  silently dropping rows. Fix = the `fetchAll` pattern in `useDemandFeeds.js`
  applied to `usePurchaseOrders.js`, `usePayments.js`, `useAlerts.js`.
- [ ] 🟠 **Add the DOT Order History to the weekly upload routine.** A report now
  arrives every week, so it sits alongside the Retail Link files (card 5 at
  `/uploads`). The loaded one is a 2026-07-16 pull, three weeks behind POS —
  upload the current one. **On the next report, check whether it contains any
  orders with zero cuts**: that settles whether the export is exception-filtered
  and whether it can ever serve as a record of total deliveries.
- [ ] 🟠 **Do not raise the "CCF ×5.0 forecast" with Bentonville.** That
  statistic was computed over corrupted cells and has been retracted. The
  defensible observation is CCF 26,549 vs 5,355 at week 202629.
- [ ] 🟡 **Adjudicate the in-stock restatement.** Walmart revised PB&J in-stock
  for weeks 21–27 from 0.62–0.69 up to 0.87–0.98. It divides into demand, so it
  moves the forecast. Both are shown in the Sources tab; nobody has decided.
- [ ] 🟡 **Run `node scripts/smoke-render.mjs` before any Demand Planner
  deploy.** Grepping the built bundle for strings does not prove the page runs —
  it shipped blank three times that way.
