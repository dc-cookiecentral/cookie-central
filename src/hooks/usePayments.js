import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { daysUntil } from '../utils/dates';

// Payments view = payment-centric re-pivot of purchase_orders. The PO row
// carries the headline status + paid_amount; invoices + payments carry the
// itemised history (two-stage: Cortina→DC, then Retailer→Cortina).
//
// Build plan 6.1 + 6.2 — David's primary surface.
//
// payment_status canonical values (per schema):
//   pending           — Cortina hasn't paid DC yet
//   paid_cortina      — stage 1 done (Cortina paid DC)
//   awaiting_retailer — stage 1 done, retailer payment overdue
//   paid_retailer     — stage 2 done (retailer paid Cortina; both legs settled)
// Prototype legacy: 'paid_national' = paid_cortina, 'awaiting_walmart' =
// awaiting_retailer, 'paid_dc' is overloaded — we treat it as paid_retailer.

const PAYMENT_FIELDS = `
  id, po_number, retailer, mabd, ship_status,
  ship_date_original, ship_date_actual, delivery_date, dot_receipt_date,
  payment_status, payment_terms, invoice_number,
  total_cases, total_amount, paid_amount, revenue_per_case, nova_changes
`;

// Stage helpers — keep one source of truth so list and detail agree.
const STAGE1_DONE = new Set(['paid_cortina', 'paid_national', 'paid_dc', 'paid_retailer', 'awaiting_retailer', 'awaiting_walmart']);
const STAGE2_DONE = new Set(['paid_dc', 'paid_retailer']);
const STAGE2_AWAITING = new Set(['awaiting_retailer', 'awaiting_walmart']);

export function stage1Done(status) { return STAGE1_DONE.has(status); }
export function stage2Done(status) { return STAGE2_DONE.has(status); }
export function stage2Awaiting(status) { return STAGE2_AWAITING.has(status); }

export function outstandingOf(po) {
  const total = Number(po.total_amount ?? 0);
  const paid = Number(po.paid_amount ?? 0);
  return Math.max(0, total - paid);
}

// Urgency: biggest outstanding among unpaid first; then by MABD soonest.
function urgencyRank(po) {
  if (stage2Done(po.payment_status)) return 2;
  if (stage1Done(po.payment_status)) return 1;
  return 0;
}
function sortByUrgency(a, b) {
  const r = urgencyRank(a) - urgencyRank(b);
  if (r !== 0) return r;
  const oa = outstandingOf(a);
  const ob = outstandingOf(b);
  if (oa !== ob) return ob - oa;
  const da = daysUntil(a.mabd);
  const db = daysUntil(b.mabd);
  if (da == null) return 1;
  if (db == null) return -1;
  return da - db;
}

export function usePayments() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`${PAYMENT_FIELDS}, po_line_items ( id, sku, quantity_cases, unit_cost, line_total )`);
    if (error) setError(error.message);
    else setRows((data ?? []).slice().sort(sortByUrgency));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rows, loading, error, refresh };
}

// One PO with its line items, invoices, and payments — for /payments/:poNumber.
export function usePaymentDetail(poNumber) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from('purchase_orders')
      .select(
        `${PAYMENT_FIELDS},
         po_line_items ( id, sku, quantity_cases, unit_cost, line_total ),
         invoices ( id, invoice_number, invoice_date, total_amount, status ),
         payments ( id, payment_type, payment_date, amount, deductions, notes, invoice_id, created_at )`
      )
      .eq('po_number', poNumber)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        else setData(data);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [poNumber]);

  return { data, loading, error };
}
