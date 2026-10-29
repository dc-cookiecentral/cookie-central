// Explicit .js extension so this parser also resolves under Deno (matching the
// other parsers reused by Edge Functions); Vite is unaffected.
import { walmartWeekOf } from './retailLinkSupplyPlan.js';

// ─────────────────────────────────────────────────────────────────────────
// DOT "Inventory Snapshot" — DOT's on-hand export, three tabs:
//   Inventory Summary   one row per lot: Product Status (RG / EX), Total,
//                       Warehouse, Loaded, Picked, Other     ← parsed
//   WH Summary          the same lots split by location (Mt. Sterling IL,
//                       Dyersburg), warehouse stock only     ← cross-check
//   Aggregated Orders   one row per in-transit order line, Loaded / Picked
//                                                            ← cross-check
// Writes `dot_on_hand`: ONE row per SKU per Walmart week. Feeds the Tracker's
// "DOT actual OH (feed)" row, which the forward DOT cascade opens from.
//
// ⚠️ NOT the Assemblers "Inventory Snapshot Report" (src/parsers/assemblers.js).
// Near-identical name, different company and different file: that one has an
// `Item code` column and describes Dirty Cookie's raw materials at Assemblers.
// It is also NOT `dot_inventory` / src/parsers/dot.js, a speculative parser
// written before any DOT on-hand file existed.
//
// ── What the numbers mean ────────────────────────────────────────────────
//   good_cases       Total Inventory on RG lots. INCLUDES committed stock.
//   committed_cases  Loaded + Picked on RG lots — already allocated to a PO.
//                    Available-to-ship = good − committed.
//   expired_cases    Total Inventory on EX lots. Not sellable; not in good.
// Row identity, on all 45 lots of the first file:
//   Total = Warehouse + Loaded + Picked + Other
//
// ── Validation ────────────────────────────────────────────────────────────
// The first file (received 2026-10-27) reproduces the BUILD_PLAN reading
// exactly: good WC 1,531 / PBG 743 / CCF 1,544 / BC 1,257, expired 1,086,
// committed 1,005. scripts/test-dot-inventory-snapshot.mjs asserts it.
//
// ── The as-of date ────────────────────────────────────────────────────────
// The sheets carry NO snapshot date. We use the workbook's CreatedDate (DOT
// generates the file at export time), read as a Central-time calendar date —
// DOT's warehouses are in Illinois and Tennessee. Fallback: the file's
// modified time. The summary shows the date so the uploader sees it before
// importing. The reading is stored as the CLOSING stock of the Walmart week
// that contains that date (Caroline, Oct 28 2026), which is how the engine's
// `dotActual` already works.
// ─────────────────────────────────────────────────────────────────────────

// Case GTIN → the short codes the planner uses. Matches master_cases.gtin14
// (migration 20261022150000). An unknown GTIN is REPORTED, never silently
// dropped — a missing map entry hid BC for two weeks (ADR-063).
const GTIN_TO_SKU = {
  '10194346527783': 'WC',
  '10194346527790': 'PBG',
  '10194346565594': 'CCF',
  '10194346715944': 'BC',
};
const SKUS = ['WC', 'PBG', 'CCF', 'BC'];
const EXPIRING_WINDOW_DAYS = 60;

const num = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const text = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

// The export writes US MM/DD/YYYY. Return a bare YYYY-MM-DD (see utils/dates.js
// for why a bare date must never go through `new Date(value)`).
function usDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}

// An instant → its calendar date in US Central time, as YYYY-MM-DD.
function centralDate(instant) {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (isNaN(d)) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

const dayDiff = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;

function colIndex(headerRow, ...names) {
  const cells = (headerRow || []).map((c) => String(c ?? '').trim().toLowerCase());
  for (const n of names) {
    const i = cells.indexOf(n.toLowerCase());
    if (i !== -1) return i;
  }
  return -1;
}

// Locate a sheet by name, falling back to whichever sheet has the header.
function findSheet(XLSX, wb, name, headerCell) {
  const read = (key) => XLSX.utils.sheet_to_json(wb.Sheets[key], { header: 1, defval: null });
  const byName = wb.SheetNames.find((n) => n.trim().toLowerCase() === name);
  const keys = byName ? [byName, ...wb.SheetNames.filter((n) => n !== byName)] : wb.SheetNames;
  for (const key of keys) {
    const rows = read(key);
    const hIdx = rows.findIndex((r) => (r || []).some((c) => String(c ?? '').trim().toLowerCase() === headerCell));
    if (hIdx !== -1) return { key, rows, hIdx };
  }
  return null;
}

const isExpired = (status) => /\(EX\)|^EX$|EXPIRED/i.test(status || '');
const isGood = (status) => /\(RG\)|^RG$|REGULAR GOOD/i.test(status || '');

async function parseFileImpl(file) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const errors = [];

  // 'Total Inventory' is the Summary's own column; all three tabs share
  // 'Product Status', and WH Summary says 'Total Warehouse Inventory'.
  const summarySheet = findSheet(XLSX, wb, 'inventory summary', 'total inventory');
  const gtinOk = summarySheet && colIndex(summarySheet.rows[summarySheet.hIdx], 'GTIN/UPC') !== -1;
  if (!summarySheet || !gtinOk) {
    const assemblers = wb.SheetNames.some((n) => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null });
      return rows.slice(0, 5).some((r) => (r || []).some((c) => String(c ?? '').trim().toLowerCase() === 'item code'));
    });
    return {
      records: [], summary: 'nothing parsed',
      errors: [{ row: 0, message: assemblers
        ? 'This is the Assemblers "Inventory Snapshot Report" (it has an "Item code" column), not DOT\'s. Upload it on the Assemblers card instead.'
        : 'No "Inventory Summary" sheet with GTIN/UPC and Product Status columns — is this DOT\'s Inventory Snapshot export?' }],
    };
  }

  // ── As-of date ──────────────────────────────────────────────────────────
  const created = wb.Props?.CreatedDate;
  let snapshotDate = created ? centralDate(created) : null;
  let dateSource = 'workbook created date';
  if (!snapshotDate && file.lastModified) {
    snapshotDate = centralDate(file.lastModified);
    dateSource = 'file modified date';
    errors.push({ row: 0, message: `⚠️ The workbook has no created date; using the file's modified date (${snapshotDate}). Check it is the day DOT exported the report.` });
  }
  if (!snapshotDate) {
    return { records: [], summary: 'nothing parsed',
      errors: [{ row: 0, message: 'Cannot tell what date this snapshot is from: the workbook has no created date and the file has no modified date.' }] };
  }
  const wmWeek = walmartWeekOf(snapshotDate);

  // ── Inventory Summary: one row per lot ──────────────────────────────────
  const { rows, hIdx } = summarySheet;
  const h = rows[hIdx];
  const c = {
    dotItem: colIndex(h, 'Dot Item Number'),
    gtin: colIndex(h, 'GTIN/UPC', 'Manufacturer Number'),
    desc: colIndex(h, 'Item Description'),
    uom: colIndex(h, 'UOM'),
    cpp: colIndex(h, 'Cases per Pallet'),
    lot: colIndex(h, 'Lot Code'),
    exp: colIndex(h, 'Expiration Date'),
    status: colIndex(h, 'Product Status'),
    total: colIndex(h, 'Total Inventory'),
    wh: colIndex(h, 'Warehouse Inventory'),
    loaded: colIndex(h, 'Loaded'),
    picked: colIndex(h, 'Picked'),
    other: colIndex(h, 'Other'),
  };
  const missing = ['total', 'loaded', 'picked'].filter((k) => c[k] === -1);
  if (missing.length) {
    return { records: [], summary: 'nothing parsed',
      errors: [{ row: hIdx + 1, message: `Inventory Summary is missing column(s): ${missing.join(', ')}. The export's layout may have changed.` }] };
  }

  const bySku = new Map();
  const unknown = new Map();
  let identityBreaks = 0, otherCases = 0, exCommitted = 0, oddStatus = 0, nonCase = 0, lots = 0;

  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const gtin = text(r[c.gtin]);
    if (!gtin) continue;                                   // blank / trailer row
    const status = text(r[c.status]);
    const total = num(r[c.total]) ?? 0;
    const wh = num(r[c.wh]) ?? 0;
    const loaded = num(r[c.loaded]) ?? 0;
    const picked = num(r[c.picked]) ?? 0;
    const other = num(r[c.other]) ?? 0;
    lots++;

    const sku = GTIN_TO_SKU[gtin.replace(/\D/g, '')];
    if (!sku) {
      const u = unknown.get(gtin) ?? { desc: text(r[c.desc]), cases: 0 };
      u.cases += total;
      unknown.set(gtin, u);
      continue;
    }
    if (c.wh !== -1 && Math.abs(total - (wh + loaded + picked + other)) > 0.5) identityBreaks++;
    if (other) otherCases += other;
    if (c.uom !== -1 && text(r[c.uom]) && text(r[c.uom]).toUpperCase() !== 'CA') nonCase++;

    const rec = bySku.get(sku) ?? {
      sku, gtin: gtin.replace(/\D/g, ''),
      dot_item_number: text(r[c.dotItem]),
      cases_per_pallet: num(r[c.cpp]),
      snapshot_date: snapshotDate, wm_week: wmWeek,
      good_cases: 0, committed_cases: 0, expired_cases: 0, expiring_60d_cases: 0,
      earliest_good_expiry: null, lot_count: 0,
      wh_loaded_picked: { wh: 0, loaded: 0, picked: 0 },   // cross-check only, not stored
    };
    rec.lot_count++;
    rec.wh_loaded_picked.wh += wh;
    rec.wh_loaded_picked.loaded += loaded;
    rec.wh_loaded_picked.picked += picked;

    if (isExpired(status)) {
      rec.expired_cases += total;
      if (loaded || picked) exCommitted += loaded + picked;
    } else {
      if (!isGood(status)) oddStatus++;                   // counted as good, flagged
      rec.good_cases += total;
      rec.committed_cases += loaded + picked;
      const exp = usDate(r[c.exp]);
      if (exp) {
        if (!rec.earliest_good_expiry || exp < rec.earliest_good_expiry) rec.earliest_good_expiry = exp;
        if (dayDiff(snapshotDate, exp) <= EXPIRING_WINDOW_DAYS) rec.expiring_60d_cases += total;
      }
    }
    bySku.set(sku, rec);
  }

  // ── Warnings: the import still runs, but someone should look ────────────
  for (const [gtin, u] of unknown) {
    errors.push({ row: 0, message: `Unknown GTIN ${gtin} (${u.desc ?? 'no description'}, ${u.cases.toLocaleString()} cases) is not one of the four Walmart SKUs — NOT imported. Add it to GTIN_TO_SKU in src/parsers/dotInventorySnapshot.js if it is ours.` });
  }
  const absent = SKUS.filter((s) => !bySku.has(s));
  if (absent.length) {
    errors.push({ row: 0, message: `⚠️ No lots for ${absent.join(', ')} in this file — nothing written for ${absent.length > 1 ? 'them' : 'it'}, so the Tracker keeps modelling ${absent.length > 1 ? 'those SKUs' : 'that SKU'} this week. If DOT really holds none, that is worth confirming.` });
  }
  if (identityBreaks) errors.push({ row: 0, message: `⚠️ ${identityBreaks} lot(s) break "Total = Warehouse + Loaded + Picked + Other". The export's columns may have changed — check before trusting the totals.` });
  if (otherCases) errors.push({ row: 0, message: `⚠️ ${otherCases.toLocaleString()} case(s) sit in the "Other" column, which has been zero until now. They are counted in good / expired stock; ask DOT what "Other" means.` });
  if (exCommitted) errors.push({ row: 0, message: `⚠️ ${exCommitted.toLocaleString()} expired case(s) are Loaded or Picked — expired stock allocated to an order. Not counted as committed.` });
  if (oddStatus) errors.push({ row: 0, message: `⚠️ ${oddStatus} lot(s) have a Product Status that is neither RG nor EX; counted as good stock.` });
  if (nonCase) errors.push({ row: 0, message: `⚠️ ${nonCase} lot(s) are not in cases (UOM ≠ CA); quantities summed as-is.` });

  // Cross-check: Aggregated Orders' Loaded/Picked lines vs the Summary's.
  const agg = findSheet(XLSX, wb, 'aggregated orders', 'order status description');
  if (agg) {
    const ah = agg.rows[agg.hIdx];
    const ag = colIndex(ah, 'GTIN/UPC', 'Manufacturer Number');
    const as = colIndex(ah, 'Order Status Description');
    const aq = colIndex(ah, 'Total In Transit Quantity');
    if (ag !== -1 && as !== -1 && aq !== -1) {
      const t = new Map();
      for (const r of agg.rows.slice(agg.hIdx + 1)) {
        const sku = GTIN_TO_SKU[String(r?.[ag] ?? '').replace(/\D/g, '')];
        if (!sku) continue;
        const k = `${sku}|${String(r[as] ?? '').trim().toLowerCase()}`;
        t.set(k, (t.get(k) ?? 0) + (num(r[aq]) ?? 0));
      }
      for (const rec of bySku.values()) {
        const L = t.get(`${rec.sku}|loaded`) ?? 0, P = t.get(`${rec.sku}|picked`) ?? 0;
        if (Math.abs(L - rec.wh_loaded_picked.loaded) > 0.5 || Math.abs(P - rec.wh_loaded_picked.picked) > 0.5) {
          errors.push({ row: 0, message: `⚠️ ${rec.sku}: Aggregated Orders shows ${L} loaded / ${P} picked; Inventory Summary shows ${rec.wh_loaded_picked.loaded} / ${rec.wh_loaded_picked.picked}.` });
        }
      }
    }
  }

  // Cross-check: WH Summary's per-location stock vs the Summary's Warehouse column.
  const whs = findSheet(XLSX, wb, 'wh summary', 'total warehouse inventory');
  if (whs) {
    const wh = whs.rows[whs.hIdx];
    const wg = colIndex(wh, 'GTIN/UPC', 'Manufacturer Number');
    const wq = colIndex(wh, 'Total Warehouse Inventory');
    if (wg !== -1 && wq !== -1) {
      const t = new Map();
      for (const r of whs.rows.slice(whs.hIdx + 1)) {
        const sku = GTIN_TO_SKU[String(r?.[wg] ?? '').replace(/\D/g, '')];
        if (sku) t.set(sku, (t.get(sku) ?? 0) + (num(r[wq]) ?? 0));
      }
      for (const rec of bySku.values()) {
        const w = t.get(rec.sku) ?? 0;
        if (Math.abs(w - rec.wh_loaded_picked.wh) > 0.5) {
          errors.push({ row: 0, message: `⚠️ ${rec.sku}: WH Summary totals ${w.toLocaleString()} cases in the warehouses; Inventory Summary's Warehouse column totals ${rec.wh_loaded_picked.wh.toLocaleString()}.` });
        }
      }
    }
  }

  const records = SKUS.filter((s) => bySku.has(s)).map((s) => {
    const { wh_loaded_picked, ...rec } = bySku.get(s);
    return rec;
  });
  const sum = (k) => records.reduce((a, r) => a + r[k], 0).toLocaleString();
  const d = new Date(`${snapshotDate}T12:00:00Z`);
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return {
    records,
    errors,
    summary:
      `${records.length} SKU(s) from ${lots} lots · as of ${label} (${dateSource}) → W${String(wmWeek).slice(4)} closing · ` +
      `${sum('good_cases')} good, ${sum('committed_cases')} committed, ${sum('expired_cases')} expired`,
  };
}

async function parseFile(file) {
  return parseFileImpl(file);
}

// One row per (sku, wm_week). An older file never overwrites a newer reading
// of the same week — the walmart_orders importer has exactly that bug (BUILD_PLAN
// Oct 23–26), so it is guarded here from the start.
//
// `client` lets a server-side caller reuse this importer; the browser passes
// none and falls back to the lazy anon client (RLS gates writes to
// ops/admin/finance — the authenticated uploader).
async function importRecords(records, { uploadId, client } = {}) {
  const supabase = client ?? (await import('../lib/supabase.js')).supabase;
  if (!records.length) return { inserted: 0 };

  const weeks = [...new Set(records.map((r) => r.wm_week))];
  const { data: existing, error: readErr } = await supabase
    .from('dot_on_hand')
    .select('sku, wm_week, snapshot_date')
    .in('wm_week', weeks);
  if (readErr) throw readErr;
  const newer = new Map((existing ?? []).map((e) => [`${e.sku}|${e.wm_week}`, e.snapshot_date]));
  const toWrite = records.filter((r) => {
    const have = newer.get(`${r.sku}|${r.wm_week}`);
    return !have || have <= r.snapshot_date;
  });
  const skipped = records.length - toWrite.length;
  if (!toWrite.length) {
    throw new Error(`Nothing imported: this week already holds a newer DOT snapshot for every SKU in the file (${skipped} skipped).`);
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('dot_on_hand')
    .upsert(toWrite.map((r) => ({ ...r, upload_id: uploadId ?? null, updated_at: now })),
            { onConflict: 'sku,wm_week' });
  if (error) throw error;
  return { inserted: toWrite.length, skipped };
}

export default {
  type: 'dot_inventory_snapshot',
  label: 'DOT Inventory Snapshot',
  accept: '.xlsx,.xls',
  parseFile,                              // override: handles the workbook directly
  importRecords,
  previewColumns: [
    { key: 'sku', label: 'SKU' },
    { key: 'wm_week', label: 'WM week' },
    { key: 'good_cases', label: 'Good (cs)' },
    { key: 'committed_cases', label: 'Committed' },
    { key: 'expired_cases', label: 'Expired' },
    { key: 'expiring_60d_cases', label: 'Exp ≤60d' },
    { key: 'earliest_good_expiry', label: 'Earliest exp' },
  ],
};
