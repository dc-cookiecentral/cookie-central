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
} from '../_shared/gmail.ts';
import { extractEmail } from '../_shared/anthropic.ts';
import { runEmailImport } from '../_shared/emailUpload.ts';
import { importWeekly } from '../_shared/weeklyImport.ts';
// Reuse the existing Assemblers workbook parser unchanged (client injected).
import production from '../../../src/parsers/production.js';

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
        } else if (gm.classification === 'weekly_report') {
          results.push(await handleWeekly(supabase, accessToken, gm));
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

  // Finished-good lots (only meaningful once linked to a PO).
  let lotCount = 0;
  if (poId && ext.lots.length) {
    const rows = ext.lots
      .filter((l) => l.lot_number)
      .map((l) => ({
        po_id: poId,
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

// ── weekly_report → existing weekly parser ──────────────────────────────────
async function handleWeekly(supabase: SupabaseClient, accessToken: string, gm: any) {
  const parsed = parseMessage(await getMessage(accessToken, gm.gmail_message_id));
  const rep = await importWeekly(supabase, {
    subject: parsed.subject,
    from: parsed.from,
    date: parsed.date,
    body: parsed.body,
    attachments: parsed.attachments,
  });

  await supabase
    .from('gmail_messages')
    .update({
      processed: true,
      error: null,
      raw: { ...(gm.raw ?? {}), weekly_report_id: rep.id },
    })
    .eq('id', gm.id);

  return { id: gm.id, classification: gm.classification, week_number: rep.week_number, weeklyReportId: rep.id };
}
