// gmail-extract — act on classified-but-unprocessed gmail_messages.
//
//   PO / BOL / supplier_confirmation → Sonnet structured extraction →
//        po_emails (+ po_lot_numbers + advisory po_changes(change_source='email'))
//   assemblers_report → download the .xlsx → existing production.js parser →
//        importRecords (service client) → upload_log(source='email')
//   weekly_report     → existing weeklyEmail.js body parser → weekly_reports
//   other             → marked processed, no action
//
// Advisory by design (PO/BOL/confirmation): writes the email + lots + a
// po_changes audit row per differing field, but does NOT mutate purchase_orders
// (that stays a reviewed action via the existing UI, and avoids double-logging
// against the track_po_changes trigger). The attachment pipelines DO write their
// real tables — they replace a manual upload.
//
// Deploy:  npx supabase functions deploy gmail-extract

import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceClient } from '../_shared/supabase.ts';
import { getSecret } from '../_shared/vault.ts';
import { handleCors, json } from '../_shared/cors.ts';
import {
  refreshAccessToken,
  getMessage,
  parseMessage,
  getAttachment,
  type ParsedAttachment,
} from '../_shared/gmail.ts';
import { extractEmail } from '../_shared/anthropic.ts';
import { runEmailImport } from '../_shared/emailUpload.ts';
import { importWeekly } from '../_shared/weeklyImport.ts';
// Reuse the existing Assemblers workbook parser unchanged (client injected).
import production from '../../../src/parsers/production.js';
// Reuse the Cortina Walmart Orders parser (groups SOs → purchase_orders +
// po_line_items + cortina_invoices). Client injected, same as production.
import walmartOrders from '../../../src/parsers/walmartOrders.js';

const STRUCTURED = new Set(['PO', 'BOL', 'supplier_confirmation']);

// PO fields the extraction can advise on, mapped to the email's extracted value.
const CHANGE_FIELDS: [string, keyof Awaited<ReturnType<typeof extractEmail>>][] = [
  ['carrier', 'carrier'],
  ['bol_number', 'bol_number'],
  ['ship_date_actual', 'ship_date'],
  ['destination_dc', 'destination_dc'],
  ['total_cases', 'total_cases'],
  ['total_amount', 'total_amount'],
  ['mabd', 'mabd'],
];

function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) out[k] = v;
  }
  return out;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const supabase = serviceClient();
  try {
    const [clientId, clientSecret, refreshToken, apiKey] = await Promise.all([
      getSecret(supabase, 'GMAIL_OAUTH_CLIENT_ID'),
      getSecret(supabase, 'GMAIL_OAUTH_CLIENT_SECRET'),
      getSecret(supabase, 'GMAIL_REFRESH_TOKEN'),
      getSecret(supabase, 'ANTHROPIC_API_KEY'),
    ]);
    if (!refreshToken) return json({ error: 'Gmail not connected.' }, 400);
    const accessToken = await refreshAccessToken(clientId!, clientSecret!, refreshToken);

    // "other" needs no action — bulk-mark it processed in one shot so it never
    // accumulates as pending (and doesn't consume the actionable batch limit).
    const { data: swept } = await supabase
      .from('gmail_messages')
      .update({ processed: true })
      .eq('processed', false)
      .eq('classification', 'other')
      .select('id');
    const otherSwept = swept?.length ?? 0;

    const { data: pending } = await supabase
      .from('gmail_messages')
      .select('*')
      .eq('processed', false)
      .neq('classification', 'other')
      .order('internal_date', { ascending: true })
      .limit(20);

    const results: unknown[] = [];
    for (const gm of pending ?? []) {
      try {
        if (STRUCTURED.has(gm.classification)) {
          results.push(await handleStructured(supabase, apiKey!, accessToken, gm));
        } else if (gm.classification === 'assemblers_report') {
          results.push(await handleAssemblers(supabase, accessToken, gm));
        } else if (gm.classification === 'walmart_orders') {
          results.push(await handleWalmartOrders(supabase, accessToken, gm));
        } else if (gm.classification === 'weekly_report') {
          results.push(await handleWeekly(supabase, accessToken, gm));
        }
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        await supabase.from('gmail_messages').update({ processed: true, error: msg }).eq('id', gm.id);
        results.push({ id: gm.id, classification: gm.classification, error: msg });
      }
    }

    // Weekly-report images are downloaded + stored only for messages processed
    // by THIS run. Historical weeks already marked processed=true won't be
    // revisited — to back-fill their screenshots, reset those gmail_messages to
    // processed=false (and clear `error`), then re-run gmail-extract.
    const note =
      'Weekly-report images are stored only for messages processed in this run. ' +
      'To back-fill historical weeks, set gmail_messages.processed=false (and ' +
      'error=null) for those weekly_report messages and re-run gmail-extract.';

    return json({ ok: true, processed: results.length, otherSwept, results, note });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

// ── PO / BOL / supplier_confirmation ────────────────────────────────────────
async function handleStructured(
  supabase: SupabaseClient,
  apiKey: string,
  accessToken: string,
  gm: any,
) {
  const parsed = parseMessage(await getMessage(accessToken, gm.gmail_message_id));
  const ext = await extractEmail(apiKey, {
    from: parsed.from,
    subject: parsed.subject,
    body: parsed.body,
  });

  // Resolve the PO (nullable — back-fills if the PO arrives later).
  let poId: string | null = null;
  let po: any = null;
  if (ext.po_number) {
    const { data } = await supabase
      .from('purchase_orders')
      .select('id, carrier, bol_number, ship_date_actual, destination_dc, total_cases, total_amount, mabd')
      .eq('po_number', ext.po_number)
      .maybeSingle();
    if (data) {
      po = data;
      poId = data.id;
    }
  }

  const extracted_data = compact({
    po_number: ext.po_number,
    carrier: ext.carrier,
    bol_number: ext.bol_number,
    ship_date: ext.ship_date,
    mabd: ext.mabd,
    delivery_date: ext.delivery_date,
    total_amount: ext.total_amount,
    total_cases: ext.total_cases,
    destination_dc: ext.destination_dc,
    lots: ext.lots.length || null,
    anomalies: ext.anomalies,
    classification: gm.classification,
  });

  const { data: emailRow, error: emailErr } = await supabase
    .from('po_emails')
    .insert({
      po_id: poId,
      email_timestamp: parsed.internalDate,
      sender_name: ext.sender_name ?? parsed.fromName,
      sender_org: ext.sender_org,
      summary: ext.summary,
      extracted_data,
      source: 'email',
    })
    .select('id')
    .single();
  if (emailErr) throw emailErr;

  // Finished-good lots — persisted even when the PO isn't in the DB yet (po_id
  // null = "parked"). A later NetSuite load back-fills po_id via the
  // link_parked_po_emails RPC, joining on extracted_from_email_id.
  let lotCount = 0;
  if (ext.lots.length) {
    const rows = ext.lots
      .filter((l) => l.lot_number)
      .map((l) => ({
        po_id: poId, // may be null (parked); back-filled when the PO arrives
        lot_number: String(l.lot_number),
        sku: l.sku ?? null,
        quantity_cases: l.quantity_cases ?? null,
        bol_reference: ext.bol_number ?? null,
        received_date: ext.delivery_date ?? null,
        source: 'email',
        extracted_from_email_id: emailRow.id,
      }));
    if (rows.length) {
      const { error } = await supabase.from('po_lot_numbers').insert(rows);
      if (!error) lotCount = rows.length;
    }
  }

  // Advisory change rows for fields the email contradicts on the PO.
  let changeCount = 0;
  if (poId && po) {
    const changeRows = [];
    for (const [field, key] of CHANGE_FIELDS) {
      const val = ext[key] as string | number | null;
      if (val === null || val === undefined) continue;
      const cur = po[field];
      if (String(cur ?? '') !== String(val)) {
        changeRows.push({
          po_id: poId,
          field_name: field,
          original_value: cur === null || cur === undefined ? null : String(cur),
          new_value: String(val),
          change_source: 'email',
          change_reason: `From email: ${gm.subject ?? gm.classification}`,
        });
      }
    }
    if (changeRows.length) {
      const { error } = await supabase.from('po_changes').insert(changeRows);
      if (!error) changeCount = changeRows.length;
    }
  }

  await supabase
    .from('gmail_messages')
    .update({ processed: true, po_id: poId, po_email_id: emailRow.id, error: null })
    .eq('id', gm.id);

  return {
    id: gm.id,
    classification: gm.classification,
    po_number: ext.po_number,
    poMatched: !!poId,
    lots: lotCount,
    changes: changeCount,
  };
}

// ── assemblers_report → existing production parser ──────────────────────────
async function handleAssemblers(supabase: SupabaseClient, accessToken: string, gm: any) {
  const parsed = parseMessage(await getMessage(accessToken, gm.gmail_message_id));
  const att = parsed.attachments.find((a) => /\.xlsx?$/i.test(a.filename ?? ''));
  if (!att) throw new Error('assemblers_report but no .xlsx attachment found');

  const bytes = await getAttachment(accessToken, gm.gmail_message_id, att.attachmentId);
  // production.parseFileImpl reads via file.arrayBuffer() — a Blob satisfies it.
  const blob = new Blob([bytes], {
    type: att.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const parsedOut = await (production as any).parseFile(blob);

  const res = await runEmailImport(supabase, production as any, parsedOut, {
    filename: att.filename,
    uploadType: 'production',
  });

  await supabase
    .from('gmail_messages')
    .update({ processed: true, upload_log_id: res.uploadId, error: null })
    .eq('id', gm.id);

  return {
    id: gm.id,
    classification: gm.classification,
    filename: att.filename,
    inserted: res.inserted,
    uploadId: res.uploadId,
  };
}

// ── walmart_orders → Cortina Walmart Orders parser ──────────────────────────
// The daily export carries the FULL order history, so the parser upserts on
// cortina_so_number (no duplicates). Replaces the manual Cortina PO PDF upload.
async function handleWalmartOrders(supabase: SupabaseClient, accessToken: string, gm: any) {
  const parsed = parseMessage(await getMessage(accessToken, gm.gmail_message_id));
  const att = parsed.attachments.find((a) => /Walmart_Orders_.*\.xlsx$/i.test(a.filename ?? ''))
    ?? parsed.attachments.find((a) => /\.xlsx?$/i.test(a.filename ?? ''));
  if (!att) throw new Error('walmart_orders but no .xlsx attachment found');

  const bytes = await getAttachment(accessToken, gm.gmail_message_id, att.attachmentId);
  const blob = new Blob([bytes], {
    type: att.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const parsedOut = await (walmartOrders as any).parseFile(blob);

  const res = await runEmailImport(supabase, walmartOrders as any, parsedOut, {
    filename: att.filename,
    uploadType: 'walmart_orders',
  });

  await supabase
    .from('gmail_messages')
    .update({ processed: true, upload_log_id: res.uploadId, error: null })
    .eq('id', gm.id);

  return {
    id: gm.id,
    classification: gm.classification,
    filename: att.filename,
    inserted: res.inserted,
    uploadId: res.uploadId,
  };
}

// ── weekly_report → existing weekly parser + image attachments ──────────────
const WEEKLY_IMAGE_BUCKET = 'weekly-report-attachments';
const IMAGE_MIME = /^image\//i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;

function safeName(name: string): string {
  return String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_') || 'image';
}

const isImageAtt = (a: ParsedAttachment) =>
  IMAGE_MIME.test(a.mimeType ?? '') || IMAGE_EXT.test(a.filename ?? '');

// Signature logos/banners are small; Retail Link screenshots are 1000px+. A
// readable dimension below this is treated as decoration and dropped (backstop
// for a logo that arrives as a real attachment rather than inline/CID).
const MIN_DATA_IMAGE_DIM = 400;

// Best-effort intrinsic dimension sniff (max of width/height) for the common
// raster formats, read straight from the file header. Returns null if unknown
// (in which case we keep the image — never drop on uncertainty).
function imageMaxDim(b: Uint8Array): number | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // PNG: \x89PNG, IHDR width@16 / height@20 (big-endian u32)
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return Math.max(dv.getUint32(16), dv.getUint32(20));
  }
  // GIF: "GIF8", width@6 / height@8 (little-endian u16)
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return Math.max(dv.getUint16(6, true), dv.getUint16(8, true));
  }
  // JPEG: walk segments to a SOF marker (0xC0–0xCF, excl. C4/C8/CC)
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) { o++; continue; }
      const marker = b[o + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return Math.max(dv.getUint16(o + 7), dv.getUint16(o + 5)); // width, height
      }
      const len = dv.getUint16(o + 2);
      if (len < 2) break;
      o += 2 + len;
    }
  }
  return null;
}

// Download the email's Retail Link data screenshots, store them in the public
// weekly-report-attachments bucket (path <week>/<NN>-<name>, NN preserving
// email order), and return their public URLs for the weekly_reports row.
//
// Filtering: keep only true attachments (skip inline/CID parts — signature
// logos + promo banners), then drop any that sniff smaller than a real report
// screenshot. Existing objects for the week are cleared first so re-processing
// replaces them (no orphaned/filtered images linger). A single bad image is
// skipped rather than failing the whole weekly ingest.
async function storeWeeklyImages(
  supabase: SupabaseClient,
  accessToken: string,
  messageId: string,
  weekNumber: string,
  attachments: ParsedAttachment[],
): Promise<{
  images: { name: string; url: string; mimeType: string; size: number }[];
  skippedInline: number;
  skippedSmall: number;
}> {
  const prefix = safeName(weekNumber);

  // Clear previously-stored objects for this week (drops images filtered by the
  // updated heuristics on re-process).
  const { data: existing } = await supabase.storage.from(WEEKLY_IMAGE_BUCKET).list(prefix);
  if (existing?.length) {
    await supabase.storage
      .from(WEEKLY_IMAGE_BUCKET)
      .remove(existing.map((o) => `${prefix}/${o.name}`));
  }

  const imageAtts = attachments.filter(isImageAtt);
  const skippedInline = imageAtts.filter((a) => a.inline).length;
  const candidates = imageAtts.filter((a) => !a.inline);

  const images: { name: string; url: string; mimeType: string; size: number }[] = [];
  let skippedSmall = 0;
  let n = 0;
  for (const att of candidates) {
    try {
      const bytes = await getAttachment(accessToken, messageId, att.attachmentId);
      const dim = imageMaxDim(bytes);
      if (dim !== null && dim < MIN_DATA_IMAGE_DIM) {
        skippedSmall++;
        continue;
      }
      n++;
      const path = `${prefix}/${String(n).padStart(2, '0')}-${safeName(att.filename)}`;
      const { error: upErr } = await supabase.storage
        .from(WEEKLY_IMAGE_BUCKET)
        .upload(path, bytes, { contentType: att.mimeType || 'image/png', upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from(WEEKLY_IMAGE_BUCKET).getPublicUrl(path);
      images.push({
        name: att.filename || `image${n}`,
        url: data.publicUrl,
        mimeType: att.mimeType || 'image/png',
        size: att.size ?? bytes.length,
      });
    } catch (_e) {
      // Skip this image; keep the rest.
    }
  }
  return { images, skippedInline, skippedSmall };
}

async function handleWeekly(supabase: SupabaseClient, accessToken: string, gm: any) {
  const parsed = parseMessage(await getMessage(accessToken, gm.gmail_message_id));
  const rep = await importWeekly(supabase, {
    subject: parsed.subject,
    from: parsed.from,
    date: parsed.date,
    body: parsed.body,
    attachments: parsed.attachments,
  });

  // Pull the data screenshots into Storage and record their URLs on the row
  // (always sync — an empty array clears stale images on re-process).
  const { images, skippedInline, skippedSmall } = await storeWeeklyImages(
    supabase,
    accessToken,
    gm.gmail_message_id,
    rep.week_number,
    parsed.attachments,
  );
  await supabase.from('weekly_reports').update({ image_attachments: images }).eq('id', rep.id);

  await supabase
    .from('gmail_messages')
    .update({
      processed: true,
      error: null,
      raw: { ...(gm.raw ?? {}), weekly_report_id: rep.id },
    })
    .eq('id', gm.id);

  return {
    id: gm.id,
    classification: gm.classification,
    week_number: rep.week_number,
    weeklyReportId: rep.id,
    imagesStored: images.length,
    imagesSkipped: skippedInline + skippedSmall,
    skippedInline,
    skippedSmall,
  };
}
