// Parsers for the three .xlsx attachments on the Bentonville weekly email
// (see parsers/weeklyEmail.js for the email body + [[project-weekly-email-format]]):
//   1. "Dirty Cookie WK##.xlsx"          → sales report  (parseSalesSummary, parseMarkdown)
//   2. "Dirty Cookie Supply Plan- WK##"  → forward order plan (parseSupplyPlan)
//   3. "OTIF ... PO DETAILS ...xlsx"      → per-PO OTIF detail (parseOtifDetail)
//
// Each function is pure: it takes `rows` = a single sheet as a 2D array
// (SheetJS `sheet_to_json(ws, { header: 1 })`). The caller — the dev test now,
// the Gmail/Edge-Function connect later — does the XLSX.read + sheet extraction.
// Reports come from a BI tool with stable, verbose headers, so columns are
// matched by name (exact then prefix), tolerant of leading/trailing spaces.

const num = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// trimmed-header -> column index
function headerMap(row) {
  const m = {};
  (row || []).forEach((h, i) => {
    const k = String(h).trim();
    if (k && !(k in m)) m[k] = i;
  });
  return m;
}

// resolve a column: exact trimmed match first, then case-insensitive prefix
function col(map, ...names) {
  for (const n of names) if (n in map) return map[n];
  const keys = Object.keys(map);
  for (const n of names) {
    const k = keys.find((key) => key.toLowerCase().startsWith(n.toLowerCase()));
    if (k) return map[k];
  }
  return -1;
}

const isItemNbr = (v) => /^\d{6,}$/.test(String(v).trim());

// ---- 1a. Sales Summary (sheet "Sales Summary") -----------------------------
export function parseSalesSummary(rows) {
  const hIdx = rows.findIndex((r) => r.some((c) => String(c).trim() === 'Prime Item Nbr'));
  if (hIdx === -1) return null;
  const m = headerMap(rows[hIdx]);
  const c = {
    item: col(m, 'Prime Item Nbr'),
    desc: col(m, 'Prime Item Desc'),
    instock: col(m, 'Curr Repl Instock %', 'Curr Repl Instock'),
    posQtyLW: col(m, 'LW POS Qty'),
    posSalesLW: col(m, 'LW POS Sales'),
    ytdQty: col(m, 'YTD POS Qty'),
    ytdSales: col(m, 'YTD POS Sales'),
    usw: col(m, 'LW U/S/W'),
    dsw: col(m, 'LW $/S/W'),
    unitCost: col(m, 'Unit Cost'),
    unitRetail: col(m, 'Unit Retail'),
    whOnHand: col(m, 'Curr Whse On Hand'),
    strOnHand: col(m, 'Curr Str On Hand'),
    frcstWos: col(m, 'Frcst WOS'),
  };
  const read = (row) => ({
    item: String(row[c.item]).trim(),
    desc: String(row[c.desc] ?? '').trim(),
    instock: num(row[c.instock]),
    posQtyLW: num(row[c.posQtyLW]),
    posSalesLW: num(row[c.posSalesLW]),
    ytdQty: num(row[c.ytdQty]),
    ytdSales: num(row[c.ytdSales]),
    usw: num(row[c.usw]),
    dsw: num(row[c.dsw]),
    unitCost: num(row[c.unitCost]),
    unitRetail: num(row[c.unitRetail]),
    whOnHand: num(row[c.whOnHand]),
    strOnHand: num(row[c.strOnHand]),
    frcstWos: num(row[c.frcstWos]),
  });

  const items = [];
  let totals = null;
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (/grand total/i.test(String(r[c.item]) + String(r[c.desc]))) totals = read(r);
    else if (isItemNbr(r[c.item])) items.push(read(r));
  }
  return { items, totals };
}

// ---- 1b. Markdowns (sheet "Markdown") --------------------------------------
export function parseMarkdown(rows) {
  const hIdx = rows.findIndex((r) => r.some((c) => /prime_item_number/i.test(String(c))));
  if (hIdx === -1) return null;
  const m = headerMap(rows[hIdx]);
  const c = {
    item: col(m, 'prime_item_number'),
    desc: col(m, 'consumer_item_description', 'consumer_item_descri'),
    lw: col(m, 'LW_mumd_amount_this_year', 'LW_mumd_amount_this'),
    ytd: col(m, 'YTD_mumd_amount_this_year', 'YTD_mumd_amount_this'),
  };
  const items = [];
  let lwTotal = 0;
  let ytdTotal = 0;
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!isItemNbr(r[c.item])) continue;
    const lw = num(r[c.lw]) ?? 0;
    const ytd = num(r[c.ytd]) ?? 0;
    items.push({ item: String(r[c.item]).trim(), desc: String(r[c.desc] ?? '').trim(), lw, ytd });
    lwTotal += lw;
    ytdTotal += ytd;
  }
  return { items, lwTotal, ytdTotal };
}

// ---- 2. Supply Plan (sheet "Supply Plan") ----------------------------------
export function parseSupplyPlan(rows) {
  const monthsRowIdx = rows.findIndex((r) => r.includes('Grand Total') && r.some((c) => /^[A-Z][a-z]{2}$/.test(String(c))));
  if (monthsRowIdx === -1) return null;
  const mRow = rows[monthsRowIdx].map((c) => String(c).trim());
  const totalCol = mRow.indexOf('Grand Total');
  const firstMonthCol = mRow.findIndex((c) => /^[A-Z][a-z]{2}$/.test(c));
  const months = mRow.slice(firstMonthCol, totalCol).filter(Boolean);

  const items = [];
  let grandTotal = null;
  for (let i = monthsRowIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const byMonth = months.map((_, k) => num(r[firstMonthCol + k]));
    const total = num(r[totalCol]);
    if (isItemNbr(r[0])) {
      items.push({ item: String(r[0]).trim(), desc: String(r[1] ?? '').trim(), byMonth, total });
    } else if (/grand total/i.test(String(r[0]))) {
      grandTotal = { byMonth, total };
    }
  }
  return { months, items, grandTotal };
}

// ---- 3. OTIF PO detail (sheet "Receiver") ----------------------------------
export function parseOtifDetail(rows) {
  const hIdx = rows.findIndex((r) => r.some((c) => String(c).trim() === 'Host PO Nbr'));
  if (hIdx === -1) return null;
  const m = headerMap(rows[hIdx]);
  const c = {
    week: col(m, 'Walmart Week'),
    window: col(m, 'Delivery Window'),
    supplier: col(m, 'Supplier Name'),
    hostPo: col(m, 'Host PO Nbr'),
    omsPo: col(m, 'OMS PO Nbr'),
    mabd: col(m, 'MABD'),
    ordered: col(m, 'Cases Ordered'),
    early: col(m, 'Cases Early'),
    onTime: col(m, 'Cases On Time'),
    late: col(m, 'Cases Late'),
    unfilled: col(m, 'Cases Unfilled'),
    otif: col(m, 'OTIF %'),
  };
  const pos = [];
  let totals = null;
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const ordered = num(r[c.ordered]);
    if (ordered == null) continue;
    const rec = {
      week: String(r[c.week] ?? '').trim(),
      window: String(r[c.window] ?? '').trim(),
      mabd: String(r[c.mabd] ?? '').trim(),
      hostPo: String(r[c.hostPo] ?? '').trim(),
      omsPo: String(r[c.omsPo] ?? '').trim(),
      ordered,
      early: num(r[c.early]) ?? 0,
      onTime: num(r[c.onTime]) ?? 0,
      late: num(r[c.late]) ?? 0,
      unfilled: num(r[c.unfilled]) ?? 0,
      otif: num(r[c.otif]),
    };
    if (!rec.hostPo && !rec.week) totals = rec; // the leading summary row has no PO/week
    else if (rec.hostPo) pos.push(rec);
  }
  const latePos = pos.filter((p) => p.late > 0).sort((a, b) => b.late - a.late);
  return { totals, pos, latePos };
}
