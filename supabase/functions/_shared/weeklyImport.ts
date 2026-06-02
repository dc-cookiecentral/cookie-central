import type { SupabaseClient } from '@supabase/supabase-js';
// Reuse the existing, dependency-free weekly parser (built for this exact
// server path — see src/parsers/weeklyEmail.js header lines 4-6). We only add
// the weekly_reports writer, which doesn't exist on the frontend yet.
import { weeklyReportFromParts } from '../../../src/parsers/weeklyEmail.js';

function safeIso(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Parse the Bentonville weekly email body and upsert one weekly_reports row
// (keyed by week_number — re-ingesting the same WK updates in place). The .xlsx
// attachments are a TBD format (memory: weekly-email-format); their filenames
// are recorded in raw_email_data but not parsed here.
export async function importWeekly(
  supabase: SupabaseClient,
  email: {
    subject: string | null;
    from: string | null;
    date: string | null;
    body: string;
    attachments: { filename: string }[];
  },
): Promise<{ id: string; week_number: string }> {
  const rep = weeklyReportFromParts({
    subject: email.subject,
    date: email.date,
    from: email.from,
    plainBody: email.body,
    attachments: email.attachments.map((a) => a.filename),
  });

  const receivedAt = safeIso(email.date);
  const row = {
    week_number: rep.wk,
    report_date: receivedAt ? receivedAt.slice(0, 10) : null,
    headline: rep.hl || null,
    kpis: rep.kpis ?? null,
    findings: rep.findings ?? null,
    todos: rep.todos ?? null,
    source_email: rep.src || email.from,
    source_subject: rep.subj || email.subject,
    received_at: receivedAt,
    auto_generated: true,
    retailer_scope: 'Walmart',
    raw_email_data: { pos: rep.pos, otif: rep.otif, attachments: rep.attachments },
  };

  // weekly_reports has no unique constraint on week_number, so emulate an upsert:
  // update the existing WK row if present, else insert.
  const { data: existing } = await supabase
    .from('weekly_reports')
    .select('id')
    .eq('week_number', row.week_number)
    .limit(1);

  if (existing && existing.length) {
    await supabase.from('weekly_reports').update(row).eq('id', existing[0].id);
    return { id: existing[0].id, week_number: row.week_number };
  }
  const { data, error } = await supabase
    .from('weekly_reports')
    .insert(row)
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id, week_number: row.week_number };
}
