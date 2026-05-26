import { toNumber, pick } from '../utils/csvParser';

// ─────────────────────────────────────────────────────────────────────────
// QBO parser — FORMAT UNCONFIRMED (BUILD_PLAN 2.5, blocked on sample).
// Build plan: "invoices + payments, match by invoice number." A QBO export
// typically mixes Invoice and Payment transaction rows; we split by type,
// then link payments to invoices on invoice number.
//
// COLUMN-MAPPING SEAM: adjust alias arrays when David's real export lands.
// ─────────────────────────────────────────────────────────────────────────
const COLUMNS = {
  txnType: ['Type', 'Transaction Type'],
  invoiceNo: ['Num', 'No.', 'Invoice', 'Invoice No', 'Invoice Number', 'Ref No'],
  date: ['Date', 'Transaction Date'],
  amount: ['Amount', 'Total', 'Open Balance', 'Original Amount'],
  memo: ['Memo', 'Memo/Description', 'Description'],
};

function isPayment(typeRaw) {
  const t = (typeRaw || '').toLowerCase();
  return t.includes('payment') || t.includes('receipt') || t.includes('deposit');
}

function toIsoDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

function parse(rows) {
  const invoices = [];
  const payments = [];
  const errors = [];

  rows.forEach((row, i) => {
    const invoiceNo = pick(row, COLUMNS.invoiceNo);
    const amount = toNumber(pick(row, COLUMNS.amount));
    const date = toIsoDate(pick(row, COLUMNS.date));
    if (!invoiceNo) {
      errors.push({ row: i + 2, message: 'Missing invoice/ref number' });
      return;
    }
    const rec = {
      invoice_number: String(invoiceNo).trim(),
      date,
      amount,
      memo: pick(row, COLUMNS.memo),
    };
    if (isPayment(pick(row, COLUMNS.txnType))) payments.push(rec);
    else invoices.push(rec);
  });

  const records = [
    ...invoices.map((r) => ({ ...r, _kind: 'invoice' })),
    ...payments.map((r) => ({ ...r, _kind: 'payment' })),
  ];
  return {
    records,
    errors,
    summary: `${invoices.length} invoices, ${payments.length} payments`,
  };
}

async function importRecords(records) {
  const { supabase } = await import('../lib/supabase');
  const invoices = records.filter((r) => r._kind === 'invoice');
  const payments = records.filter((r) => r._kind === 'payment');

  // Upsert invoices keyed on invoice_number, then link payments to them.
  let invoiceInserted = 0;
  for (const inv of invoices) {
    const { error } = await supabase
      .from('invoices')
      .upsert(
        {
          invoice_number: inv.invoice_number,
          invoice_date: inv.date,
          total_amount: inv.amount,
        },
        { onConflict: 'invoice_number', ignoreDuplicates: false }
      );
    if (error) throw error;
    invoiceInserted += 1;
  }

  let paymentInserted = 0;
  for (const pay of payments) {
    const { data: inv } = await supabase
      .from('invoices')
      .select('id, po_id')
      .eq('invoice_number', pay.invoice_number)
      .maybeSingle();
    const { error } = await supabase.from('payments').insert({
      invoice_id: inv?.id ?? null,
      po_id: inv?.po_id ?? null,
      payment_date: pay.date,
      amount: pay.amount,
      notes: pay.memo,
    });
    if (error) throw error;
    paymentInserted += 1;
  }

  return { inserted: invoiceInserted + paymentInserted };
}

export default {
  type: 'qbo',
  label: 'QuickBooks (Invoices + Payments)',
  accept: '.csv',
  unconfirmed: true,
  previewColumns: [
    { key: '_kind', label: 'Kind' },
    { key: 'invoice_number', label: 'Invoice #' },
    { key: 'date', label: 'Date' },
    { key: 'amount', label: 'Amount' },
    { key: 'memo', label: 'Memo' },
  ],
  parse,
  importRecords,
};
