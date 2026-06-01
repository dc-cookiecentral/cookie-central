import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// EOM Snapshot data (BUILD_PLAN 7.1). All metrics are computed for a single
// calendar month; the page can flip month back-and-forth. Sources:
//   POs / Cases / Revenue / Chargebacks → purchase_orders + payments
//   Shrink / Adjustments               → inventory_adjustments
//   Markdowns / Fill Rate              → weekly_reports.kpis (JSONB)
//   FG / Raw / Packaging snapshot       → current dot_inventory + raw_materials
//
// We compute against today's row counts in the inventory tables (not a
// historical snapshot) — Phase 2 will add proper monthly snapshots; for now
// the "inventory" tables on this view are best-effort current state.

const fmtMonth = (d) => d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const iso = (d) => d.toISOString().slice(0, 10);
const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const monthEnd = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);

export function getDefaultMonth() {
  // Default to the most-recently-completed month.
  const t = new Date();
  return addMonths(monthStart(t), -1);
}

export function useEomSnapshot(month) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    if (!month) return;
    setLoading(true);
    setError(null);
    const start = iso(monthStart(month));
    const end = iso(monthEnd(month));
    const prevMonth = addMonths(month, -1);
    const prevStart = iso(monthStart(prevMonth));
    const prevEnd = iso(monthEnd(prevMonth));

    // POs that shipped during the month (use ship_date_actual; fallback to
    // ship_date_original for in-flight POs would inflate cases, so we don't).
    const posQuery = supabase
      .from('purchase_orders')
      .select('id, total_cases, total_amount, ship_date_actual, order_date, retailer')
      .gte('ship_date_actual', start)
      .lte('ship_date_actual', end);
    const prevPosQuery = supabase
      .from('purchase_orders')
      .select('id, total_cases, total_amount')
      .gte('ship_date_actual', prevStart)
      .lte('ship_date_actual', prevEnd);

    // Adjustments during the month — drives Shrink/Disposed/Damaged buckets.
    const adjQuery = supabase
      .from('inventory_adjustments')
      .select('adjustment_type, quantity, notes, created_at, raw_materials ( name, unit )')
      .gte('created_at', start)
      .lte('created_at', end + 'T23:59:59');

    // Payment deductions during the month → Chargebacks figure.
    const payQuery = supabase
      .from('payments')
      .select('deductions, payment_date')
      .gte('payment_date', start)
      .lte('payment_date', end);

    // Weekly reports overlapping this month → most recent kpis snapshot.
    const wkQuery = supabase
      .from('weekly_reports')
      .select('week_number, report_date, kpis')
      .gte('report_date', start)
      .lte('report_date', end)
      .order('report_date', { ascending: false })
      .limit(1);

    // Current inventory state for the bottom sections (FG / Raw / Packaging).
    const dotQuery = supabase
      .from('dot_inventory')
      .select('sku, on_hand, snapshot_date')
      .order('snapshot_date', { ascending: false });
    const rawQuery = supabase
      .from('raw_materials')
      .select('code, name, quantity, unit, category')
      .order('quantity', { ascending: false });

    const [posR, prevR, adjR, payR, wkR, dotR, rawR] = await Promise.all([
      posQuery,
      prevPosQuery,
      adjQuery,
      payQuery,
      wkQuery,
      dotQuery,
      rawQuery,
    ]);

    if (posR.error || prevR.error || adjR.error || payR.error || wkR.error || dotR.error || rawR.error) {
      setError(
        posR.error?.message ||
          prevR.error?.message ||
          adjR.error?.message ||
          payR.error?.message ||
          wkR.error?.message ||
          dotR.error?.message ||
          rawR.error?.message
      );
      setLoading(false);
      return;
    }

    const pos = posR.data ?? [];
    const prev = prevR.data ?? [];
    const adjs = adjR.data ?? [];
    const pays = payR.data ?? [];
    const wk = wkR.data?.[0];
    const dot = dotR.data ?? [];
    const raws = rawR.data ?? [];

    const sum = (arr, key) =>
      arr.reduce((s, r) => s + (Number(r[key]) || 0), 0);

    // KPIs — current vs previous month for the four primary tiles.
    const kpis = {
      pos: { value: pos.length, prev: prev.length },
      cases: { value: sum(pos, 'total_cases'), prev: sum(prev, 'total_cases') },
      revenue: { value: sum(pos, 'total_amount'), prev: sum(prev, 'total_amount') },
      chargebacks: { value: sum(pays, 'deductions'), prev: 0 },
    };

    // Secondary: shrink (from adjustments), markdowns (from weekly), fill rate.
    const shrinkLbs = adjs
      .filter((a) => ['shrink', 'expired', 'damaged', 'disposed'].includes(a.adjustment_type))
      .reduce((s, a) => s + (Number(a.quantity) || 0), 0);
    const shrinkNote =
      adjs
        .filter((a) => ['shrink', 'expired'].includes(a.adjustment_type))
        .slice(0, 2)
        .map((a) => `${Math.round(Number(a.quantity) || 0)} ${a.raw_materials?.unit || ''} ${a.raw_materials?.name || ''}`)
        .filter(Boolean)
        .join('; ') || '--';
    // Markdowns YTD is sometimes carried as a KPI inside the latest weekly.
    const markdownsKpi = wk?.kpis?.find?.((k) => /markdown/i.test(k.label || ''));
    const fillRateKpi = wk?.kpis?.find?.((k) => /fill\s*rate|in\s*full/i.test(k.label || ''));

    // Bottom inventory tables — top-N by current quantity.
    const fg = dot.slice(0, 8);
    const rawTop = raws.filter((r) => r.category === 'raw_material').slice(0, 6);
    const packaging = raws.filter((r) => r.category === 'packaging').slice(0, 6);

    setData({
      monthLabel: fmtMonth(month),
      generatedAt: new Date(),
      kpis,
      secondary: {
        markdowns: markdownsKpi?.value ?? null,
        markdownsNote: markdownsKpi ? 'From weekly report' : 'No weekly data',
        shrinkLbs,
        shrinkNote,
        fillRate: fillRateKpi?.value ?? null,
        fillRateNote: fillRateKpi ? 'From weekly report' : 'No weekly data',
      },
      sections: [
        {
          title: 'Finished Goods',
          rows: fg.map((d) => [d.sku, Number(d.on_hand || 0).toLocaleString()]),
        },
        {
          title: 'Raw Materials (top by qty)',
          rows: rawTop.map((r) => [r.name, `${Number(r.quantity || 0).toLocaleString()} ${r.unit}`]),
        },
        {
          title: 'Packaging',
          rows: packaging.map((r) => [r.name, `${Number(r.quantity || 0).toLocaleString()} ${r.unit}`]),
        },
      ],
    });
    setLoading(false);
  }, [month]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refresh: fetch };
}

export { addMonths, monthStart };
