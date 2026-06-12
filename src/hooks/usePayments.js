import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Payments are driven by the Cortina Walmart Orders export (cortina_invoices),
// which gives us Stage 1 (Cortina → DC) directly. Stage 2 (Walmart → Cortina)
// isn't in this feed yet, so the UI shows it as "Not tracked".

// ── Cortina invoices (real data, replaces the demo invoices/payments) ───────
// The Cortina Walmart Orders export gives us Stage 1 (Cortina → DC) directly:
// one cortina_invoices row per SO, with invoice + payment fields. Stage 2
// (Walmart → Cortina) isn't in this feed, so it shows as "Not tracked".

const INVOICE_SELECT = `
  id, invoice_number, invoice_date, invoice_terms, invoice_amount,
  payment_document, payment_date,
  purchase_orders ( id, po_number, cortina_so_number, walmart_po_number, retailer,
    total_cases, total_amount, ship_status )
`;

// Flatten the joined PO onto the invoice for easy rendering.
function shapeInvoice(row) {
  const po = row.purchase_orders ?? {};
  return {
    ...row,
    po,
    po_number: po.po_number,
    retailer: po.retailer,
    paid: !!row.payment_date,
  };
}

// List of every Cortina invoice, unpaid first, then most recent.
export function useCortinaInvoices() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('cortina_invoices').select(INVOICE_SELECT);
    if (error) setError(error.message);
    else {
      const shaped = (data ?? []).map(shapeInvoice).sort((a, b) => {
        if (a.paid !== b.paid) return a.paid ? 1 : -1; // unpaid first
        return (b.invoice_date || '').localeCompare(a.invoice_date || ''); // newest first
      });
      setRows(shaped);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rows, loading, error, refresh };
}

// Invoices for one PO (by po_number / cortina_so_number) + the PO itself.
export function useCortinaInvoiceDetail(poNumber) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from('purchase_orders')
      .select(
        `id, po_number, cortina_so_number, walmart_po_number, retailer,
         ship_status, payment_status, payment_terms, total_cases, total_amount,
         paid_amount, revenue_per_case, order_date, ship_date_original, ship_date_actual,
         po_line_items ( id, sku, quantity_cases, walmart_unit_price, line_total, destination_dc ),
         cortina_invoices ( id, invoice_number, invoice_date, invoice_terms, invoice_amount, payment_document, payment_date )`
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
