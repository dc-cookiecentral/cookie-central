import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';
import { padPo } from './useDemandFeeds';

// ─────────────────────────────────────────────────────────────────────────
// Extra data for the Walmart Compliance page (Nov 9 2026), on top of what
// useDemandFeeds already loads (sqep, otif by week, consignment, orders):
//   · OTIF by PO (retail_link_otif) — the planner only needs weekly totals;
//     this page lists every PO that missed.
//   · Walmart PO → Cortina sales order, invoice and payment
//     (purchase_orders + cortina_invoices), so each SQEP / OTIF issue names
//     the invoice it hit. Keyed by the Walmart PO padded to 10 digits.
// A missing or empty table returns an empty list; the page says so.
// ─────────────────────────────────────────────────────────────────────────
export function useComplianceData() {
  const [state, setState] = useState({ loading: true, otifPos: [], invoiceByPo: new Map() });

  useEffect(() => {
    let active = true;
    (async () => {
      const [otifR, poR, invR] = await Promise.all([
        fetchAll(() => supabase
          .from('retail_link_otif')
          .select('walmart_week, host_po, mabd, cases_ordered, cases_early, cases_on_time, cases_late, cases_unfilled')
          .order('walmart_week').order('host_po')),
        fetchAll(() => supabase
          .from('purchase_orders')
          .select('id, walmart_po_number, po_number, invoice_number, total_amount')
          .eq('retailer', 'Walmart')
          .order('id')),
        fetchAll(() => supabase
          .from('cortina_invoices')
          .select('po_id, invoice_number, invoice_date, invoice_amount, payment_document, payment_date')
          .order('id')),
      ]);
      if (!active) return;
      const rows = (r) => (r.error || !r.data ? [] : r.data);

      const invByPoId = new Map();
      for (const i of rows(invR)) {
        // Newest invoice wins if a PO carries more than one.
        const cur = invByPoId.get(i.po_id);
        if (!cur || (i.invoice_date || '') > (cur.invoice_date || '')) invByPoId.set(i.po_id, i);
      }
      const invoiceByPo = new Map();
      for (const p of rows(poR)) {
        if (!p.walmart_po_number) continue;
        const inv = invByPoId.get(p.id);
        invoiceByPo.set(padPo(p.walmart_po_number), {
          so: p.po_number,
          invoice: inv?.invoice_number ?? p.invoice_number ?? null,
          invoiceDate: inv?.invoice_date ?? null,
          amount: inv?.invoice_amount != null ? Number(inv.invoice_amount) : (p.total_amount != null ? Number(p.total_amount) : null),
          paidDate: inv?.payment_date ?? null,
          paymentDoc: inv?.payment_document ?? null,
        });
      }

      const otifPos = rows(otifR).map((r) => ({
        wk: r.walmart_week,
        po: r.host_po,
        mabd: r.mabd,
        ordered: Number(r.cases_ordered) || 0,
        early: Number(r.cases_early) || 0,
        onTime: Number(r.cases_on_time) || 0,
        late: Number(r.cases_late) || 0,
        unfilled: Number(r.cases_unfilled) || 0,
      }));

      setState({ loading: false, otifPos, invoiceByPo, errors: [otifR.error, poR.error, invR.error].filter(Boolean).map((e) => e.message) });
    })();
    return () => { active = false; };
  }, []);

  return state;
}
