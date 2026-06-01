import { toNumber } from '../utils/csvParser';

// ─────────────────────────────────────────────────────────────────────────
// Assemblers "Production" report parser — multi-sheet workbook covering the
// raw lot → FG batch lot → outbound shipment chain (BUILD_PLAN row 24,
// "Assemblers production report"). Reconciled against the real export
// (sample_production_report.xlsx, sheets: Production / Reject / Inventory /
// Shipment / Job <id> ×N).
//
// Why a custom parseFile: the per-Job sheets are vertical key-value with a
// nested subcomponent table — the shared parseXlsxFile flattens every sheet
// to header-keyed rows, which destroys that layout. We bypass the shared
// path and read sheets directly. The Inventory sheet inside this workbook is
// IGNORED here — the standalone Inventory report (handled by assemblers.js)
// is uploaded separately and is authoritative.
// ─────────────────────────────────────────────────────────────────────────

// --- date parsing ─ defensive over a wild mix of formats observed in the wild
// (sample contains all of these across different columns):
//   M/D/YY            5/27/26
//   M/D/YYYY          8/15/2026
//   MM-DD-YYYY        06-04-2026
//   MM/DD/YYYY        06/20/2026
//   DD/MM/YYYY HH:MM  27/05/2026 15:00   (Assemblers timestamps — confirmed
//                     by 6:45→15:00 shift pattern, so NOT M/D/Y)
//   MON-DD-YYYY       JUL-04-2026
//   MON/DD/YYYY       JUL/11/2026
// Falls through to Date.parse, then returns null if nothing works.
const MONTHS = {
  jan:0, feb:1, mar:2, apr:3, may:4, jun:5,
  jul:6, aug:7, sep:8, oct:9, nov:10, dec:11,
};

function parseDate(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // MON-DD-YYYY / MON/DD/YYYY (e.g. JUL-04-2026)
  let m = s.match(/^([A-Za-z]{3})[-\/](\d{1,2})[-\/](\d{2,4})$/);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo != null) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      const d = new Date(y, mo, Number(m[2]));
      if (!isNaN(d)) return d;
    }
  }

  // MM-DD-YYYY (hyphen-separated US format, also covers "06-04-2026")
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(y, Number(m[1]) - 1, Number(m[2]));
    if (!isNaN(d)) return d;
  }

  // DD/MM/YYYY HH:MM — Assemblers timestamp format (must precede plain M/D/Y
  // since "27/05/2026" would otherwise fail; this matches before the M/D/Y
  // branch below).
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (m) {
    // First number > 12 → unambiguously DD/MM/YYYY.
    const a = Number(m[1]), b = Number(m[2]);
    const [day, mon] = a > 12 ? [a, b] : [a, b]; // Assemblers convention: DD/MM
    const d = new Date(Number(m[3]), mon - 1, day, Number(m[4]), Number(m[5]));
    if (!isNaN(d)) return d;
  }

  // M/D/YY or M/D/YYYY (US slash format)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(y, Number(m[1]) - 1, Number(m[2]));
    if (!isNaN(d)) return d;
  }

  // Last resort
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function isoDate(d) {
  return d ? d.toISOString().slice(0, 10) : null;
}

function isoTs(d) {
  return d ? d.toISOString() : null;
}

// Read a sheet as an array of objects keyed by the first row's headers.
// Skips rows where the first column is empty (e.g. Production sheet subtotals
// have a `Unit of measure` value but a blank Pallet Number — we drop those
// based on a separate "must have item_code" check inside each parser).
function sheetAsObjects(XLSX, ws) {
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
}

function pickRow(row, candidates) {
  for (const key of candidates) {
    if (row[key] != null && String(row[key]).trim() !== '') return row[key];
  }
  return null;
}

// ── Sheet: Production (one row per pallet, multiple per job)
function parseProduction(rows) {
  const pallets = [];
  const runsByJob = new Map();
  rows.forEach((row) => {
    const itemCode = pickRow(row, ['Item code']);
    if (!itemCode) return; // skips subtotal rows
    const jobId = pickRow(row, ['Job']);
    if (!jobId) return;

    const produced = parseDate(pickRow(row, ['Produced date']));
    const expiry = parseDate(pickRow(row, ['Expiry date']));
    const startAt = parseDate(pickRow(row, ['Actual Job start date']));
    const endAt = parseDate(pickRow(row, ['Actual Job end date']));
    const units = toNumber(pickRow(row, ['Units produced'])) ?? 0;
    const uom = pickRow(row, ['Unit of measure']);

    pallets.push({
      job_id: String(jobId).trim(),
      produced_date: isoDate(produced),
      pallet_number: pickRow(row, ['Pallet Number']),
      fg_item_code: String(itemCode).trim(),
      fg_lot_code: pickRow(row, ['Lot code']),
      fg_expiry_date: isoDate(expiry),
      units_produced: units,
      unit_of_measure: uom,
    });

    if (!runsByJob.has(jobId)) {
      runsByJob.set(jobId, {
        job_id: String(jobId).trim(),
        produced_date: isoDate(produced),
        work_order: pickRow(row, ['Work Order code']),
        assemblers_po: pickRow(row, ['Purchase Order number']),
        fg_item_code: String(itemCode).trim(),
        fg_item_description: pickRow(row, ['Item description']),
        fg_lot_code: pickRow(row, ['Lot code']),
        fg_expiry_date: isoDate(expiry),
        quantity_produced: 0,
        quantity_unit: uom,
        job_start_at: isoTs(startAt),
        job_end_at: isoTs(endAt),
      });
    }
    runsByJob.get(jobId).quantity_produced += units;
  });
  return { pallets, runs: [...runsByJob.values()] };
}

// ── Sheet: Reject (per-event; sometimes references jobs absent from Production)
function parseRejects(rows) {
  return rows
    .filter((r) => pickRow(r, ['Item code']) && pickRow(r, ['Job ID']))
    .map((row) => ({
      job_id: String(pickRow(row, ['Job ID'])).trim(),
      work_order: pickRow(row, ['Work Order Code']),
      item_code: String(pickRow(row, ['Item code'])).trim(),
      item_description: pickRow(row, ['Item description']),
      base_quantity: toNumber(pickRow(row, ['Base quantity'])),
      rejected_at: isoTs(parseDate(pickRow(row, ['Rejected at']))),
      reject_reason: pickRow(row, ['Reject reason']),
      lot_code: pickRow(row, ['Lot code']),
      expiry_date: isoDate(parseDate(pickRow(row, ['Expiry date']))),
    }));
}

// ── Sheet: Shipment (pallet/lot outbound from facility)
function parseShipments(rows) {
  return rows
    .filter((r) => pickRow(r, ['Item code']) && pickRow(r, ['Shipment']))
    .map((row) => ({
      shipment_number: String(pickRow(row, ['Shipment'])).trim(),
      ship_order_id: pickRow(row, ['Ship Order ID']),
      ship_date: isoDate(parseDate(pickRow(row, ['Actual ship date']))),
      ship_to: pickRow(row, ['Ship to']),
      item_code: String(pickRow(row, ['Item code'])).trim(),
      item_description: pickRow(row, ['Item description']),
      lot_code: pickRow(row, ['Lot code']),
      expiry_date: isoDate(parseDate(pickRow(row, ['Expiry date']))),
      base_quantity: toNumber(pickRow(row, ['Base quantity'])),
      base_unit: pickRow(row, ['Base unit of measure']),
      case_quantity: toNumber(pickRow(row, ['Case quantity'])),
      case_unit: pickRow(row, ['Case unit of measure']),
    }));
}

// ── Sheet: Job <id> (vertical key-value header + subcomponent table)
// Header rows are key in col A, value(s) in col B+. A blank row separates the
// header from the subcomponent table whose own header is "Subcomponent / …".
function parseJobSheet(XLSX, ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });

  // Walk the vertical header.
  const header = {};
  let i = 0;
  for (; i < rows.length; i++) {
    const [k, v, v2] = rows[i] || [];
    if (k == null && v == null) break;            // blank row → end of header
    if (k === 'Subcomponent') break;              // table header reached
    if (k) header[String(k).trim()] = { v, v2 };
  }

  // Find the subcomponent table header row (might be the row we stopped on or
  // a later row if there was a blank gap).
  let tableHeaderIdx = -1;
  for (let j = i; j < rows.length; j++) {
    if (rows[j] && rows[j][0] === 'Subcomponent') {
      tableHeaderIdx = j;
      break;
    }
  }

  const subcomponents = [];
  if (tableHeaderIdx >= 0) {
    const cols = rows[tableHeaderIdx]; // ["Subcomponent","Description","Lot Code","Expiry Date","Quantity Consumed","Quantity Rejected","Quantity Used","Unit of measure","Reject Percentage"]
    const idx = (name) => cols.indexOf(name);
    const ci = {
      code:     idx('Subcomponent'),
      desc:     idx('Description'),
      lot:      idx('Lot Code'),
      exp:      idx('Expiry Date'),
      consumed: idx('Quantity Consumed'),
      rejected: idx('Quantity Rejected'),
      used:     idx('Quantity Used'),
      uom:      idx('Unit of measure'),
      pct:      idx('Reject Percentage'),
    };
    for (let j = tableHeaderIdx + 1; j < rows.length; j++) {
      const r = rows[j];
      if (!r || r[ci.code] == null) continue;
      subcomponents.push({
        subcomponent_code: String(r[ci.code]).trim(),
        subcomponent_description: r[ci.desc],
        raw_lot_code: r[ci.lot],
        raw_lot_expiry: isoDate(parseDate(r[ci.exp])),
        quantity_consumed: toNumber(r[ci.consumed]),
        quantity_rejected: toNumber(r[ci.rejected]),
        quantity_used: toNumber(r[ci.used]),
        unit_of_measure: r[ci.uom],
        // "56.87%" → 56.87
        reject_pct: toNumber(String(r[ci.pct] ?? '').replace('%', '')),
      });
    }
  }

  return {
    job_id: header['Job']?.v ? String(header['Job'].v).trim() : null,
    fg_item_code: header['Item']?.v != null ? String(header['Item'].v).trim() : null,
    fg_item_description: header['Item description']?.v,
    fg_lot_code: header['Lot codes']?.v,
    fg_expiry_date: isoDate(parseDate(header['Expiry dates']?.v)),
    work_order: header['Work Order']?.v,
    reference_1: header['Reference 1']?.v,
    reference_2: header['Reference 2']?.v,
    // Quantity produced has its UOM in the second value column.
    quantity_produced: toNumber(header['Quantity produced']?.v),
    quantity_unit: header['Quantity produced']?.v2,
    subcomponents,
  };
}

// ── Top-level: parse the workbook directly, bypassing csvParser flattening.
async function parseFileImpl(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });

  const errors = [];
  const productionRows = sheetAsObjects(XLSX, wb.Sheets['Production']);
  const rejectRows = sheetAsObjects(XLSX, wb.Sheets['Reject']);
  const shipmentRows = sheetAsObjects(XLSX, wb.Sheets['Shipment']);

  const { pallets, runs } = parseProduction(productionRows);
  const rejects = parseRejects(rejectRows);
  const shipments = parseShipments(shipmentRows);

  // Job sheets: any sheet name starting with "Job ".
  const jobSheets = wb.SheetNames.filter((n) => /^Job\s/i.test(n));
  const jobs = jobSheets.map((n) => parseJobSheet(XLSX, wb.Sheets[n])).filter((j) => j.job_id);

  // Merge per-Job header fields into runs (Job sheets are authoritative for
  // reference_1/2 + total quantity_produced; Production sheet rows give us
  // pallet-level detail and start/end timestamps).
  const runsByJob = new Map(runs.map((r) => [r.job_id, r]));
  for (const j of jobs) {
    let run = runsByJob.get(j.job_id);
    if (!run) {
      // Job sheet exists for a job with no pallet rows — synthesize a run.
      run = { job_id: j.job_id, produced_date: null, work_order: j.work_order };
      runsByJob.set(j.job_id, run);
      runs.push(run);
    }
    run.fg_item_code = run.fg_item_code || j.fg_item_code;
    run.fg_item_description = run.fg_item_description || j.fg_item_description;
    run.fg_lot_code = run.fg_lot_code || j.fg_lot_code;
    run.fg_expiry_date = run.fg_expiry_date || j.fg_expiry_date;
    run.work_order = run.work_order || j.work_order;
    run.reference_1 = j.reference_1;
    run.reference_2 = j.reference_2;
    // Prefer the Job sheet's totals when present (authoritative).
    if (j.quantity_produced != null) run.quantity_produced = j.quantity_produced;
    if (j.quantity_unit) run.quantity_unit = j.quantity_unit;
    run.assemblers_po = run.assemblers_po || j.reference_1; // ref_1 is the PO
  }

  // Stub runs for reject-only jobs (Reject sheet is forward-looking — it can
  // list a job whose FG output rows arrive in a later snapshot).
  for (const rj of rejects) {
    if (!runsByJob.has(rj.job_id)) {
      const stub = { job_id: rj.job_id, work_order: rj.work_order };
      runsByJob.set(rj.job_id, stub);
      runs.push(stub);
    }
  }

  // Subcomponents indexed by job for the importer.
  const subcomponentsByJob = new Map();
  for (const j of jobs) subcomponentsByJob.set(j.job_id, j.subcomponents);

  // Preview "records" = runs with derived counts. Summary surfaces the four
  // breakdowns so the upload preview tells the user what's in the box.
  const palletsByJob = pallets.reduce((acc, p) => {
    acc[p.job_id] = (acc[p.job_id] || 0) + 1;
    return acc;
  }, {});
  const rejectsByJob = rejects.reduce((acc, r) => {
    acc[r.job_id] = (acc[r.job_id] || 0) + 1;
    return acc;
  }, {});
  const records = runs.map((r) => ({
    ...r,
    pallet_count: palletsByJob[r.job_id] || 0,
    subcomponent_count: (subcomponentsByJob.get(r.job_id) || []).length,
    reject_count: rejectsByJob[r.job_id] || 0,
  }));

  const summary =
    `${runs.length} job(s), ${pallets.length} pallet(s), ` +
    `${jobs.reduce((n, j) => n + j.subcomponents.length, 0)} subcomponent line(s), ` +
    `${rejects.length} reject event(s), ${shipments.length} outbound row(s)`;

  return {
    records,
    errors,
    summary,
    // Stashed for importRecords (UploadPipeline passes records through, so we
    // hang the rest off the first record as a non-enumerable side channel).
    _bundle: { runs, pallets, rejects, shipments, subcomponentsByJob },
  };
}

// UploadPipeline gives importRecords the same `records` array it previewed.
// We need the full bundle, so importRecords pulls it off the first record's
// hidden _bundle reference set during parsing.
async function importRecords(records, { uploadId } = {}) {
  const { supabase } = await import('../lib/supabase');
  const bundle = records.__bundle;
  if (!bundle) throw new Error('Missing parse bundle — re-parse and retry.');
  const { runs, pallets, rejects, shipments, subcomponentsByJob } = bundle;

  // 1. Upsert runs (job_id UNIQUE) → keep id map for child rows.
  const runIdByJob = new Map();
  for (const r of runs) {
    const { data, error } = await supabase
      .from('production_runs')
      .upsert(
        { ...r, source_upload_id: uploadId, updated_at: new Date().toISOString() },
        { onConflict: 'job_id' }
      )
      .select('id, job_id')
      .single();
    if (error) throw error;
    runIdByJob.set(data.job_id, data.id);
  }

  // 2. Replace pallets / subcomponents / rejects for every touched run
  // (delete-then-insert keeps the report idempotent across re-uploads).
  const touchedRunIds = [...runIdByJob.values()];
  if (touchedRunIds.length) {
    await supabase.from('production_pallets').delete().in('run_id', touchedRunIds);
    await supabase.from('production_subcomponents').delete().in('run_id', touchedRunIds);
    await supabase.from('production_rejects').delete().in('run_id', touchedRunIds);
  }

  const palletRows = pallets
    .map((p) => ({
      run_id: runIdByJob.get(p.job_id),
      produced_date: p.produced_date,
      pallet_number: p.pallet_number,
      fg_item_code: p.fg_item_code,
      fg_lot_code: p.fg_lot_code,
      fg_expiry_date: p.fg_expiry_date,
      units_produced: p.units_produced,
      unit_of_measure: p.unit_of_measure,
      source_upload_id: uploadId,
    }))
    .filter((p) => p.run_id);
  if (palletRows.length) {
    const { error } = await supabase.from('production_pallets').insert(palletRows);
    if (error) throw error;
  }

  const subRows = [];
  for (const [jobId, subs] of subcomponentsByJob) {
    const runId = runIdByJob.get(jobId);
    if (!runId) continue;
    for (const s of subs) subRows.push({ ...s, run_id: runId, source_upload_id: uploadId });
  }
  if (subRows.length) {
    const { error } = await supabase.from('production_subcomponents').insert(subRows);
    if (error) throw error;
  }

  const rejectRows = rejects
    .map((r) => ({
      run_id: runIdByJob.get(r.job_id),
      work_order: r.work_order,
      item_code: r.item_code,
      item_description: r.item_description,
      base_quantity: r.base_quantity,
      rejected_at: r.rejected_at,
      reject_reason: r.reject_reason,
      lot_code: r.lot_code,
      expiry_date: r.expiry_date,
      source_upload_id: uploadId,
    }))
    .filter((r) => r.run_id);
  if (rejectRows.length) {
    const { error } = await supabase.from('production_rejects').insert(rejectRows);
    if (error) throw error;
  }

  // 3. Shipments — independent of runs; append tagged by upload (the user can
  // reconcile duplicates per (shipment_number, item_code, lot_code) in SQL).
  if (shipments.length) {
    const payload = shipments.map((s) => ({ ...s, source_upload_id: uploadId }));
    const { error } = await supabase.from('lot_shipments').insert(payload);
    if (error) throw error;
  }

  return {
    inserted:
      runs.length +
      palletRows.length +
      subRows.length +
      rejectRows.length +
      shipments.length,
  };
}

// UploadPipeline override: when present, the pipeline calls parser.parseFile
// instead of (parseFile → parser.parse). We need the workbook structure (the
// per-Job sheets are vertical), which the shared flat-row helper destroys.
async function parseFile(file) {
  const out = await parseFileImpl(file);
  // Attach the bundle to the records array so the importer can find it after
  // React state round-trips (UploadPipeline stores `parsed.records` and hands
  // it back to importRecords).
  Object.defineProperty(out.records, '__bundle', {
    value: out._bundle,
    enumerable: false,
  });
  delete out._bundle;
  return out;
}

export default {
  type: 'production',
  label: 'Assemblers Production',
  accept: '.xlsx,.xls',
  parseFile,                              // override: handles workbook directly
  importRecords,
  previewColumns: [
    { key: 'job_id', label: 'Job' },
    { key: 'produced_date', label: 'Produced' },
    { key: 'fg_item_code', label: 'FG Item' },
    { key: 'fg_lot_code', label: 'FG Lot' },
    { key: 'quantity_produced', label: 'Qty' },
    { key: 'quantity_unit', label: 'UoM' },
    { key: 'pallet_count', label: 'Pallets' },
    { key: 'subcomponent_count', label: 'Subs' },
    { key: 'reject_count', label: 'Rejects' },
  ],
};
