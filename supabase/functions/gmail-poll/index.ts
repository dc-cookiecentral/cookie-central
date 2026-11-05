// gmail-poll — fetch new mail from systems@dirtycookie.com, classify each BY
// RULE (sender + subject), persist to gmail_messages (idempotent on
// gmail_message_id), then tail-call gmail-extract to act on the actionable ones.
//
// Only two emails are acted on (Nov 5 2026, Caroline): the Bentonville
// Merchants weekly Retail Link email and Cortina's daily Walmart Orders export.
// Everything else is 'other'. The Haiku classifier was removed with the
// Assemblers / PO / BOL / supplier classes it served, so no email content is
// sent to Anthropic. The classifier (_shared/anthropic.ts, deleted Nov 5 2026)
// is in git history for the later PO/BOL phase.
//
// Invoked two ways, both satisfy verify_jwt:
//   - the "Check for new" button (supabase.functions.invoke → user's admin JWT)
//   - the daily pg_cron job (net.http_post → service-role bearer)
//
// Deploy:  npx supabase functions deploy gmail-poll

import { serviceClient } from '../_shared/supabase.ts';
import { getSecret } from '../_shared/vault.ts';
import { handleCors, json } from '../_shared/cors.ts';
import {
  refreshAccessToken,
  listMessages,
  SYSTEM_SUBJECT_PREFIX,
  getMessage,
  parseMessage,
} from '../_shared/gmail.ts';

type Classification = 'weekly_report' | 'walmart_orders' | 'other';

// The weekly Retail Link email: subject "Dirty Cookie | Weekly Reporting | WK##".
// Sent by caroline@ at Bentonville Merchants as of Nov 2026 (it came from
// blayn@ until Jul 2026), with the four spreadsheets of upload cards 1–4.
const WEEKLY_SUBJECT_RE = /Dirty Cookie.*Weekly Reporting.*WK(\d+)/i;
const WEEKLY_SENDER = 'caroline@bentonvillemerchants.com';

// The Cortina Walmart Orders export is likewise deterministic: subject
// "Walmart_Orders_YYYY-MM-DD" from DMorales@CortinaFoods.com, daily at 10 PM ET.
// Matched by rule, like the weekly email.
const WALMART_ORDERS_SUBJECT_RE = /Walmart_Orders_\d{4}-\d{2}-\d{2}/i;
const WALMART_ORDERS_SENDER = 'dmorales@cortinafoods.com';

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
    if (!refreshToken) return json({ error: 'Gmail not connected — click Connect Gmail first.' }, 400);
    if (!clientId || !clientSecret) return json({ error: 'Gmail OAuth client not in Vault.' }, 500);

    const accessToken = await refreshAccessToken(clientId, clientSecret, refreshToken);

    // First run scans 30 days; subsequent runs only the recent window. Dedupe on
    // gmail_message_id makes the overlap harmless.
    const { data: stateRows } = await supabase.from('gmail_sync_state').select('*').limit(1);
    const state = stateRows?.[0];
    // Minus Sample Central's own alerts, which are sent from and to this inbox.
    const own = `-subject:"${SYSTEM_SUBJECT_PREFIX}"`;
    const q = `${state?.last_polled_at ? 'in:inbox newer_than:2d' : 'in:inbox newer_than:30d'} ${own}`;
    const ids = await listMessages(accessToken, q, 40);

    let classified = 0;
    let skipped = 0;
    for (const m of ids) {
      const { data: seen } = await supabase
        .from('gmail_messages')
        .select('id')
        .eq('gmail_message_id', m.id)
        .limit(1);
      if (seen && seen.length) {
        skipped++;
        continue;
      }

      const parsed = parseMessage(await getMessage(accessToken, m.id));

      const wk = (parsed.subject ?? '').match(WEEKLY_SUBJECT_RE);
      const isWeekly =
        !!wk && (parsed.fromEmail ?? '').toLowerCase() === WEEKLY_SENDER;
      const weekNumber = wk ? `WK${wk[1]}` : null;

      const isWalmartOrders =
        WALMART_ORDERS_SUBJECT_RE.test(parsed.subject ?? '') &&
        (parsed.fromEmail ?? '').toLowerCase() === WALMART_ORDERS_SENDER;

      const label: Classification = isWeekly ? 'weekly_report' : isWalmartOrders ? 'walmart_orders' : 'other';

      const { error } = await supabase.from('gmail_messages').insert({
        gmail_message_id: parsed.id,
        gmail_thread_id: parsed.threadId,
        internal_date: parsed.internalDate,
        from_email: parsed.fromEmail,
        from_name: parsed.fromName,
        subject: parsed.subject,
        snippet: parsed.snippet,
        classification: label,
        classified_at: new Date().toISOString(),
        processed: false,
        raw: {
          attachments: parsed.attachments.map((a) => ({
            filename: a.filename,
            attachmentId: a.attachmentId,
            mimeType: a.mimeType,
          })),
          ...(weekNumber ? { week_number: weekNumber } : {}),
        },
      });
      if (error) {
        // Likely a unique-violation race on gmail_message_id — treat as skipped.
        skipped++;
        continue;
      }
      classified++;
    }

    const now = new Date().toISOString();
    if (state) {
      await supabase
        .from('gmail_sync_state')
        .update({ last_polled_at: now, last_poll_count: classified, updated_at: now })
        .eq('id', state.id);
    } else {
      await supabase.from('gmail_sync_state').insert({ last_polled_at: now, last_poll_count: classified });
    }

    // Tail-call the extractor (service-role bearer satisfies its verify_jwt).
    let extract: unknown = null;
    try {
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/gmail-extract`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ trigger: 'poll' }),
      });
      extract = await res.json();
    } catch (e) {
      extract = { error: String((e as Error)?.message ?? e) };
    }

    return json({ ok: true, scanned: ids.length, classified, skipped, extract });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
