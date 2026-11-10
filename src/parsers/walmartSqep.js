// Explicit .js extension so this parser also resolves under Deno (matching the
// other parsers reused by Edge Functions); Vite is unaffected.
import { walmartWeekOf } from './retailLinkSupplyPlan.js';

// ─────────────────────────────────────────────────────────────────────────
// Walmart SQEP — "SQEP Total Compliance Table, MM-DD-YYYY HH_MM.csv", the
// line-item export from the SQEP compliance table (Caroline, Nov 9 2026; the
// Supplier One scorecard page itself has no export). One row per defect:
// PO, OMS PO, DC, network, defect category / type / sub-type, item and ticket
// (both "NA" for ASN defects), and the charge.
//
// The same table comes in two flavours with identical columns except the last:
//   · "Potential Charge ($)" → PROJECTED (not yet billed; still disputable)
//   · "Invoiced Charge ($)"  → INVOICED (on Walmart's monthly SQEP bill)
// The parser tells them apart by that header, so one card takes either.
// Writes `walmart_sqep_defects`, keyed per charge status, so a projected and
// an invoiced reading of the same defect are two rows that can be compared.
//
// ── Validation (Nov 9 2026) ──────────────────────────────────────────────
//   Projected, wk 202640: 62 rows, all ASN / NO ASN RECEIVED, $1,378.40
//     (GDC 32 / $800.00, RDC 30 / $578.40).
//   Invoiced, wk 202635 ("SEP FYE 27"): 55 rows, all ASN, GDC, $1,375.00.
//   Every PO matched DOT's Consignment Sales History / Customer Order Details.
//   Charges seen: $10.17 per case, capped at $25.00 per PO.
//   Invoiced "JUN FYE 27" (wk 202618–202622): 172 defects, every one
//   "Applicable for Score" = Y, "Applicable for Charge" = N, charge " - " —
//   counted against the score but not billed. Stored with charge 0.
//
// ⚠️ PO numbers: GDC POs are 9 digits here ("122308039"); DOT and OTIF store
// them zero-padded to 10 ("0122308039"). Stored as given — pad to 10 to join.
// ⚠️ Supplier is "127224 - NATIONAL FOOD TRADING CORP." (the vendor of record
// for these POs), not Dirty Cookie. Stored in supplier_6digit / _9digit.
// ─────────────────────────────────────────────────────────────────────────

// Minimal RFC-4180 CSV reader: quoted fields, doubled quotes, CRLF. The export
// ends every line with a trailing comma, which yields one empty extra cell.
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

const NA = (v) => {
  const t = String(v ?? '').trim();
  // Walmart writes "NA" for a field that does not apply. " - " (item number
  // on pallet defects, charge when not billed) is deliberately KEPT as "-":
  // item_number is part of the key and the first uploads stored "-", so
  // reading it as empty now would duplicate those rows on re-upload. The
  // charge column handles " - " itself (money() → null → 0 when not billed).
  return t === '' || t.toUpperCase() === 'NA' ? null : t;
};
const money = (v) => {
  const t = NA(v);
  if (t == null) return null;
  const n = parseFloat(t.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const yn = (v) => {
  const t = NA(v);
  return t == null ? null : t.toUpperCase().startsWith('Y');
};
const isoDate = (v) => {
  const t = NA(v);
  if (!t) return null;
  const iso = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const us = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return us ? `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}` : null;
};

// Header → record field. Matched case-insensitively.
const COLS = {
  'defect category': 'defect_category',
  'processed date': 'processed_date',
  'wmt week': 'walmart_week',
  'wmt month': 'wmt_month',
  'business area': 'business_area',
  '6digits': 'supplier_6digit',
  '9digits': 'supplier_9digit',
  'merch alignment': 'merch_alignment',
  sbu: 'sbu',
  department: 'department',
  category: 'category',
  'category desc': 'category_desc',
  'po nbr': 'po_number',
  'oms po nbr': 'oms_po_number',
  'item nbr': 'item_number',
  'item desc': 'item_desc',
  'vendor stock number': 'vendor_stock_number',
  'case gtin': 'case_gtin',
  'brand id': 'brand_id',
  'brand type': 'brand_type',
  'buyer id': 'buyer_id',
  network: 'network',
  'dc number': 'dc_number',
  'ticket no.': 'ticket_number',
  'defect type': 'defect_type',
  'defect sub type': 'defect_sub_type',
  'applicable for score': 'applicable_for_score',
  'applicable for charge': 'applicable_for_charge',
};
const REQUIRED = ['Defect Category', 'WMT Week', 'PO NBR', 'Defect Type'];
// Key fields are stored as '' rather than NULL (NULL never equals NULL, so a
// nullable column would break the unique key) — same rule as dc_nbr elsewhere.
const KEY_TEXT = ['defect_category', 'defect_type', 'defect_sub_type', 'item_number', 'ticket_number'];

// Pure: rows = 2D array of cells. Exported for the node test script.
export function parseRows(rows) {
  const hIdx = rows.findIndex((r) => (r || []).some((c) => String(c ?? '').trim().toLowerCase() === 'defect category'));
  if (hIdx === -1) {
    return { records: [], summary: 'nothing parsed', errors: [{ row: 0, message: 'No "Defect Category" column — is this the SQEP Total Compliance Table export?' }] };
  }
  const h = rows[hIdx].map((c) => String(c ?? '').trim().toLowerCase());
  const missing = REQUIRED.filter((n) => !h.includes(n.toLowerCase()));
  if (missing.length) return { records: [], summary: 'nothing parsed', errors: [{ row: hIdx + 1, message: `Missing column(s): ${missing.join(', ')}` }] };

  const potIdx = h.findIndex((c) => c.startsWith('potential charge'));
  const invIdx = h.findIndex((c) => c.startsWith('invoiced charge'));
  if (potIdx === -1 && invIdx === -1) {
    return { records: [], summary: 'nothing parsed', errors: [{ row: hIdx + 1, message: 'No "Potential Charge ($)" or "Invoiced Charge ($)" column — cannot tell projected from invoiced' }] };
  }
  if (potIdx !== -1 && invIdx !== -1) {
    return { records: [], summary: 'nothing parsed', errors: [{ row: hIdx + 1, message: 'Both "Potential Charge" and "Invoiced Charge" columns — upload projected and invoiced as separate files' }] };
  }
  const status = invIdx !== -1 ? 'invoiced' : 'projected';
  const chargeIdx = invIdx !== -1 ? invIdx : potIdx;
  const idx = Object.fromEntries(Object.entries(COLS).map(([hdr, f]) => [f, h.indexOf(hdr)]));

  const errors = [];
  const records = [];
  const seen = new Map();
  let weekMismatch = 0, noCharge = 0;
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const get = (f) => (idx[f] === -1 ? null : r[idx[f]]);
    const po = NA(get('po_number'));
    if (!po) { errors.push({ row: i + 1, message: 'No PO NBR — skipped' }); continue; }
    const rec = { charge_status: status };
    for (const f of Object.values(COLS)) rec[f] = NA(get(f));
    rec.processed_date = isoDate(get('processed_date'));
    rec.walmart_week = parseInt(rec.walmart_week, 10) || null;
    rec.applicable_for_score = yn(get('applicable_for_score'));
    rec.applicable_for_charge = yn(get('applicable_for_charge'));
    rec.charge = money(r[chargeIdx]);
    // Scored but not billed: Walmart marks "Applicable for Charge" = N and
    // writes " - " for the charge (the June 2026 invoice: 172 such defects).
    // That is a real $0, not a missing amount.
    if (rec.charge == null && rec.applicable_for_charge === false) rec.charge = 0;
    if (rec.charge == null) noCharge++;
    for (const f of KEY_TEXT) rec[f] = rec[f] ?? '';
    if (!rec.walmart_week) { errors.push({ row: i + 1, message: `PO ${po}: no WMT Week — skipped` }); continue; }
    if (rec.processed_date && walmartWeekOf(rec.processed_date) !== rec.walmart_week) weekMismatch++;
    // Two identical defects on one PO in one file are two defects: number them.
    const k = [rec.po_number, rec.defect_category, rec.defect_type, rec.defect_sub_type, rec.item_number, rec.ticket_number].join('|');
    rec.occurrence = (seen.get(k) ?? 0) + 1;
    seen.set(k, rec.occurrence);
    records.push(rec);
  }
  if (!records.length && rows.length === hIdx + 1) errors.push({ row: 0, message: `The file has only its header row — no ${status} defects in the range or filters you pulled` });
  if (weekMismatch) errors.push({ row: 0, message: `${weekMismatch} row(s) whose Processed Date is not in their WMT Week — stored with Walmart's week as given` });
  if (noCharge) errors.push({ row: 0, message: `${noCharge} row(s) with no charge amount — stored with charge empty` });
  const dupes = records.filter((x) => x.occurrence > 1).length;
  if (dupes) errors.push({ row: 0, message: `${dupes} row(s) repeat a defect already in this file (same PO, type, item, ticket) — kept as separate defects` });

  const total = records.reduce((a, x) => a + (x.charge ?? 0), 0);
  const notCharged = records.filter((x) => x.applicable_for_charge === false).length;
  const weeks = [...new Set(records.map((x) => x.walmart_week))].sort();
  const byCat = records.reduce((m, x) => ((m[x.defect_category ?? '—'] = (m[x.defect_category ?? '—'] || 0) + 1), m), {});
  return {
    records,
    errors,
    status,
    summary:
      `${status.toUpperCase()} · ${records.length} defect(s) · $${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ` +
      `wk ${weeks.length ? (weeks.length > 1 ? `${weeks[0]}–${weeks[weeks.length - 1]}` : weeks[0]) : '—'} · ` +
      Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(', ') +
      (notCharged ? ` · ${notCharged} scored but NOT charged (Applicable for Charge = N)` : ''),
  };
}

async function parseFile(file) {
  const name = (file.name || '').toLowerCase();
  if (/\.xlsx?$/.test(name)) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: false });
    return parseRows(rows);
  }
  return parseRows(parseCsv(await file.text()));
}

// Upsert per charge status × PO × defect. A re-pull of the same week (or an
// overlapping range) updates rather than duplicates; a projected defect that
// later shows up invoiced is a second row with charge_status = 'invoiced'.
// ⚠️ A projected defect Walmart later drops (e.g. after a dispute) is not
// deleted by a newer projected pull — read `last_seen_at` with it.
async function importRecords(records, { uploadId, client } = {}) {
  const supabase = client ?? (await import('../lib/supabase.js')).supabase;
  if (!records.length) return { inserted: 0 };
  const now = new Date().toISOString();
  const rows = records.map((r) => ({ ...r, upload_id: uploadId ?? null, last_seen_at: now }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from('walmart_sqep_defects')
      .upsert(rows.slice(i, i + 500), {
        onConflict: 'charge_status,po_number,defect_category,defect_type,defect_sub_type,item_number,ticket_number,occurrence',
      });
    if (error) throw error;
  }
  return { inserted: rows.length };
}

export default {
  type: 'walmart_sqep',
  label: 'Walmart SQEP Total Compliance Table',
  accept: '.csv,.xlsx,.xls',
  parseFile,                              // override: reads the CSV directly so PO numbers stay text
  importRecords,
  previewColumns: [
    { key: 'charge_status', label: 'Status' },
    { key: 'walmart_week', label: 'Wk' },
    { key: 'processed_date', label: 'Processed' },
    { key: 'defect_category', label: 'Category' },
    { key: 'defect_type', label: 'Defect' },
    { key: 'po_number', label: 'PO' },
    { key: 'network', label: 'Network' },
    { key: 'dc_number', label: 'DC' },
    { key: 'charge', label: 'Charge $' },
  ],
};
