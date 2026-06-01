import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { daysUntil } from '../utils/dates';

// Alerts engine (BUILD_PLAN 7.2). Computed from live state — does NOT live in
// a table. Categories:
//   mabd     — POs at risk of missing MABD (pending ship within N days)
//   stock    — DOT inventory weeks-of-supply below threshold
//   expiry   — raw-material lots expired or expiring
//   payment  — shipped POs unpaid past the payment-terms window
//   lead     — long-lead raw materials nearing reorder window
//
// Each alert: { id, severity: 'crit' | 'warn', message, category, href? }

const MABD_WARN_DAYS = 5;
const MABD_CRIT_DAYS = 2;
const STOCK_WARN_WEEKS = 4;
const STOCK_CRIT_WEEKS = 2;
const PAYMENT_OVERDUE_DAYS = { 'Net 30': 30, 'Net 30/60': 60, 'Net 60': 60, 'Due on receipt': 7 };
const LONG_LEAD_DAYS = 21;

export function useAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    async function run() {
      setLoading(true);
      const [posR, dotR, rawR, paysR] = await Promise.all([
        supabase
          .from('purchase_orders')
          .select(
            'id, po_number, retailer, mabd, ship_status, ship_date_original, payment_status, payment_terms, ship_date_actual, total_amount, paid_amount'
          ),
        supabase
          .from('dot_inventory')
          .select('sku, on_hand, allocated, weekly_velocity, snapshot_date')
          .order('snapshot_date', { ascending: false }),
        supabase
          .from('raw_materials')
          .select('id, code, name, quantity, unit, expiry_status, expired_quantity, default_lead_days, category')
          .in('category', ['raw_material', 'packaging']),
        supabase.from('payments').select('po_id, payment_date'),
      ]);
      if (!active) return;
      const firstErr = posR.error || dotR.error || rawR.error || paysR.error;
      if (firstErr) {
        setError(firstErr.message);
        setLoading(false);
        return;
      }

      const out = [];

      // 1. MABD risk — pending POs with ship date within MABD_WARN_DAYS.
      for (const po of posR.data || []) {
        if (po.ship_status !== 'pending') continue;
        const d = daysUntil(po.ship_date_original);
        if (d == null || d > MABD_WARN_DAYS) continue;
        const severity = d <= MABD_CRIT_DAYS ? 'crit' : 'warn';
        out.push({
          id: `mabd-${po.po_number}`,
          severity,
          category: 'mabd',
          message: `${po.po_number} (${po.retailer}) ships in ${d}d (MABD ${po.mabd || '?'}).`,
          href: `/orders/${po.po_number}`,
        });
      }

      // 2. Low DOT inventory — latest snapshot per SKU only.
      const seenSku = new Set();
      for (const d of dotR.data || []) {
        if (seenSku.has(d.sku)) continue;
        seenSku.add(d.sku);
        const avail = (d.on_hand ?? 0) - (d.allocated ?? 0);
        const vel = Number(d.weekly_velocity) || 0;
        if (!vel) continue;
        const weeks = avail / vel;
        if (weeks >= STOCK_WARN_WEEKS) continue;
        const severity = weeks < STOCK_CRIT_WEEKS ? 'crit' : 'warn';
        out.push({
          id: `stock-${d.sku}`,
          severity,
          category: 'stock',
          message: `${d.sku} at DOT: ${weeks.toFixed(1)}w of supply (${avail.toLocaleString()} avail).`,
          href: '/inventory',
        });
      }

      // 3. Expired / expiring raw materials.
      for (const m of rawR.data || []) {
        if (m.expiry_status === 'partial_expired') {
          out.push({
            id: `expiry-${m.code}`,
            severity: 'crit',
            category: 'expiry',
            message: `${m.name} has expired lots${m.expired_quantity ? ` (${Math.round(m.expired_quantity)} ${m.unit})` : ''}.`,
            href: `/reference?material=${encodeURIComponent(m.code)}`,
          });
        } else if (m.expiry_status === 'almost_expired') {
          out.push({
            id: `expiry-${m.code}`,
            severity: 'warn',
            category: 'expiry',
            message: `${m.name} has lots expiring soon.`,
            href: `/reference?material=${encodeURIComponent(m.code)}`,
          });
        }
      }

      // 4. Unpaid POs past terms — use ship_date_actual + payment_terms days.
      for (const po of posR.data || []) {
        if (po.ship_status === 'pending') continue;
        if (po.payment_status === 'paid_retailer' || po.payment_status === 'paid_dc') continue;
        if (!po.ship_date_actual) continue;
        const days = PAYMENT_OVERDUE_DAYS[po.payment_terms] ?? 60;
        const shipDays = -daysUntil(po.ship_date_actual); // days since ship
        if (shipDays == null || shipDays <= days) continue;
        const total = Number(po.total_amount ?? 0);
        const paid = Number(po.paid_amount ?? 0);
        if (total > 0 && paid >= total) continue;
        out.push({
          id: `payment-${po.po_number}`,
          severity: shipDays > days + 15 ? 'crit' : 'warn',
          category: 'payment',
          message: `${po.po_number} unpaid — day ${shipDays} (terms ${po.payment_terms || 'unknown'}).`,
          href: `/payments/${po.po_number}`,
        });
      }

      // 5. Long-lead raw materials low on stock — flags ingredients with
      //    lead ≥ LONG_LEAD_DAYS so Marc reorders sooner.
      for (const m of rawR.data || []) {
        if ((m.default_lead_days ?? 0) < LONG_LEAD_DAYS) continue;
        if ((Number(m.quantity) || 0) > 0 && m.expiry_status === 'good') continue;
        out.push({
          id: `lead-${m.code}`,
          severity: 'warn',
          category: 'lead',
          message: `${m.name} — ${m.default_lead_days}d lead, on-hand ${Math.round(m.quantity || 0)} ${m.unit}.`,
          href: `/reference?material=${encodeURIComponent(m.code)}`,
        });
      }

      // Dedupe by id; critical first.
      const byId = new Map();
      for (const a of out) byId.set(a.id, a);
      const sorted = [...byId.values()].sort((a, b) =>
        a.severity === b.severity ? 0 : a.severity === 'crit' ? -1 : 1
      );

      setAlerts(sorted);
      setLoading(false);
    }
    run();
    return () => {
      active = false;
    };
  }, []);

  return { alerts, loading, error };
}
