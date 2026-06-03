import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Lot-traceability chain (Day 11). Given any lot code — a raw-material lot, a
// finished-good (FG) lot, or an outbound/arrived lot — resolve the full chain
// in both directions:
//
//   raw_material_lots.lot_number
//     → production_subcomponents.raw_lot_code   (which batches consumed the raw lot)
//     → production_runs.fg_lot_code             (the FG lot the batch produced)
//     → production_pallets.fg_lot_code          (pallets built from the FG lot)
//     → lot_shipments.lot_code                  (shipments the FG lot left in)
//     → po_lot_numbers.lot_number               (the PO it arrived against)
//     → purchase_orders                         (retailer + delivery)
//
// Phase 1 stores raw_lot_code / fg_lot_code as free text, so we don't trust the
// DB to join cleanly (task 11.3). At Phase-1 data volume the cheapest robust
// approach is to pull each table once and join in memory on a NORMALISED key
// (trim + uppercase + drop whitespace) so the chain doesn't drop rows on format
// drift. Promote to FKs in a later migration if volume ever demands it.

// Match key: case/whitespace-insensitive so "6147 am" === "6147AM".
export function normLot(s) {
  return String(s ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

const PO_EMBED =
  'id, po_number, retailer, ship_status, payment_status, delivery_date, mabd, destination_dc';

async function fetchAll() {
  const [rawLots, runs, subs, pallets, shipments, poLots] = await Promise.all([
    supabase
      .from('raw_material_lots')
      .select('id, lot_number, quantity, received_date, expiry_date, raw_materials ( code, name, unit )'),
    supabase
      .from('production_runs')
      .select(
        'id, job_id, fg_lot_code, fg_item_code, fg_item_description, produced_date, fg_expiry_date, quantity_produced, quantity_unit, work_order, assemblers_po'
      ),
    supabase
      .from('production_subcomponents')
      .select(
        'id, run_id, subcomponent_code, subcomponent_description, raw_lot_code, quantity_consumed, quantity_used, unit_of_measure'
      ),
    supabase
      .from('production_pallets')
      .select('id, run_id, pallet_number, fg_lot_code, units_produced, unit_of_measure, produced_date'),
    supabase
      .from('lot_shipments')
      .select(
        'id, shipment_number, ship_order_id, ship_date, ship_to, item_code, item_description, lot_code, case_quantity, case_unit, base_quantity, base_unit'
      ),
    supabase
      .from('po_lot_numbers')
      .select(`id, lot_number, sku, quantity_cases, bol_reference, received_date, source, purchase_orders ( ${PO_EMBED} )`),
  ]);

  const first = [rawLots, runs, subs, pallets, shipments, poLots].find((r) => r.error);
  if (first) throw new Error(first.error.message);

  return {
    rawLots: rawLots.data ?? [],
    runs: runs.data ?? [],
    subs: subs.data ?? [],
    pallets: pallets.data ?? [],
    shipments: shipments.data ?? [],
    poLots: poLots.data ?? [],
  };
}

// Assemble the trace result for one normalised query key against the dataset.
function buildTrace(query, db) {
  const q = normLot(query);
  const { rawLots, runs, subs, pallets, shipments, poLots } = db;

  // Direct matches per table.
  const rawLotMatches = rawLots.filter((l) => normLot(l.lot_number) === q);
  const subRawMatches = subs.filter((s) => normLot(s.raw_lot_code) === q); // q used as a raw lot
  const runMatches = runs.filter((r) => normLot(r.fg_lot_code) === q);
  const palletMatches = pallets.filter((p) => normLot(p.fg_lot_code) === q);
  const shipMatches = shipments.filter((s) => normLot(s.lot_code) === q);
  const poLotMatches = poLots.filter((p) => normLot(p.lot_number) === q);

  const rawSide = rawLotMatches.length > 0 || subRawMatches.length > 0;
  const fgSide =
    runMatches.length > 0 || palletMatches.length > 0 || shipMatches.length > 0 || poLotMatches.length > 0;

  const matchedTables = [];
  if (rawLotMatches.length) matchedTables.push('raw_material_lots');
  if (subRawMatches.length) matchedTables.push('production_subcomponents');
  if (runMatches.length) matchedTables.push('production_runs');
  if (palletMatches.length) matchedTables.push('production_pallets');
  if (shipMatches.length) matchedTables.push('lot_shipments');
  if (poLotMatches.length) matchedTables.push('po_lot_numbers');

  // The chain is anchored on FG lot codes. Collect every FG lot reachable from
  // the query: directly (FG-side matches) and downstream of a raw match (the FG
  // lot of any run that consumed the raw lot — a raw lot can feed many runs).
  const fgCodes = new Set();
  for (const r of runMatches) fgCodes.add(normLot(r.fg_lot_code));
  for (const p of palletMatches) fgCodes.add(normLot(p.fg_lot_code));
  for (const s of shipMatches) fgCodes.add(normLot(s.lot_code));
  for (const p of poLotMatches) fgCodes.add(normLot(p.lot_number));
  const runById = new Map(runs.map((r) => [r.id, r]));
  for (const s of subRawMatches) {
    const run = runById.get(s.run_id);
    if (run?.fg_lot_code) fgCodes.add(normLot(run.fg_lot_code));
  }

  const fgLots = [...fgCodes].map((fg) => {
    const runsForFg = runs.filter((r) => normLot(r.fg_lot_code) === fg);
    const runIds = new Set(runsForFg.map((r) => r.id));
    const rawSources = subs
      .filter((s) => runIds.has(s.run_id))
      .map((sub) => ({
        sub,
        rawLot: rawLots.find((l) => normLot(l.lot_number) === normLot(sub.raw_lot_code)) || null,
      }));
    return {
      fgLot: runsForFg[0]?.fg_lot_code || fg, // original casing when we have a run
      run: runsForFg[0] || null,
      runCount: runsForFg.length,
      rawSources,
      pallets: pallets.filter((p) => normLot(p.fg_lot_code) === fg),
      shipments: shipments.filter((s) => normLot(s.lot_code) === fg),
      poLots: poLots
        .filter((p) => normLot(p.lot_number) === fg)
        .map((poLot) => ({ poLot, po: poLot.purchase_orders || null })),
    };
  });

  // Recall report — every distinct PO touched, with the FG lot that reached it.
  const recallPOs = [];
  const seenPo = new Set();
  for (const g of fgLots) {
    for (const { po } of g.poLots) {
      if (po && !seenPo.has(po.id)) {
        seenPo.add(po.id);
        recallPOs.push({ po, viaLot: g.fgLot });
      }
    }
  }

  return {
    query,
    normalized: q,
    found: rawSide || fgSide,
    entryKind: rawSide ? 'raw' : fgSide ? 'fg' : null,
    matchedTables,
    rawEntry: rawSide ? { lots: rawLotMatches, subUses: subRawMatches } : null,
    fgLots,
    recallPOs,
  };
}

// Resolve the trace chain for `lotCode`. Returns { trace, loading, error }.
export function useLotTrace(lotCode) {
  const [trace, setTrace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!lotCode || !lotCode.trim()) {
      setTrace(null);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    fetchAll()
      .then((db) => {
        if (!active) return;
        setTrace(buildTrace(lotCode, db));
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [lotCode]);

  return { trace, loading, error };
}
