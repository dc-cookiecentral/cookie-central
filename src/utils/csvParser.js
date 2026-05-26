import Papa from 'papaparse';

// Parse a File/Blob into row objects keyed by header.
// Returns a Promise<{ rows, meta, parseErrors }>.
export function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
      complete: (res) =>
        resolve({ rows: res.data, meta: res.meta, parseErrors: res.errors }),
      error: (err) => reject(err),
    });
  });
}

// Parse an .xlsx/.xls File into header-keyed row objects. Reads EVERY sheet
// and concatenates rows (the Assemblers report splits items across two sheets
// with identical headers). Parsers skip rows missing their key column, so any
// stray sheet is harmless.
export async function parseXlsxFile(file) {
  // Lazy-loaded: keeps the ~330 KB SheetJS lib out of the initial bundle.
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  let rows = [];
  for (const name of wb.SheetNames) {
    const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null });
    rows = rows.concat(sheetRows);
  }
  // Trim header whitespace to match CSV behavior.
  rows = rows.map((r) => {
    const out = {};
    for (const k of Object.keys(r)) out[k.trim()] = r[k];
    return out;
  });
  return { rows, meta: { sheets: wb.SheetNames }, parseErrors: [] };
}

// Dispatch on file extension: .xlsx/.xls → SheetJS, else CSV via Papa.
export function parseFile(file) {
  const name = (file?.name || '').toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return parseXlsxFile(file);
  return parseCsvFile(file);
}

// Parse a CSV string (used in tests / paste flows).
export function parseCsvString(text) {
  const res = Papa.parse(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  return { rows: res.data, meta: res.meta, parseErrors: res.errors };
}

// --- shared field coercion helpers used by parsers ---

export function toNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[$,()]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

// Pick the first present, non-empty value among candidate header names.
// This is the column-mapping seam: parsers list known aliases, so an
// unconfirmed export format can be adjusted by adding aliases here.
export function pick(row, candidates) {
  for (const key of candidates) {
    if (row[key] != null && String(row[key]).trim() !== '') return row[key];
  }
  return null;
}
