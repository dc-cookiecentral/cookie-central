// Cortina PO PDF parser — TEMPORARY manual upload until the NetSuite API lands.
//
// Cortina issues purchase orders as PDFs. This extracts the text (pdfjs-dist),
// regexes the header + line-item table into one purchase_orders row +
// po_line_items, then back-fills any parked systems@ email extractions for the
// same PO number (link_parked_po_emails) so the agent's data attaches on import.
//
// Why pdfjs-dist, not pdf-parse: pdf-parse is Node-only — it `require`s `fs` and
// reads a test PDF on import, which breaks Vite's browser build. pdfjs-dist is
// the browser-native PDF text extractor (Mozilla PDF.js), lazy-loaded like xlsx
// in production.js so it stays out of the initial bundle.

// "05-29-2026" (MM-DD-YYYY) or "6/2/2026" (M/D/YYYY) → ISO YYYY-MM-DD.
function isoDate(raw) {
  if (!raw) return null;
  const m = String(raw).trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return isNaN(d) ? null : `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

const num = (s) => {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// Parse extracted PDF text into one PO record (+ _lines). Pure + exported so the
// regex is unit-testable without a PDF. Operates on a whitespace-flattened copy
// so it's robust to how pdfjs lays out lines/spacing.
export function parsePoText(text) {
  const errors = [];
  const flat = String(text).replace(/\s+/g, ' ').trim();
  const grab = (re) => flat.match(re)?.[1]?.trim() ?? null;

  const po_number = grab(/PO Number:\s*([A-Za-z0-9-]+)/i);
  if (!po_number) errors.push({ row: 0, message: 'PO Number not found in PDF' });

  const order_date = isoDate(grab(/\bDate:\s*(\d{1,2}-\d{1,2}-\d{4})/i));

  // Ship-to block: "Dot Foods <Retailer>" — the line after Dot Foods is the retailer.
  const retailer = /Dot Foods\s+Kroger/i.test(flat) || /\bKroger\b/i.test(flat)
    ? 'Kroger'
    : 'Walmart';
  const destination_dc = /Dot Foods/i.test(flat) ? 'Dot Foods' : null;

  const incoterms = grab(/Incoterms\s+(.+?)\s+Payment Terms/i);

  // Payment-terms table: a header row then a values row. Anchor on the two
  // delivery dates so the multi-word fields (terms, shipping method) split cleanly.
  let payment_terms = null;
  let customer_order_number = null;
  let ship_date_original = null;
  let mabd = null;
  let carrier = null;
  const termsRow = grab(/Shipping Method\s+(.+?)\s+Item\s+Item Name/i);
  if (termsRow) {
    const t = termsRow.match(
      /^(.+?)\s+(\S+)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+)$/
    );
    if (t) {
      payment_terms = t[1].trim();
      customer_order_number = /^(na|n\/a)$/i.test(t[2].trim()) ? null : t[2].trim();
      ship_date_original = isoDate(t[3]);
      mabd = isoDate(t[4]);
      carrier = t[5].trim();
    } else {
      errors.push({ row: 0, message: `Could not split terms row: "${termsRow}"` });
    }
  }

  const total_amount = num(grab(/Total\s+\$([\d,]+\.\d{2})/i));

  // Line items: the slice between the table header ("Ext. Cost") and "Comment"/Total.
  // Item codes are 12+ char uppercase tokens; each amount row is "<qty> $<unit> $<ext>".
  const section = flat.match(/Ext\.?\s*Cost\s+(.+?)\s+(?:Comment|Total\s+\$)/i)?.[1] ?? '';
  const codes = section.match(/\b[A-Z][A-Z0-9]{11,}\b/g) ?? [];
  const vals = [...section.matchAll(/([\d,]+)\s+\$(\d+(?:\.\d+)?)\s+\$([\d,]+\.\d{2})/g)];
  const _lines = [];
  for (let i = 0; i < Math.min(codes.length, vals.length); i++) {
    _lines.push({
      sku: codes[i],
      quantity_cases: parseInt(String(vals[i][1]).replace(/,/g, ''), 10),
      unit_cost: num(vals[i][2]),
      line_total: num(vals[i][3]),
    });
  }
  if (codes.length !== vals.length) {
    errors.push({
      row: 0,
      message: `Line-item mismatch: ${codes.length} item code(s) vs ${vals.length} amount row(s)`,
    });
  }
  if (!_lines.length) errors.push({ row: 0, message: 'No line items parsed' });

  const total_cases = _lines.reduce((s, l) => s + (l.quantity_cases || 0), 0);

  const record = {
    po_number,
    retailer,
    order_date,
    ship_date_original,
    mabd,
    destination_dc,
    payment_terms,
    customer_order_number,
    carrier,
    incoterms,
    total_amount,
    total_cases,
    revenue_per_case: _lines[0]?.unit_cost ?? null, // unit cost per case (per spec)
    ship_status: 'pending',
    payment_status: 'pending',
    cortina_po: true,
    _lines,
  };
  return { records: [record], errors };
}

// Extract text from the PDF in the browser via pdfjs-dist. Reconstructs lines by
// y-position so reading order is preserved (parsePoText flattens it anyway).
async function extractText(file) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (
    await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ).default;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  let out = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    out += reconstructLines(content.items) + '\n';
  }
  return out;
}

function reconstructLines(items) {
  const lines = [];
  for (const it of items) {
    if (!it.str) continue;
    const y = Math.round(it.transform[5]);
    let line = lines.find((l) => Math.abs(l.y - y) <= 2);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push(it);
  }
  lines.sort((a, b) => b.y - a.y);
  return lines
    .map((l) =>
      l.items
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map((i) => i.str)
        .join(' ')
    )
    .join('\n');
}

async function parseFile(file) {
  const text = await extractText(file);
  const { records, errors } = parsePoText(text);
  const po = records[0];
  const summary = po?.po_number
    ? `${po.po_number} · ${po.retailer} · ${po._lines.length} line item(s) · ` +
      `${(po.total_cases ?? 0).toLocaleString()} cases · $${(po.total_amount ?? 0).toLocaleString()}`
    : 'Could not parse this PDF — check it is a Cortina PO.';
  return { records, errors, summary };
}

async function importRecords(records, { client } = {}) {
  const supabase = client ?? (await import('../lib/supabase.js')).supabase;
  let inserted = 0;
  let linked = 0;

  for (const po of records) {
    const { _lines, ...poFields } = po;
    const { data: saved, error: poErr } = await supabase
      .from('purchase_orders')
      .upsert({ ...poFields, updated_at: new Date().toISOString() }, { onConflict: 'po_number' })
      .select('id')
      .single();
    if (poErr) throw poErr;

    await supabase.from('po_line_items').delete().eq('po_id', saved.id);
    if (_lines.length) {
      const { error: lineErr } = await supabase
        .from('po_line_items')
        .insert(_lines.map((l) => ({ po_id: saved.id, ...l })));
      if (lineErr) throw lineErr;
    }

    // Auto-link parked systems@ extractions (po_emails + po_lot_numbers +
    // gmail_messages) for this PO number — migration 20260602170000.
    const { data: linkedCount, error: linkErr } = await supabase.rpc('link_parked_po_emails', {
      p_po_id: saved.id,
      p_po_number: po.po_number,
    });
    if (linkErr) console.warn(`link_parked_po_emails(${po.po_number}):`, linkErr.message);
    else linked += linkedCount ?? 0;

    inserted += 1;
  }
  return { inserted, linked };
}

export default {
  type: 'cortina_po',
  label: 'Cortina PO (PDF)',
  accept: '.pdf',
  parseFile, // custom: PDF, not the shared CSV/XLSX path
  importRecords,
  previewColumns: [
    { key: 'po_number', label: 'PO #' },
    { key: 'retailer', label: 'Retailer' },
    { key: 'order_date', label: 'Date' },
    { key: 'ship_date_original', label: 'Ship' },
    { key: 'mabd', label: 'Req. Delivery' },
    { key: 'total_cases', label: 'Cases' },
    { key: 'total_amount', label: 'Total' },
  ],
};
