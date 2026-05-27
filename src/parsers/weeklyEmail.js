// Parser for the Bentonville Merchants weekly Retail Link email
// (subject: "Dirty Cookie | Weekly Reporting | WK##", from blayn@bentonvillemerchants.com).
//
// Pure + dependency-free on purpose: the same `parseWeeklyBody` is reused by
// (a) dropping a saved .eml here during dev, and (b) the future server-side
// connect (Gmail API / Edge Function) which already has subject+body separated.
//
// What the EMAIL BODY carries (and this parses): scorecard highlights, the
// POS-by-SKU-by-week table, U/S/W & $/S/W velocity, and the OTIF blocks.
// What it does NOT carry: Findings + EOS To-Dos (those are the human/AI L10
// layer), and the deep detail that rides as .xlsx attachments + chart images.

// ---- low-level helpers -----------------------------------------------------

// Decode quoted-printable (=XX hex escapes + =\n soft breaks). Email bodies
// from Outlook arrive QP-encoded.
export function decodeQuotedPrintable(s) {
  return s
    .replace(/=\r?\n/g, '') // soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

const toNum = (s) => {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// ---- MIME extraction (for the .eml file-drop path) -------------------------

// Pull subject/date/from, the text/plain body (QP-decoded), and attachment
// filenames out of a raw .eml string.
export function extractEmailParts(rawEml) {
  const header = (name) => {
    const m = rawEml.match(new RegExp(`^${name}:[ \\t]*(.+)$`, 'im'));
    return m ? m[1].trim() : null;
  };

  // text/plain part: from its Content-Type to the next MIME boundary line.
  let plainBody = '';
  const ctIdx = rawEml.search(/Content-Type:\s*text\/plain/i);
  if (ctIdx !== -1) {
    const after = rawEml.slice(ctIdx);
    const blank = after.search(/\r?\n\r?\n/); // end of this part's headers
    if (blank !== -1) {
      const bodyStart = after.slice(blank).replace(/^\r?\n\r?\n/, '');
      const end = bodyStart.search(/\r?\n--/); // next boundary delimiter
      plainBody = decodeQuotedPrintable(end !== -1 ? bodyStart.slice(0, end) : bodyStart);
    }
  }

  const attachments = [];
  const seen = new Set();
  const re = /filename="([^"]+\.(?:xlsx|xls|csv|pdf))"/gi;
  let m;
  while ((m = re.exec(rawEml))) {
    const name = m[1].replace(/\s+/g, ' ').trim(); // un-fold names wrapped across header lines
    if (!seen.has(name)) {
      seen.add(name);
      attachments.push(name);
    }
  }

  return {
    subject: header('Subject'),
    date: header('Date'),
    from: header('From'),
    plainBody,
    attachments,
  };
}

// ---- body parsing (the reusable core) --------------------------------------

// `* Label - value` highlight bullets (note: OTIF uses `:` not `-`).
function parseHighlights(lines, startIdx) {
  const out = [];
  for (let i = startIdx; i < lines.length; i++) {
    const m = lines[i].match(/^\*\s*(.+?)\s+-\s+(.+)$/);
    if (m) out.push({ label: m[1].trim(), value: m[2].trim() });
    else if (out.length) break; // stop after the bullet run ends
  }
  return out;
}

// POS-by-SKU-by-week table. Text/plain flattens it to one value per line:
//   Number / Name / "Walmart week 13".."week 16" / then [code,name,v1..vN] rows
//   / "Grand Total" + vN.
function parsePosTable(lines) {
  const firstWeek = lines.findIndex((l) => /^Walmart week \d+/i.test(l));
  if (firstWeek === -1) return null;
  const weeks = [];
  let i = firstWeek;
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^Walmart week (\d+)/i);
    if (!m) break;
    weeks.push(Number(m[1]));
  }
  const n = weeks.length;
  const rows = [];
  let totals = null;
  for (; i < lines.length; i++) {
    if (/^Grand Total$/i.test(lines[i])) {
      totals = lines.slice(i + 1, i + 1 + n).map(toNum);
      break;
    }
    // a SKU block: numeric code, name, then n numbers
    if (/^\d{4,}$/.test(lines[i]) && i + 1 + n < lines.length) {
      const code = lines[i];
      const name = lines[i + 1];
      const vals = lines.slice(i + 2, i + 2 + n).map(toNum);
      if (vals.length === n && vals.every((v) => v != null)) {
        rows.push({ code, name, weekly: vals });
        i += 1 + n;
        continue;
      }
    }
  }
  return { weeks, rows, totals };
}

// U/S/W & $/S/W velocity table: headers then [code, name, usw, dsw] per SKU.
function parseVelocity(lines) {
  const h = lines.findIndex((l) => /^U\/S\/W$/i.test(l));
  if (h === -1 || !/^\$\/S\/W$/i.test(lines[h + 1] || '')) return [];
  const out = [];
  for (let i = h + 2; i + 3 < lines.length; ) {
    if (/^\d{4,}$/.test(lines[i])) {
      out.push({ code: lines[i], name: lines[i + 1], usw: toNum(lines[i + 2]), dsw: toNum(lines[i + 3]) });
      i += 4;
    } else break;
  }
  return out;
}

// OTIF blocks: "OTIF - WK15" / "OTIF- L4W" header then `* Field: value` bullets.
function parseOtif(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^OTIF\s*-?\s*(.+)$/i);
    if (!m) continue;
    const fields = {};
    for (let j = i + 1; j < lines.length; j++) {
      const b = lines[j].match(/^\*\s*(.+?):\s*(.+)$/);
      if (b) fields[b[1].trim()] = b[2].trim();
      else if (Object.keys(fields).length) break;
    }
    out.push({ label: m[1].trim(), fields });
  }
  return out;
}

// Parse the decoded body text into structured data. Reusable across .eml drop
// and the future API feed (which passes body directly).
export function parseWeeklyBody(body) {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const hi = lines.findIndex((l) => /^LW Highlights:/i.test(l));
  return {
    highlights: hi === -1 ? [] : parseHighlights(lines, hi + 1),
    pos: parsePosTable(lines),
    velocity: parseVelocity(lines),
    otif: parseOtif(lines),
  };
}

// ---- top-level + display mapping -------------------------------------------

const fmtDate = (raw) => {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d) ? raw : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const pct = (cur, prev) => {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
};

// Build the Weekly Report display record (matches src/data/weeklyReports.js).
export function toWeeklyReport(rawEml) {
  const parts = extractEmailParts(rawEml);
  const data = parseWeeklyBody(parts.plainBody);
  const wk = (parts.subject?.match(/WK\s*\d+/i)?.[0] || '').replace(/\s+/g, '') || 'WK?';

  const find = (re) => data.highlights.find((h) => re.test(h.label))?.value ?? null;
  const sales = find(/\bSales\b(?!.*YTD)/i) || find(/^LW Sales/i);
  const posQty = find(/POS Qty/i) && data.highlights.find((h) => /POS Qty/i.test(h.label) && !/YTD/i.test(h.label))?.value;
  const ytdSales = find(/YTD Sales/i);
  const instock = find(/Instock/i);
  const margin = find(/Margin/i);

  // WoW POS-qty delta straight from the in-email week table.
  let qtyDelta = null;
  if (data.pos?.totals?.length >= 2) {
    const t = data.pos.totals;
    qtyDelta = pct(t[t.length - 1], t[t.length - 2]);
  }
  const wccb = data.velocity.find((v) => /WHITE CHOC|WCCB/i.test(v.name));
  const pb = data.velocity.find((v) => /PB|PEANUT/i.test(v.name));
  const l4w = data.otif.find((o) => /L4W/i.test(o.label));
  // OTIF "On Time" carries a "(Collect- Walmart Responsibility)" note — keep the % for display.
  const clean = (s) => (s ? s.replace(/\s*\(.*\)\s*$/, '').trim() : s);

  const kpis = [];
  if (sales) kpis.push({ l: 'POS', v: sales, d: '', c: '#5C526A' });
  if (posQty)
    kpis.push({
      l: 'POS Qty',
      v: posQty,
      d: qtyDelta == null ? '' : `${qtyDelta < 0 ? 'down' : 'up'} ${Math.abs(qtyDelta).toFixed(1)}%`,
      c: qtyDelta != null && qtyDelta < 0 ? '#DC2626' : '#059669',
    });
  if (instock) kpis.push({ l: 'Instock', v: instock, d: '', c: '#059669' });
  if (margin) kpis.push({ l: 'Maint. Margin', v: margin, d: '', c: '#059669' });
  if (ytdSales) kpis.push({ l: 'YTD Sales', v: ytdSales, d: '', c: '#5C526A' });
  if (wccb?.usw != null) kpis.push({ l: 'WCCB U/S/W', v: String(wccb.usw), d: `$/S/W ${wccb.dsw}`, c: '#5C526A' });
  if (pb?.usw != null) kpis.push({ l: 'PB U/S/W', v: String(pb.usw), d: `$/S/W ${pb.dsw}`, c: '#5C526A' });
  if (l4w) {
    const ot = clean(l4w.fields['On Time']);
    kpis.push({ l: 'OTIF L4W', v: ot || '--', d: `In Full ${l4w.fields['In Full'] || '--'}`, c: '#059669' });
  }

  const hl = [
    sales && `LW Sales ${sales}`,
    posQty && `POS Qty ${posQty}`,
    instock && `Instock ${instock}`,
    margin && `Maintained Margin ${margin}`,
    l4w?.fields['On Time'] && `OTIF L4W ${clean(l4w.fields['On Time'])}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    wk,
    dt: fmtDate(parts.date),
    src: parts.from?.match(/[\w.+-]+@[\w.-]+/)?.[0] || parts.from,
    subj: parts.subject,
    hl,
    kpis,
    findings: [], // human/AI L10 layer — not in the email body
    todos: [],
    attachments: parts.attachments,
    pos: data.pos,
    otif: data.otif,
  };
}
