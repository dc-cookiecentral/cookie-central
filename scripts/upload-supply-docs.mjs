#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Uploads the supplies seed's original documents to the private
// `supply-docs` bucket (docs/SUPPLIES_SPEC.md §V1.2).
//
//   node scripts/upload-supply-docs.mjs --out /some/dir      # build PDFs locally only
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     node scripts/upload-supply-docs.mjs                    # build + upload
//
// Source: the dc-supplies static catalogue (rev 6), which embeds each document
// as base64 JPEG page scans in its `PAGES` object. Each SUPPLY_DOCS entry's
// pages are wrapped into one PDF and uploaded (upsert) at its `path` —
// the same path the seed writes into quotes.doc_path.
//
// Run AFTER the migration (creates the bucket). Service role bypasses the
// bucket's admin/ops write policy, so keep that key out of .env.local.
// Override the catalogue location with --catalogue <path>.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { SUPPLY_DOCS } from './supplies-docs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
};
const CATALOGUE = arg('--catalogue') ?? join(ROOT, '../dc-supplies/index.html');
const OUT = arg('--out');

function loadPages(file) {
  const html = readFileSync(file, 'utf8');
  const m = html.match(/const PAGES = (\{[\s\S]*?\});/);
  if (!m) throw new Error(`No PAGES object in ${file}`);
  return JSON.parse(m[1]);
}

// JPEG pixel size from the first SOFn marker.
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error('Bad JPEG marker');
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), comps: buf[i + 9] };
    }
    i += 2 + len;
  }
  throw new Error('JPEG size not found');
}

// Minimal PDF: one page per JPEG, image fitted to US Letter width.
function jpegsToPdf(jpegs) {
  const objs = []; // index n → object n+1
  const add = (body) => {
    objs.push(body);
    return objs.length;
  };
  const catalog = add(null);
  const pages = add(null);
  const kids = [];
  for (const jpg of jpegs) {
    const { width, height, comps } = jpegSize(jpg);
    const pw = 612;
    const ph = Math.round((612 * height) / width);
    const img = add([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${comps === 1 ? '/DeviceGray' : comps === 4 ? '/DeviceCMYK' : '/DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`),
      jpg,
      Buffer.from('\nendstream'),
    ]);
    const draw = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    const content = add(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R >>`;
  objs[pages - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  const chunks = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let offset = chunks[0].length;
  const xref = [];
  objs.forEach((body, n) => {
    xref.push(offset);
    const parts = [Buffer.from(`${n + 1} 0 obj\n`), ...(Array.isArray(body) ? body : [Buffer.from(body)]), Buffer.from('\nendobj\n')];
    parts.forEach((p) => { chunks.push(p); offset += p.length; });
  });
  const xrefStart = offset;
  chunks.push(Buffer.from(
    `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    xref.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`,
  ));
  return Buffer.concat(chunks);
}

async function main() {
  const pages = loadPages(CATALOGUE);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!OUT && (!url || !key)) {
    console.error('Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to upload, or pass --out <dir> to build locally.');
    process.exit(1);
  }
  const supabase = OUT ? null : createClient(url, key, { auth: { persistSession: false } });

  let failed = 0;
  for (const { path, pages: ids } of Object.values(SUPPLY_DOCS)) {
    const missing = ids.filter((id) => !pages[id]);
    if (missing.length) {
      console.error(`✗ ${path}: page(s) missing from catalogue: ${missing.join(', ')}`);
      failed++;
      continue;
    }
    const pdf = jpegsToPdf(ids.map((id) => Buffer.from(pages[id], 'base64')));
    if (OUT) {
      const dest = join(OUT, path);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, pdf);
      console.log(`✓ ${dest} (${ids.length} pp, ${Math.round(pdf.length / 1024)} KB)`);
      continue;
    }
    const { error } = await supabase.storage.from('supply-docs').upload(path, pdf, { contentType: 'application/pdf', upsert: true });
    if (error) {
      console.error(`✗ ${path}: ${error.message}`);
      failed++;
    } else {
      console.log(`✓ supply-docs/${path} (${ids.length} pp)`);
    }
  }
  if (failed) process.exit(1);
}

main();
