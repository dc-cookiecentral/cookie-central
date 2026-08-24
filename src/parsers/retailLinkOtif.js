// Explicit .js extensions so this parser also resolves under Deno (matching the
// other parsers reused by the Gmail agent Edge Function); Vite is unaffected.
import { parseOtifDetail } from './weeklyAttachments.js';

// ─────────────────────────────────────────────────────────────────────────
// Retail Link OTIF export — "OTIF STORE Performance PO DETAILS WK ## to ##
// Total Company <timestamp>.xlsx". One sheet, "Receiver", one row per PO.
//
// Feeds the demand planner's DC service / cut-recovery panel: cases ordered vs
// unfilled per Walmart week, plus the PO count. This is the ONLY Retail Link
// export whose records each carry a real "Walmart Week" column, so unlike the
// weekly workbook it needs nothing inferred about which week it describes.
//
// The heavy lifting is parseOtifDetail in weeklyAttachments.js, which already
// separates the leading grand-total row (no PO number, no week) from the PO
// rows — that total is a summary of the file's range and is NOT stored.
//
// A custom parseFile because the shared row-flattener in utils/csvParser.js
// keys off the wrong row and concatenates sheets; see retailLink.js.
//
// ⚠️ These files overlap by design — a "WK 24 to 27" and a "WK 27 to 27" export
// arrive together, so the same PO is present in both. The unique key on
// (walmart_week, host_po) makes the second load an update rather than a
// duplicate.
// ─────────────────────────────────────────────────────────────────────────

const num = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// MABD arrives as an ISO-ish string in the exports seen so far, but SheetJS
// hands back a Date for a real date cell and Walmart's BI tool is not
// consistent between reports. Normalise to a bare YYYY-MM-DD — Postgres `date`
// columns are bare dates and `new Date(value)` on one is parsed as UTC, which
// lands a day early west of Greenwich (see utils/dates.js).
function toDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
  }
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${String(us[1]).padStart(2, '0')}-${String(us[2]).padStart(2, '0')}`;
  return null;
}

async function parseFileImpl(file) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });

  // "Receiver" by name, else the first sheet that parseOtifDetail recognises.
  const names = wb.SheetNames;
  const preferred = names.find((n) => n.trim().toLowerCase() === 'receiver') ?? names[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[preferred], { header: 1, defval: null });
  const parsed = parseOtifDetail(rows);
  if (!parsed) {
    return { records: [], errors: [{ row: 0, message: `No "Host PO Nbr" header found on sheet "${preferred}" — is this an OTIF PO DETAILS export?` }], summary: 'nothing parsed' };
  }

  const errors = [];
  const records = [];
  for (const p of parsed.pos) {
    const wk = num(p.week);
    if (!wk || !/^20\d{4}$/.test(String(wk))) {
      errors.push({ row: 0, message: `PO ${p.hostPo}: unusable Walmart Week "${p.week}" — row skipped` });
      continue;
    }
    records.push({
      walmart_week: wk,
      host_po: p.hostPo,
      oms_po: p.omsPo || null,
      mabd: toDate(p.mabd),
      delivery_window: p.window || null,
      cases_ordered: p.ordered,
      cases_early: p.early,
      cases_on_time: p.onTime,
      cases_late: p.late,
      cases_unfilled: p.unfilled,
      otif_pct: p.otif,
    });
  }

  // Same PO can appear twice WITHIN one file when a week range overlaps itself;
  // collapse here so the upsert never sees a duplicate key in a single batch
  // (Postgres rejects "ON CONFLICT DO UPDATE command cannot affect row a
  // second time"). Last occurrence wins, matching the cross-file rule.
  const byKey = new Map();
  for (const r of records) byKey.set(`${r.walmart_week}|${r.host_po}`, r);
  const deduped = [...byKey.values()].sort((a, b) => a.walmart_week - b.walmart_week || a.host_po.localeCompare(b.host_po));
  if (deduped.length !== records.length) {
    errors.push({ row: 0, message: `Collapsed ${records.length - deduped.length} duplicate (week, PO) row(s) within this file` });
  }

  const weeks = [...new Set(deduped.map((r) => r.walmart_week))].sort();
  const ordered = deduped.reduce((n, r) => n + (r.cases_ordered || 0), 0);
  const unfilled = deduped.reduce((n, r) => n + (r.cases_unfilled || 0), 0);
  return {
    records: deduped,
    errors,
    summary:
      `${deduped.length} PO(s) across week(s) ${weeks.join(', ')} · ` +
      `${ordered.toLocaleString()} cases ordered, ${unfilled.toLocaleString()} unfilled`,
  };
}

async function parseFile(file) {
  return parseFileImpl(file);
}

// `client` lets a server-side caller reuse this importer; the browser passes
// none and falls back to the lazy anon client (RLS gates writes to
// ops/admin/finance — the authenticated uploader).
async function importRecords(records, { uploadId, client } = {}) {
  const supabase = client ?? (await import('../lib/supabase.js')).supabase;
  if (!records.length) return { inserted: 0 };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('retail_link_otif')
    .upsert(records.map((r) => ({ ...r, upload_id: uploadId ?? null, updated_at: now })),
            { onConflict: 'walmart_week,host_po' });
  if (error) throw error;
  return { inserted: records.length };
}

export default {
  type: 'retail_link_otif',
  label: 'Retail Link OTIF (PO Details)',
  accept: '.xlsx,.xls',
  parseFile,                              // override: handles the workbook directly
  importRecords,
  previewColumns: [
    { key: 'walmart_week', label: 'Week' },
    { key: 'host_po', label: 'Host PO' },
    { key: 'mabd', label: 'MABD' },
    { key: 'cases_ordered', label: 'Ordered' },
    { key: 'cases_on_time', label: 'On Time' },
    { key: 'cases_late', label: 'Late' },
    { key: 'cases_unfilled', label: 'Unfilled' },
    { key: 'otif_pct', label: 'OTIF' },
  ],
};
