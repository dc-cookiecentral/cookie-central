# Sample Central + ShipStation — Current State

**As of July 28, 2026.** The authoritative answer to "what's built, what's live,
what's next." Design *rationale* lives in `DECISIONS.md` (ADR-024→033);
account-side setup lives in `SHIPSTATION_SETUP_CHECKLIST.md`; the field contract
lives in `SHIPSTATION_INTEGRATION.md`. This file is state, not reasoning —
if it disagrees with an ADR about *why*, the ADR wins.

---

## Deployed and verified

| Layer | State |
|---|---|
| Schema | All migrations applied; remote ledger **in sync** |
| Edge Function `shipstation-customstore` | Deployed, `verify_jwt=false`, Basic Auth enforced |
| Frontend | On `main`, deployed via Vercel |
| ShipStation Custom Store | Connected to the **production** store (no sandbox — ADR-029) |
| Rush notification | ShipStation automation rule on `CustomField1 = rush`, **built July 28** |
| Test mode | `VITE_SAMPLE_TEST_MODE=true`, banner confirmed live |

**Sample Central UI** (ADR-030): own aubergine shell outside the shared `Layout`,
three tabs (Order Samples · Pending Shipments · Address Book), builder as a
slide-out drawer with Quick Start inside it, catalog of all **27 products**
(18 Baked + 9 Raw).

**Pending Shipments**: click-to-expand detail — pipeline, ship-to, required-by,
collateral, billing, tracking/carrier/service, ship + label dates, shipping cost,
full item list, notes. **Status is read-only** (ADR-032).

## The field contract as built

| Element | Carries |
|---|---|
| `CustomField1` | `rush` — internal urgency flag, drives the notification rule |
| `CustomField2` | `custom-request` when any line is bespoke |
| `CustomField3` | **free** — deliberately unallocated (ADR-032) |
| `InternalNotes` | collateral · handling/temp · required-by · third-party billing · notes · custom-line specs |
| `ShippingMethod` | **not sent** — ShipStation owns service choice (ADR-031) |
| `Items` | real product lines only; custom lines ride InternalNotes + CF2 |

## Writeback (`shipnotify`, on label creation)

Lands `tracking_number`, `carrier`, `service`, `shipped_at`,
`label_created_at`, `shipping_cost`, and sets `status = 'shipped'`.

---

## Next — blocking a real launch

1. **§3 automation rules** — cold-chain → refrigerated + insulated + next-day; `CustomField2 = custom-request` → manual review.
2. **§4 cold-chain product tags** (co-man). ⚠️ **Now genuinely blocking**: the catalog opened to the 9 Raw products, so frozen shipments are orderable. Untagged, a frozen sample ships ambient with no error anywhere.
3. **§A.1 Cortina user seeding** — deferred while the soft launch is DC-internal. Becomes blocking at the first Cortina invite, and **the mistake is not self-correcting**: an unseeded user provisions as internal `ops`, and seeding afterwards does not fix it.
4. **§9 go-live cleanup** — clear `VITE_SAMPLE_TEST_MODE`, redeploy, purge `SMP-TEST-%` in Supabase **and** cancel the matching orders in ShipStation.

## Next — designed but not built

- **Collateral as packing-slip line items.** `COLLATERAL_SKUS` (`COLL-WARMING`, `COLL-SHOT-FLYER`) is defined in `src/utils/sampleCentral.js` but **unused — currently dead code**. Collateral still rides `InternalNotes` as text. Building it means emitting synthetic `<Item>` lines; ShipStation will auto-create those product records.
- **`required_by` → `CustomerNotes`.** Proposed so the date prints on the packing slip; not built. It still sits in `InternalNotes`, which is internal-only.

## Next — blocked on a mechanism, not on effort

- **`delivered` and `processing` statuses.** The Custom Store cannot push either (ADR-033). Needs ShipStation **Webhooks** — a separate feature, not yet evaluated — or carrier tracking polling. Until then the pipeline is effectively **submitted → shipped**, and two of the four stat tiles in Pending Shipments read a permanent zero.

## Known gaps, accepted

- **No import acknowledgment.** The Custom Store is pull-only; nothing confirms an order reached ShipStation.
- **Rush email fires on import, not submit** — a lag of up to the import interval. Rules also run once on import, so a rush flag added after import would not re-trigger it (no edit path exists today).
- **Third-party billing is informational.** No billing elements exist in the Custom Store XML; the co-man keys the account in by hand.
- **No sandbox.** Test mode labels orders but does not withhold them from the co-man's real queue.
- **`deno test` has never been run under Deno.** The 87-case suite passes via an esbuild+Node shim; the Deno runtime and the `jsr:@std/assert` import are unexercised.
