import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';
import { ITEM_TO_SKU } from './useDemandFeeds';
import { EACHES_PER_CASE, DEFAULT_EACHES_PER_CASE } from '../parsers/retailLinkSupplyPlan';

// DOT stock for the Inventory page, newest reading per SKU.
//
// Reads `dot_on_hand` (DOT's Inventory Snapshot upload — the same table the
// Demand Planner reads). Until Nov 6 2026 this read `dot_inventory`, which was
// built for a DOT file that never existed and has always been empty, so the
// Inventory page said "No DOT inventory" while the real stock sat in
// `dot_on_hand`. `dot_inventory` is still read by useAlerts / useEomSnapshot;
// retiring it is a separate decision (BUILD_PLAN, Oct 28–29).
//
// Row shape (cases):
//   on_hand          good (RG) cases, committed included
//   allocated        committed — Loaded + Picked. Available = on_hand − allocated
//   expired          EX lots, not in on_hand
//   expiring60       good cases expiring within 60 days of the snapshot
//   weekly_velocity  Walmart POS in cases/week, mean of the last 4 weeks with
//                    sales — the planner's DOT days-on-hand basis. null with no POS.
// DOT's snapshot has no incoming or in-transit-to-retailer figures, so the page
// no longer shows those columns rather than showing them as blank.
export function useDotInventory() {
  const [rows, setRows] = useState([]);
  const [lastSnapshot, setLastSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [ohR, posR] = await Promise.all([
        fetchAll(() => supabase
          .from('dot_on_hand')
          .select('sku, wm_week, snapshot_date, good_cases, committed_cases, expired_cases, expiring_60d_cases, earliest_good_expiry')
          .order('sku')
          .order('wm_week')),
        fetchAll(() => supabase
          .from('retail_link_pos_weekly')
          .select('walmart_week, item_number, pos_units')
          .order('walmart_week')
          .order('item_number')),
      ]);
      if (!active) return;
      if (ohR.error) { setError(ohR.error.message); setLoading(false); return; }

      // Newest reading per SKU (week, then snapshot date).
      const latest = new Map();
      for (const r of ohR.data ?? []) {
        const cur = latest.get(r.sku);
        if (!cur || r.wm_week > cur.wm_week || (r.wm_week === cur.wm_week && r.snapshot_date > cur.snapshot_date)) {
          latest.set(r.sku, r);
        }
      }

      // POS cases/week per SKU. A POS read failure only costs the Wks column,
      // so it is not surfaced as an error.
      const posBySku = new Map();
      for (const r of posR.error ? [] : posR.data ?? []) {
        const sku = ITEM_TO_SKU[r.item_number];
        if (!sku || !(r.pos_units > 0)) continue;
        const pack = EACHES_PER_CASE[r.item_number] ?? DEFAULT_EACHES_PER_CASE;
        const byWk = posBySku.get(sku) ?? new Map();
        byWk.set(r.walmart_week, (byWk.get(r.walmart_week) ?? 0) + r.pos_units / pack);
        posBySku.set(sku, byWk);
      }
      const velocity = (sku) => {
        const wks = [...(posBySku.get(sku)?.entries() ?? [])].sort((a, b) => a[0] - b[0]).slice(-4);
        return wks.length ? wks.reduce((a, [, v]) => a + v, 0) / wks.length : null;
      };

      const out = [...latest.values()]
        .sort((a, b) => a.sku.localeCompare(b.sku))
        .map((r) => ({
          sku: r.sku,
          snapshot_date: r.snapshot_date,
          on_hand: Number(r.good_cases ?? 0),
          allocated: Number(r.committed_cases ?? 0),
          expired: Number(r.expired_cases ?? 0),
          expiring60: Number(r.expiring_60d_cases ?? 0),
          earliest_expiry: r.earliest_good_expiry,
          weekly_velocity: velocity(r.sku),
        }));
      setRows(out);
      setLastSnapshot(out.reduce((a, r) => (!a || r.snapshot_date > a ? r.snapshot_date : a), null));
      setLoading(false);
    })().catch((e) => { if (active) { setError(e.message); setLoading(false); } });
    return () => { active = false; };
  }, []);

  return { rows, lastSnapshot, loading, error };
}
