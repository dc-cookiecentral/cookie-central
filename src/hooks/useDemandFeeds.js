import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { walmartWeekOf } from '../parsers/retailLinkSupplyPlan';

// ─────────────────────────────────────────────────────────────────────────
// Live Retail Link feeds for the Walmart Demand Planner.
//
// Reads the three tables added in 20260824120000_retail_link_demand_feeds.sql
// Reads the Retail Link tables plus dot_order_history and reshapes them into
// the exact series the engine in DemandPlanner.jsx
// consumes, so the page's `input` memo can swap sources without the engine
// changing at all.
//
// ── Partial by design ────────────────────────────────────────────────────
// Five of the engine's six series are live: pos, forecasts, otif, dotService
// and orders. Only `production` is still SEED (`production_runs` holds 5 rows),
// and the `dot` ON-HAND series has no source at all — there is no DOT on-hand
// report (Caroline, Aug 24 2026), so the engine's forward DOT cascade runs on
// `params.dotOpeningAnchor` permanently rather than pending a feed.
//
// The caller merges: live where this hook returns data, SEED everywhere else.
// `sources` says which is which, and the page's banner reports it rather than
// claiming the whole page is live.
//
// ── Falls back rather than failing ───────────────────────────────────────
// Before the migration is applied the tables do not exist and PostgREST
// answers 404; after it is applied but before the first upload they are empty.
// Both cases return `null` for that series, which the page reads as "keep
// using SEED". The planner therefore keeps working unchanged at every point
// in the rollout, which is what lets the migration, the first upload, and the
// cutover happen on different days.
// ─────────────────────────────────────────────────────────────────────────

// Walmart Prime Item Nbr → the short codes the engine and UI use.
// Mirrors WM_ITEM_TO_SKU in DemandPlanner.jsx; kept here too so the hook can
// map without importing the page.
const ITEM_TO_SKU = { 679640563: 'WC', 679640564: 'PBG', 683581675: 'CCF' };

// Cortina/NetSuite item numbers → the same short codes. A DIFFERENT numbering
// from the Walmart prime item numbers above; both appear in this file and
// confusing them silently drops every line.
const CORTINA_ITEM_TO_SKU = { 1252: 'WC', 1251: 'PBG', 1287: 'CCF' };

// ⚠️ PostgREST caps a response at 1,000 rows and says NOTHING about it — no
// error, no flag, just a short array. `po_line_items` was already at 1,194 rows
// when this shipped, so an unpaged read silently dropped ~16% of the order book
// and the `orders` series disagreed with its own source (req fell to 37/49
// against SEED; paged, it is 49/49). Every one of these tables grows by a file
// a week, so page ALL of them rather than guessing which crosses the line next.
const PAGE = 1000;
async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) return { data: out.length ? out : null, error };
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return { data: out, error: null };
  }
}

export function useDemandFeeds() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    pos: null,
    forecasts: null,
    dotService: null,
    dotDeliveries: null,
    otif: null,
    orders: null,
    sources: { pos: 'seed', forecasts: 'seed', dotService: 'seed', otif: 'seed', orders: 'seed', dotDeliveries: 'seed' },
    asOf: null,
  });

  useEffect(() => {
    let active = true;

    async function run() {
      const [posR, fcstR, otifR, dotR, ordR] = await Promise.all([
        fetchAll(() => supabase
          .from('retail_link_pos_weekly')
          // wmt_forecast_units and pos_units_if_instock are NOT engine inputs —
          // the Sources tab needs them to show where a number came from and
          // where two Walmart figures disagree. Omitting them made that tab
          // silently empty rather than visibly broken.
          .select('walmart_week, item_number, item_desc, pos_units, pos_dollars, pos_units_if_instock, units_per_store_week, traited_stores, instock_pct, store_on_hand, wmt_forecast_units')
          .order('walmart_week')),
        fetchAll(() => supabase
          .from('retail_link_forecast')
          .select('snapshot_week, target_week, item_number, forecast_units')
          .order('target_week')),
        fetchAll(() => supabase
          .from('retail_link_otif')
          .select('walmart_week, host_po, cases_ordered, cases_on_time, cases_unfilled')
          .order('walmart_week')),
        fetchAll(() => supabase
          .from('dot_order_history')
          .select('delivery_week, dot_order_number, customer_po, ordered_cases, cut_cases, reconciled_cases')
          .order('dot_order_number')),
        fetchAll(() => supabase
          .from('po_line_items')
          .select('cortina_item_number, quantity_cases, line_total, cut_reason, actual_delivery_date, purchase_orders!inner(walmart_po_number, ship_date_original, retailer)')
          .eq('purchase_orders.retailer', 'Walmart')
          // A stable sort is REQUIRED for paging: without an ORDER BY, Postgres
          // may return rows in a different order per page and the pages then
          // overlap or skip.
          .order('id')),
      ]);
      if (!active) return;

      // A missing table (pre-migration) and an empty one are the same answer
      // here: no live data for that series.
      const rows = (r) => (r.error || !r.data?.length ? null : r.data);
      const posRows = rows(posR);
      const fcstRows = rows(fcstR);
      const otifRows = rows(otifR);
      const dotRows = rows(dotR);
      const orderRows = rows(ordR);

      const pos = posRows
        ? posRows
            .filter((r) => ITEM_TO_SKU[r.item_number])
            .map((r) => ({
              wk: r.walmart_week,
              sku: ITEM_TO_SKU[r.item_number],
              units: r.pos_units,
              dollars: r.pos_dollars,
              // Walmart supplies un-suppressed demand directly; the engine
              // otherwise derives it as units / instock. Where both exist they
              // disagree slightly, and Walmart's own figure is authoritative —
              // so hand the engine an in-stock % that reproduces it exactly,
              // and it arrives at Walmart's number rather than its own.
              instock:
                r.pos_units_if_instock > 0 && r.pos_units != null
                  ? r.pos_units / r.pos_units_if_instock
                  : r.instock_pct,
              traited: r.traited_stores,
              // Not derivable from these exports, and not read by the engine.
              // "Units per Store per Week (w/zeros)" is per TRAITED store — the
              // "(w/zeros)" is the giveaway — so units / that ratio recovers
              // traited_stores exactly, not the number of stores that actually
              // sold. Verified on the WK28 file: the derivation returned a
              // number identical to `traited` on every week. Shipping that as
              // storesSelling would look like data and be a tautology, so it
              // stays null. buildSkuSeries never reads it (only the store-level
              // paste-in aggregator does), so nothing downstream changes.
              storesSelling: null,
              // NULL for every backfilled week — no weekly on-hand history
              // exists. Left null rather than zeroed: the engine blanks
              // storeOhDoh on null and would compute a false 0 on zero.
              oh: r.store_on_hand,
              // ── Not read by the engine; carried for the Sources tab ──
              // buildSkuSeries only reads traited/units/dollars/instock/oh, so
              // these ride along free. They exist so the page can show WHERE a
              // number came from and where two sources disagree, instead of
              // silently picking one.
              _wmtFcstDetail: r.wmt_forecast_units,      // Walmart's forecast as RESTATED in All Item Detail
              _trueDemandSupplied: r.pos_units_if_instock, // Walmart's own OOS-adjusted demand
              _instockRaw: r.instock_pct,                 // the raw Instock column, before the inversion above
            }))
        : null;

      const forecasts = fcstRows
        ? fcstRows
            .filter((r) => ITEM_TO_SKU[r.item_number])
            .map((r) => ({
              snap: r.snapshot_week,
              target: r.target_week,
              sku: ITEM_TO_SKU[r.item_number],
              units: r.forecast_units,
              source: 'store',
            }))
        : null;

      // ── Cut recovery: DOT's side of the story ──
      // One row per DOT order → the per-week shape the panel wants. `pos` is the
      // ORDER COUNT, not point-of-sale — the engine's unfortunate naming.
      //
      // This comes from DOT, not from OTIF, and the distinction is the whole
      // point of the panel: OTIF is Walmart measuring US against MABD, while
      // this is what DOT failed to ship — the volume "invisible in NetSuite".
      // Bucketing by delivery_week reproduces SEED.dotService exactly.
      const dotService = dotRows
        ? [...dotRows
            .reduce((m, r) => {
              if (!r.delivery_week) return m;   // unbucketable rows are stored but not charted
              const a = m.get(r.delivery_week) || { wk: r.delivery_week, ordered: 0, cut: 0, pos: 0 };
              a.ordered += r.ordered_cases || 0;
              a.cut += r.cut_cases || 0;
              a.pos += 1;
              m.set(r.delivery_week, a);
              return m;
            }, new Map())
            .values()].sort((a, b) => a.wk - b.wk)
        : null;

      // ── DOT deliveries into each Walmart depot, per SKU ──
      // What actually landed at the depots, which is an ACTUAL — the engine
      // otherwise MODELS this leg off the NetSuite order book. Historical weeks
      // should show what happened; only the future should be modelled.
      //
      // The DOT export carries no item column, so SKU comes from the PO:
      //   dot_order_history.customer_po → purchase_orders.walmart_po_number
      //                                 → po_line_items (the SKU split)
      // Measured on the real pair of exports: 169 of 169 DOT POs matched, and
      // 100% of both ordered and reconciled cases were joinable.
      //
      // 128 of those POs are single-SKU (exact); 41 carry more than one, and
      // those are split PRO-RATA on the PO's own line quantities. That is an
      // approximation and the only one in this file — a PO short-shipped
      // unevenly across its SKUs will be apportioned evenly. It cannot be
      // resolved from these exports: DOT never records the item.
      //
      // `reconciled_cases` is the delivered/settled figure. NOT `shipped_cases`,
      // which is 0 throughout the sample, and not `ordered_cases`, which is what
      // was asked for — the gap between them is the cut.
      const dotDeliveries = (dotRows && orderRows)
        ? (() => {
            // PO → its SKU split, in cases.
            const splitByPo = new Map();
            for (const r of orderRows) {
              const sku = CORTINA_ITEM_TO_SKU[r.cortina_item_number];
              const po = r.purchase_orders?.walmart_po_number;
              if (!sku || !po) continue;
              const m = splitByPo.get(po) || new Map();
              m.set(sku, (m.get(sku) || 0) + (r.quantity_cases || 0));
              splitByPo.set(po, m);
            }
            const acc = new Map();
            let unmatched = 0;
            for (const d of dotRows) {
              if (!d.delivery_week) continue;
              const split = splitByPo.get(d.customer_po);
              if (!split || !split.size) { unmatched += d.reconciled_cases || 0; continue; }
              const total = [...split.values()].reduce((a, b) => a + b, 0);
              if (!total) continue;
              for (const [sku, qty] of split) {
                const share = qty / total;
                const k = `${d.delivery_week}|${sku}`;
                const a = acc.get(k) || { wk: d.delivery_week, sku, delivered: 0, ordered: 0, cut: 0 };
                a.delivered += (d.reconciled_cases || 0) * share;
                a.ordered += (d.ordered_cases || 0) * share;
                a.cut += (d.cut_cases || 0) * share;
                acc.set(k, a);
              }
            }
            const out = [...acc.values()]
              .map((a) => ({ ...a, delivered: Math.round(a.delivered), ordered: Math.round(a.ordered), cut: Math.round(a.cut) }))
              .sort((a, b) => a.wk - b.wk || a.sku.localeCompare(b.sku));
            out.unmatchedCases = unmatched;   // surfaced by the page, not swallowed
            return out;
          })()
        : null;

      // ── OTIF: Walmart's side, its own series ──
      // Deliberately NOT folded into dotService. They measure the same
      // shipments from opposite ends and their weeks do not even align — the
      // DOT export is keyed on delivery date, OTIF on Walmart's own week
      // against MABD. Merging them would silently average two different things.
      const otif = otifRows
        ? [...otifRows
            .reduce((m, r) => {
              const a = m.get(r.walmart_week) || { wk: r.walmart_week, ordered: 0, onTime: 0, unfilled: 0, pos: 0 };
              a.ordered += r.cases_ordered || 0;
              a.onTime += r.cases_on_time || 0;
              a.unfilled += r.cases_unfilled || 0;
              a.pos += 1;
              m.set(r.walmart_week, a);
              return m;
            }, new Map())
            .values()]
            .map((a) => ({
              ...a,
              // ⚠️ OTIF aggregates on CASES, never by averaging the per-PO
              // percentages. Verified against the export's own total row:
              // on_time / ordered = 0.646224 vs the file's stated 0.6462,
              // while the mean of the per-PO percentages gives 0.6844 — a
              // 4-point overstatement, because a 21-case PO would count the
              // same as a 2,500-case one.
              otif: a.ordered > 0 ? a.onTime / a.ordered : null,
            }))
            .sort((a, b) => a.wk - b.wk)
        : null;

      // ── Orders: what Walmart asked for vs what actually landed ──
      // Two different dates, and getting this wrong is silent:
      //   req, cuts  → the PO's SCHEDULED delivery week (ship_date_original)
      //   dlv, rev   → the line's ACTUAL delivery week (per line — different
      //                DCs on one SO deliver on different days)
      // Verified against SEED.orders: req 49/49 and cuts 49/49 exact, dlv and
      // rev 43/49 — and all six misses are weeks 202628–202629, where SEED
      // (frozen 2026-08-13) still showed those deliveries as pending and the
      // newer export knows they landed. See ADR-059.
      //
      // `cuts` is a COUNT OF LINES carrying a cut reason, not a quantity. That
      // is what SEED holds and what reproduces it; summing cut cases would be a
      // different and much larger number.
      const orders = orderRows
        ? (() => {
            const m = new Map();
            const put = (wk, sku, field, v) => {
              if (!wk || !sku) return;
              const k = `${wk}|${sku}`;
              const a = m.get(k) || { wk, sku, req: 0, dlv: 0, rev: 0, cuts: 0 };
              a[field] += v;
              m.set(k, a);
            };
            for (const r of orderRows) {
              const sku = CORTINA_ITEM_TO_SKU[r.cortina_item_number];
              if (!sku) continue;
              const schedWk = walmartWeekOf(r.purchase_orders?.ship_date_original);
              const actualWk = walmartWeekOf(r.actual_delivery_date);
              put(schedWk, sku, 'req', r.quantity_cases || 0);
              if (r.cut_reason) put(schedWk, sku, 'cuts', 1);
              put(actualWk, sku, 'dlv', r.quantity_cases || 0);
              put(actualWk, sku, 'rev', r.line_total || 0);
            }
            return [...m.values()].sort((a, b) => a.wk - b.wk || a.sku.localeCompare(b.sku));
          })()
        : null;

      // "As of" is the newest week with real POS, not the fetch time — the
      // page is only as current as the last file someone uploaded.
      const asOf = pos?.length ? Math.max(...pos.map((p) => p.wk)) : null;

      setState({
        loading: false,
        error: posR.error && fcstR.error && otifR.error && dotR.error ? posR.error.message : null,
        pos,
        forecasts,
        dotService,
        dotDeliveries,
        otif,
        orders,
        sources: {
          pos: pos ? 'live' : 'seed',
          forecasts: forecasts ? 'live' : 'seed',
          dotService: dotService ? 'live' : 'seed',
          otif: otif ? 'live' : 'seed',
          orders: orders ? 'live' : 'seed',
          dotDeliveries: dotDeliveries ? 'live' : 'seed',
        },
        asOf,
      });
    }

    run();
    return () => { active = false; };
  }, []);

  return state;
}
