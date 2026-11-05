// gmail-extract — act on classified-but-unprocessed gmail_messages.
//
//   walmart_orders → Cortina Walmart Orders .xlsx → walmartOrders.js →
//        purchase_orders + po_line_items + cortina_invoices, upload_log(source='email')
//   weekly_report  → every .xlsx attachment of the Bentonville Merchants weekly
//        email, each routed BY ITS CONTENTS to the Retail Link parser that
//        recognises it (upload cards 1–4), upload_log(source='email') per file
//   other          → marked processed, no action
//
// Narrowed Nov 5 2026 (Caroline): the Assemblers report (we are leaving that
// co-packer) and the PO / BOL / supplier_confirmation extraction (a later
// phase) were removed, along with the AI classifier in gmail-poll. Both are in
// git history before this change. The weekly email's body scorecard and image
// screenshots (weekly_reports, the hidden Weekly Report page) are no longer
// imported either: its four spreadsheets carry the data.
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
import { runEmailImport } from '../_shared/emailUpload.ts';
import { detectRetailLink, type RetailLinkType } from '../_shared/retailLinkDetect.ts';
// Reuse the browser upload parsers unchanged (client injected). Each reads a
// Blob through file.arrayBuffer() and takes its dates from the file contents.
import walmartOrders from '../../../src/parsers/walmartOrders.js';
import retailLink from '../../../src/parsers/retailLink.js';
import retailLinkOtif from '../../../src/parsers/retailLinkOtif.js';
import retailLinkSupplyPlan from '../../../src/parsers/retailLinkSupplyPlan.js';

// The only classes acted on. Older rows of retired classes (PO, BOL,
// supplier_confirmation, assemblers_report) that are still unprocessed are left
// as they are, untouched, rather than swept or retried.
const HANDLED = ['walmart_orders', 'weekly_report'];

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const supabase = serviceClient();
  try {
    const [clientId, clientSecret, refreshToken] = await Promise.all([
      getSecret(supabase, 'GMAIL_OAUTH_CLIENT_ID'),
      getSecret(supabase, 'GMAIL_OAUTH_CLIENT_SECRET'),
      getSecret(supabase, 'GMAIL_REFRESH_TOKEN'),
    ]);
    if (!refreshToken) return json({ error: 'Gmail not connected.' }, 400);
    const accessToken = await refreshAccessToken(clientId!, clientSecret!, refreshToken);

    // "other" needs no action — bulk-mark it processed in one shot so it never
    // accumulates as pending.
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
      .in('classification', HANDLED)
      .order('internal_date', { ascending: true })
      .limit(20);

    const results: unknown[] = [];
    for (const gm of pending ?? []) {
      try {
        if (gm.classification === 'walmart_orders') {
          results.push(await handleWalmartOrders(supabase, accessToken, gm));
        } else if (gm.classification === 'weekly_report') {
          results.push(await handleWeeklyRetailLink(supabase, accessToken, gm));
        }
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        await supabase.from('gmail_messages').update({ processed: true, error: msg }).eq('id', gm.id);
        results.push({ id: gm.id, classification: gm.classification, error: msg });
      }
    }

    return json({ ok: true, processed: results.length, otherSwept, results });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

async function attachmentBlob(accessToken: string, messageId: string, att: ParsedAttachment): Promise<Blob> {
  const bytes = await getAttachment(accessToken, messageId, att.attachmentId);
  return new Blob([bytes as BlobPart], {
    type: att.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ── walmart_orders → Cortina Walmart Orders parser ──────────────────────────
// The daily export carries the FULL order history, so the parser upserts on
// cortina_so_number (no duplicates). Replaces the manual Cortina PO PDF upload.
async function handleWalmartOrders(supabase: SupabaseClient, accessToken: string, gm: any) {
  const parsed = parseMessage(await getMessage(accessToken, gm.gmail_message_id));
  const att = parsed.attachments.find((a) => /Walmart_Orders_.*\.xlsx$/i.test(a.filename ?? ''))
    ?? parsed.attachments.find((a) => /\.xlsx?$/i.test(a.filename ?? ''));
  if (!att) throw new Error('walmart_orders but no .xlsx attachment found');

  const blob = await attachmentBlob(accessToken, gm.gmail_message_id, att);
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

// ── weekly_report → Retail Link parsers, one per attachment ─────────────────
// The weekly email carries the four files of upload cards 1–4 (Supply Plan,
// Dirty Cookie WK##, OTIF 1 week, OTIF 3 weeks). Each .xlsx is routed by its
// contents (_shared/retailLinkDetect.ts), never its filename. A file nobody
// recognises is reported, not imported and not dropped silently; the rest of
// the email still imports.
const RETAIL_LINK_PARSERS: Record<RetailLinkType, any> = {
  retail_link_supply_plan: retailLinkSupplyPlan,
  retail_link: retailLink,
  retail_link_otif: retailLinkOtif,
};

async function handleWeeklyRetailLink(supabase: SupabaseClient, accessToken: string, gm: any) {
  const parsed = parseMessage(await getMessage(accessToken, gm.gmail_message_id));
  const files = parsed.attachments.filter((a) => !a.inline && /\.xlsx?$/i.test(a.filename ?? ''));
  if (!files.length) throw new Error('weekly_report but no .xlsx attachment found');

  const XLSX = await import('xlsx');
  const imported: { filename: string; uploadType: string; inserted: number; uploadId: string }[] = [];
  const problems: string[] = [];
  for (const att of files) {
    try {
      const blob = await attachmentBlob(accessToken, gm.gmail_message_id, att);
      const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
      const type = detectRetailLink(XLSX, wb);
      const parser = type && RETAIL_LINK_PARSERS[type];
      if (!parser) {
        problems.push(`${att.filename}: not a recognised Retail Link report (sheets: ${wb.SheetNames.join(', ')})`);
        continue;
      }
      const out = await parser.parseFile(blob);
      if (!out.records?.length) {
        problems.push(`${att.filename}: ${parser.type} parsed no rows (${out.errors?.[0]?.message ?? out.summary ?? 'no detail'})`);
        continue;
      }
      const res = await runEmailImport(supabase, parser, out, { filename: att.filename, uploadType: parser.type });
      imported.push({ filename: att.filename, uploadType: parser.type, inserted: res.inserted, uploadId: res.uploadId });
    } catch (e) {
      problems.push(`${att.filename}: ${String((e as Error)?.message ?? e)}`);
    }
  }

  await supabase
    .from('gmail_messages')
    .update({
      processed: true,
      upload_log_id: imported[0]?.uploadId ?? null,
      error: problems.length ? problems.join(' | ') : null,
      raw: { ...(gm.raw ?? {}), retail_link_imports: imported },
    })
    .eq('id', gm.id);

  return { id: gm.id, classification: gm.classification, imported, problems };
}
