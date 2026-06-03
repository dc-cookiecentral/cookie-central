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
- [ ] **Wipe demo POs before real Cortina data** if not already done — see
  RUNBOOK §4.3.
