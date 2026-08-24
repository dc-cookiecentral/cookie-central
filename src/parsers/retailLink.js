// Explicit .js extensions so this parser also resolves under Deno (matching the
// other parsers reused by the Gmail agent Edge Function); Vite is unaffected.
import { parseSalesSummary } from './weeklyAttachments.js';

// ─────────────────────────────────────────────────────────────────────────
// Retail Link weekly workbook — "Dirty Cookie WK##.xlsx".
//
// Feeds the Walmart Demand Planner. Writes two tables:
//   retail_link_pos_weekly  — POS by item by Walmart week
//   retail_link_forecast    — Walmart forecast, snapshot week × target week
//
// ── Why a custom parseFile ────────────────────────────────────────────────
// The shared `parseFile` in utils/csvParser.js flattens EVERY sheet to
// header-keyed objects and concatenates them. These exports put a title row
// above the header, so the flattener keys the data off the title and loses the
// sheet boundaries — measured on a real WK28 file, 0 of 12 resulting rows
// carried 'Prime Item Nbr', 'LW POS Qty' or 'Curr Str On Hand'. We read sheets
// directly, like production.js does.
//
// ── Which sheets matter ───────────────────────────────────────────────────
// The workbook has nine sheets. Three are load-bearing:
//
//   "All Item Detail" — the whole demand side. LONG format: one row per
//     (item × measure), with ~55 Walmart-week columns (202601…202655). One
//     upload backfills the entire year, so this is not a one-week-per-file
//     feed.
//   "Forecast" — one row per (item × walmart_calendar_week), a pure forward
//     view starting the week after the file's own week.
//   "Sales Summary" — used ONLY for current store/warehouse on-hand, which is
//     the one demand-side field with no weekly history anywhere in the export.
//
// The rest (Scorecard, Markdown, Item Data, Sales Data, Warehouse Inv, Last
// Week Data) are either duplicates of the above at a coarser grain or feed
// other pages; Scorecard is read purely to identify the file's week.
// ─────────────────────────────────────────────────────────────────────────

// The nine "Data Type" values in All Item Detail → our column names.
const MEASURES = {
  'POS Sales $':                        'pos_dollars',
  'POS Qty':                            'pos_units',
  'POS Qty if Instock':                 'pos_units_if_instock',
  'Units per Store per Week (w/zeros)': 'units_per_store_week',
  'Avg Price':                          'avg_price',
  'Traited Stores':                     'traited_stores',
  'Instock':                            'instock_pct',
  'Forecast':                           'wmt_forecast_units',
  'Variance':                           'variance',
};

const isWeek = (v) => /^20\d{4}$/.test(String(v ?? '').trim());
const isItemNbr = (v) => /^\d{6,}$/.test(String(v ?? '').trim());

function num(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Walmart weeks are YYYYWW and wrap at 52 — plain arithmetic would turn
// 202601 into 202600. Only ever used to step back one week.
function prevWeek(wk) {
  const y = Math.floor(wk / 100);
  const w = wk % 100;
  return w > 1 ? y * 100 + (w - 1) : (y - 1) * 100 + 52;
}

// Sheet names in these exports carry stray trailing spaces ("All Item Detail ").
function sheet(wb, name) {
  const key = wb.SheetNames.find((n) => n.trim().toLowerCase() === name.toLowerCase());
  return key ? wb.Sheets[key] : null;
}
const aoa = (XLSX, ws) => (ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) : []);

// Column index by trimmed header name, exact then case-insensitive prefix.
function colIndex(headerRow, ...names) {
  const cells = (headerRow || []).map((c) => String(c ?? '').trim());
  for (const n of names) {
    const i = cells.indexOf(n);
    if (i !== -1) return i;
  }
  for (const n of names) {
    const i = cells.findIndex((c) => c.toLowerCase().startsWith(n.toLowerCase()));
    if (i !== -1) return i;
  }
  return -1;
}

// ── The file's own week ──────────────────────────────────────────────────
// The Scorecard sheet's "Last Week" period carries it explicitly as a range,
// e.g. "(202628-202628/202528-202528)" → 202628. That is the authoritative
// answer; the Forecast sheet's earliest target minus one is the fallback.
// Deliberately NOT derived from the filename (renamed downloads are common)
// nor from the upload date (re-loading an old file must not claim to be new).
function detectFileWeek(scorecardRows, forecastRows) {
  for (const r of scorecardRows.slice(0, 4)) {
    for (const c of r || []) {
      const m = String(c ?? '').match(/\((20\d{4})-(20\d{4})/);
      if (m) return Number(m[2]);
    }
  }
  const targets = forecastRows.map((f) => f.target_week).filter(Boolean);
  return targets.length ? prevWeek(Math.min(...targets)) : null;
}

// ── "All Item Detail" → one record per (week, item) ──────────────────────
function parseAllItemDetail(rows, fileWeek) {
  const errors = [];
  // The header is the row that carries both 'Data Type' and week columns.
  const hIdx = rows.findIndex(
    (r) => (r || []).some((c) => String(c ?? '').trim() === 'Data Type') && (r || []).some(isWeek)
  );
  if (hIdx === -1) return { records: [], errors: [{ row: 0, message: 'All Item Detail: no header row with "Data Type" + week columns' }] };

  const hdr = rows[hIdx];
  const cItem = colIndex(hdr, 'Prime Item Nbr');
  const cDesc = colIndex(hdr, 'Prime Item Desc');
  const cType = colIndex(hdr, 'Data Type');
  const weekCols = hdr.map((c, i) => [Number(String(c).trim()), i]).filter(([w]) => isWeek(w));
  if (cItem === -1 || cType === -1) {
    return { records: [], errors: [{ row: hIdx + 1, message: 'All Item Detail: missing Prime Item Nbr / Data Type column' }] };
  }

  const byKey = new Map();
  const unknownTypes = new Set();
  // ⚠️ Walmart's description column in this sheet is WRONG on 8 of every 9 rows.
  // Only the first row per item (POS Sales $) carries the right label; the
  // other eight repeat a stale one from an unrelated product — item 679640563
  // reads 'SC TIRAMISU CUP' on 8 rows and 'DC WHITE CHOC CKE' on one,
  // 679640564 reads 'SC DBL CHOC PUDD' vs 'DC PB COOKIE'. So: first-seen per
  // ITEM wins here, and parseFileImpl then overrides from the Item Data sheet,
  // which is the actual item master. The item NUMBER is never in doubt and is
  // what everything keys on; the description is display only.
  const descByItem = new Map();
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !isItemNbr(r[cItem])) continue;
    const type = String(r[cType] ?? '').trim();
    const field = MEASURES[type];
    if (!field) {
      if (type) unknownTypes.add(type);
      continue;
    }
    const item = String(r[cItem]).trim();
    const desc = String(r[cDesc] ?? '').trim();
    if (desc && !descByItem.has(item)) descByItem.set(item, desc);
    for (const [wk, ci] of weekCols) {
      // ⚠️ Only weeks up to the file's own week are ACTUALS. Later columns are
      // present and read 0, but a future week has not happened — storing that
      // 0 would be a lie the engine cannot detect, because it treats null
      // (no data) and 0 (a real zero) as different values.
      //
      // "Forecast" is the exception and must NOT be bounded: it is inherently
      // forward-looking, and truncating it at the file week threw away the only
      // copy of Walmart's forecast that can be compared against the Forecast
      // sheet's. Walmart publishes the number twice and the two disagree, which
      // is a discrepancy the planner should surface rather than hide.
      const forwardOk = field === 'wmt_forecast_units';
      if (fileWeek && wk > fileWeek && !forwardOk) continue;
      const v = num(r[ci]);
      if (v == null) continue;
      const key = `${wk}|${item}`;
      if (!byKey.has(key)) {
        byKey.set(key, { walmart_week: wk, item_number: item, item_desc: desc, source_week: fileWeek });
      }
      byKey.get(key)[field] = v;
    }
  }
  if (unknownTypes.size) {
    errors.push({ row: hIdx + 1, message: `All Item Detail: unrecognised Data Type(s) ignored — ${[...unknownTypes].join(', ')}` });
  }

  // The sheet lists items that are not ours — WK28 carries 'SC LEMON RICOTTA'
  // (675595532) with every measure zero. Dropping them per-ROW would be wrong:
  // a real item's pre-launch weeks are legitimately zero and the engine needs
  // them. So filter per ITEM, keeping any item that ever sold or was ever
  // traited. A brand-new item traited with no sales yet still survives on
  // traited_stores.
  const live = new Set();
  for (const rec of byKey.values()) {
    if ((rec.pos_units > 0) || (rec.pos_dollars > 0) || (rec.traited_stores > 0)) live.add(rec.item_number);
  }
  // Future-week rows carry only a forecast, so they can never qualify an item on
  // their own — which is correct: an item with nothing but a forecast is not one
  // of ours. They survive because their ITEM qualified on an actual week.
  const dropped = new Set([...byKey.values()].map((r) => r.item_number)).size - live.size;
  if (dropped > 0) {
    errors.push({ row: hIdx + 1, message: `All Item Detail: ignored ${dropped} item(s) with no sales and no traited stores in any week` });
  }
  for (const rec of byKey.values()) rec.item_desc = descByItem.get(rec.item_number) ?? rec.item_desc;
  return { records: [...byKey.values()].filter((r) => live.has(r.item_number)).sort((a, b) => a.walmart_week - b.walmart_week || a.item_number.localeCompare(b.item_number)), errors };
}

// ── "Forecast" → snapshot × target rows ─────────────────────────────────
// The sheet also contains an embedded pivot table off to the right whose
// totals do NOT reconcile with the raw block (WK28: raw PBG 202629 = 2589.32,
// pivot = 5058.75). The raw block is the one with a documented grain — one row
// per (item, week), verified as exactly 3 × 24 = 72 rows with no duplicates —
// so only the raw block is read. Rows are keyed off the leftmost
// prime_item_number column, which the pivot does not have.
function parseForecastSheet(rows) {
  const hIdx = rows.findIndex((r) => (r || []).some((c) => String(c ?? '').trim() === 'walmart_calendar_week'));
  if (hIdx === -1) return { records: [], errors: [{ row: 0, message: 'Forecast: no walmart_calendar_week column' }] };
  const hdr = rows[hIdx];
  const cItem = colIndex(hdr, 'prime_item_number');
  const cDesc = colIndex(hdr, 'all_links_item_desc_1', 'all_links_item_description');
  const cVsi = colIndex(hdr, 'vendor_stock_id');
  const cWeek = colIndex(hdr, 'walmart_calendar_week');
  const cQty = colIndex(hdr, 'final_forecast_each_quantity');

  const out = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !isItemNbr(r[cItem])) continue;
    const target = num(r[cWeek]);
    if (!target || !isWeek(target)) continue;
    out.push({
      target_week: target,
      item_number: String(r[cItem]).trim(),
      item_desc: cDesc === -1 ? null : String(r[cDesc] ?? '').trim() || null,
      vendor_stock_id: cVsi === -1 ? null : String(r[cVsi] ?? '').trim() || null,
      forecast_units: num(r[cQty]),
    });
  }
  return { records: out, errors: [] };
}

async function parseFileImpl(file) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });

  const forecastParsed = parseForecastSheet(aoa(XLSX, sheet(wb, 'Forecast')));
  const fileWeek = detectFileWeek(aoa(XLSX, sheet(wb, 'Scorecard')), forecastParsed.records);

  const errors = [...forecastParsed.errors];
  if (!fileWeek) errors.push({ row: 0, message: 'Could not determine the file\'s Walmart week from Scorecard or Forecast — POS actuals cannot be bounded, aborting' });

  const detail = parseAllItemDetail(aoa(XLSX, sheet(wb, 'All Item Detail')), fileWeek);
  errors.push(...detail.errors);
  const pos = detail.records;

  // Authoritative descriptions from the Item Data sheet — the real item master.
  // All Item Detail's labels are unreliable (see the note in parseAllItemDetail).
  const itemDataRows = aoa(XLSX, sheet(wb, 'Item Data'));
  const idH = itemDataRows.findIndex((r) => (r || []).some((c) => String(c ?? '').trim() === 'prime_item_number'));
  if (idH !== -1) {
    const cNum = colIndex(itemDataRows[idH], 'prime_item_number');
    const cDsc = colIndex(itemDataRows[idH], 'all_links_item_description');
    if (cNum !== -1 && cDsc !== -1) {
      const master = new Map();
      for (let i = idH + 1; i < itemDataRows.length; i++) {
        const r = itemDataRows[i];
        if (!r || !isItemNbr(r[cNum])) continue;
        const d = String(r[cDsc] ?? '').trim();
        if (d) master.set(String(r[cNum]).trim(), d);
      }
      for (const rec of pos) {
        const m = master.get(rec.item_number);
        if (m) rec.item_desc = m;
      }
    }
  }

  // Current-week store / warehouse on-hand. The ONLY place any on-hand figure
  // appears; there is no weekly on-hand history in the export, so this lands on
  // the file's own week and stays NULL for every backfilled week.
  const summary = parseSalesSummary(aoa(XLSX, sheet(wb, 'Sales Summary')));
  if (summary && fileWeek) {
    const byItem = new Map(pos.filter((p) => p.walmart_week === fileWeek).map((p) => [p.item_number, p]));
    for (const it of summary.items) {
      const row = byItem.get(it.item);
      if (row) {
        row.store_on_hand = it.strOnHand;
        row.whse_on_hand = it.whOnHand;
      }
    }
  }

  const forecast = forecastParsed.records.map((f) => ({ ...f, snapshot_week: fileWeek }));
  // The CHECK on retail_link_forecast rejects a non-forward row; drop them here
  // with a visible error rather than failing the whole import at the database.
  const forward = forecast.filter((f) => f.target_week > fileWeek);
  if (forward.length !== forecast.length) {
    errors.push({ row: 0, message: `Forecast: dropped ${forecast.length - forward.length} row(s) at or before the file's week (${fileWeek})` });
  }

  const weeks = pos.map((p) => p.walmart_week);
  const out = {
    records: pos,
    errors,
    summary:
      `week ${fileWeek ?? '?'} · ${pos.length} POS rows ` +
      `(${weeks.length ? Math.min(...weeks) + '–' + Math.max(...weeks) : 'none'}, ` +
      `${new Set(pos.map((p) => p.item_number)).size} items) · ` +
      `${forward.length} forecast rows`,
    _bundle: { pos, forecast: forward, fileWeek },
  };
  return out;
}

// UploadPipeline hands importRecords the same `records` array it previewed, so
// the forecast rows ride along on a non-enumerable property (production.js
// pattern) rather than being flattened into the preview.
async function parseFile(file) {
  const out = await parseFileImpl(file);
  Object.defineProperty(out.records, '__bundle', { value: out._bundle, enumerable: false });
  delete out._bundle;
  return out;
}

// `client` lets a server-side caller reuse this importer; the browser passes
// none and falls back to the lazy anon client (RLS gates writes to
// ops/admin/finance — the authenticated uploader).
async function importRecords(records, { uploadId, client } = {}) {
  const supabase = client ?? (await import('../lib/supabase.js')).supabase;
  const bundle = records.__bundle;
  if (!bundle) throw new Error('Missing parse bundle — re-parse and retry.');
  const { pos, forecast } = bundle;
  const now = new Date().toISOString();

  // Upsert, never insert: Walmart restates POS, sometimes heavily (week 202622
  // moved 1322 → 2343 for PBG between the Aug 13 snapshot and the WK28 file).
  // The later file wins.
  if (pos.length) {
    const { error } = await supabase
      .from('retail_link_pos_weekly')
      .upsert(pos.map((p) => ({ ...p, upload_id: uploadId ?? null, updated_at: now })),
              { onConflict: 'walmart_week,item_number' });
    if (error) throw error;
  }
  if (forecast.length) {
    const { error } = await supabase
      .from('retail_link_forecast')
      .upsert(forecast.map((f) => ({ ...f, upload_id: uploadId ?? null, updated_at: now })),
              { onConflict: 'snapshot_week,target_week,item_number' });
    if (error) throw error;
  }
  return { pos: pos.length, forecast: forecast.length };
}

export default {
  type: 'retail_link',
  label: 'Retail Link Weekly (Dirty Cookie WK##)',
  accept: '.xlsx,.xls',
  parseFile,                              // override: handles the workbook directly
  importRecords,
  previewColumns: [
    { key: 'walmart_week', label: 'Week' },
    { key: 'item_number', label: 'Item' },
    { key: 'item_desc', label: 'Description' },
    { key: 'pos_units', label: 'POS Qty' },
    { key: 'pos_dollars', label: 'POS $' },
    { key: 'instock_pct', label: 'Instock' },
    { key: 'traited_stores', label: 'Traited' },
    { key: 'store_on_hand', label: 'Str OH' },
  ],
};

// Exported for the inspection harness + tests.
export { parseAllItemDetail, parseForecastSheet, detectFileWeek, prevWeek };
