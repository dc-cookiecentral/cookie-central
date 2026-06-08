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
// regex is unit-testable without a PDF.
//
// Resilience (the format varies PO-to-PO): header fields are pulled with
// tolerant regexes off a whitespace-flattened copy; line items are scanned
// PER LINE (any line ending in "<qty> $<unit> $<ext>" is an item, SKU = its
// first token) so it handles N items and varying decimal precision. Every field
// is extracted inside a guard that logs WHICH field failed instead of aborting
// the whole parse, so one odd field never crashes the upload.
export function parsePoText(text) {
  const errors = [];
  const raw = String(text ?? '');
  const flat = raw.replace(/\s+/g, ' ').trim();
  const rawLines = raw.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

  // Run one field's extractor; on an unexpected throw, record which field broke
  // (and the message) and keep going with null.
  const field = (name, fn) => {
    try {
      return fn();
    } catch (e) {
      errors.push({ row: 0, message: `Field "${name}": ${e?.message ?? e}` });
      return null;
    }
  };
  const grab = (re) => flat.match(re)?.[1]?.trim() ?? null;
  const DATE = String.raw`\d{1,2}[-/]\d{1,2}[-/]\d{4}`; // MM-DD-YYYY or M/D/YYYY

  const po_number = field('po_number', () =>
    grab(/PO\s*(?:Number|No\.?|#)\s*:?\s*([A-Za-z0-9][A-Za-z0-9-]*)/i)
  );
  if (!po_number) errors.push({ row: 0, message: 'PO Number not found in PDF' });

  // Order date: the first labelled "Date: <date>" (Ship/Delivery dates carry
  // their own labels and live in the terms row, so they don't collide here).
  const order_date = field('order_date', () =>
    isoDate(grab(new RegExp(String.raw`\bDate\s*:?\s*(${DATE})`, 'i')))
  );

  const retailer =
    field('retailer', () => (/\bKroger\b/i.test(flat) ? 'Kroger' : 'Walmart')) ?? 'Walmart';
  const destination_dc = field('destination_dc', () => (/Dot Foods/i.test(flat) ? 'Dot Foods' : null));

  const incoterms = field('incoterms', () => grab(/Incoterms\s+(.+?)\s+Payment Terms/i));

  // Terms / ship date / required-delivery date / carrier. Primary path: split
  // the values row after the "Shipping Method" header. Both date separators are
  // accepted, and label-adjacent fallbacks below cover layouts where the dates
  // sit on their own labelled lines instead of in the values row.
  let payment_terms = null;
  let customer_order_number = null;
  let ship_date_original = null;
  let mabd = null;
  let carrier = null;

  field('terms_row', () => {
    const termsRow =
      grab(/Shipping Method\s+(.+?)\s+Item\s+Item\s*Name/i) ||
      grab(/Shipping Method\s+(.+?)\s+(?:Item\b|U\/M\b)/i);
    if (!termsRow) return;
    const dates = [...termsRow.matchAll(new RegExp(DATE, 'g'))].map((m) => m[0]);
    if (dates[0]) ship_date_original = isoDate(dates[0]);
    if (dates[1]) mabd = isoDate(dates[1]);

    // Strict layout: "<terms> <custOrder> <date> <date> <carrier>".
    const strict = termsRow.match(
      new RegExp(String.raw`^(.+?)\s+(\S+)\s+${DATE}\s+${DATE}\s+(.+)$`)
    );
    if (strict) {
      payment_terms = strict[1].trim();
      customer_order_number = /^(na|n\/a|none)$/i.test(strict[2].trim()) ? null : strict[2].trim();
      carrier = strict[3].trim();
    } else if (dates.length) {
      // Loose: terms = text before the first date; carrier = text after the last.
      const first = dates[0];
      const last = dates[dates.length - 1];
      payment_terms = termsRow.slice(0, termsRow.indexOf(first)).trim() || null;
      carrier = termsRow.slice(termsRow.lastIndexOf(last) + last.length).trim() || null;
    }
  });

  // Label-adjacent fallbacks (dates on their own labelled lines, not in the row).
  if (!ship_date_original) {
    ship_date_original = field('ship_date', () =>
      isoDate(grab(new RegExp(String.raw`Ship Date\s*:?\s*(${DATE})`, 'i')))
    );
  }
  if (!mabd) {
    mabd = field('mabd', () =>
      isoDate(
        grab(
          new RegExp(
            String.raw`(?:Required Delivery Date|Must Arrive By(?: Date)?|MABD|Delivery Date)\s*:?\s*(${DATE})`,
            'i'
          )
        )
      )
    );
  }
  if (!payment_terms) {
    payment_terms = field('payment_terms', () =>
      grab(/Payment Terms\s*:?\s*(.+?)\s+(?:Customer Order|Ship Date|Incoterms|Item\b)/i)
    );
  }

  // Grand total: the last "$amount" following a "Total" label (skips any subtotal).
  const total_amount = field('total_amount', () => {
    const all = [...flat.matchAll(/\bTotal\s*:?\s*\$?\s*([\d,]+\.\d{2})/gi)];
    const last = all[all.length - 1];
    return last ? num(last[1]) : null;
  });

  // Line items: any line ending in "<qty> $<unit> $<ext>" — SKU is the first
  // token. Handles any number of items and any unit-cost precision; the grand-
  // total line (one amount, no qty/unit pair) and wrapped name lines don't match.
  const _lines =
    field('line_items', () => {
      const out = [];
      const LINE_RE = /^(\S+)\s+.*?([\d,]+)\s+\$?(\d+(?:\.\d+)?)\s+\$?([\d,]+\.\d{2})\s*$/;
      for (const line of rawLines) {
        const m = line.match(LINE_RE);
        if (!m || /^total$/i.test(m[1])) continue;
        out.push({
          sku: m[1],
          quantity_cases: parseInt(String(m[2]).replace(/,/g, ''), 10),
          unit_cost: num(m[3]),
          line_total: num(m[4]),
        });
      }
      return out;
    }) ?? [];
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
