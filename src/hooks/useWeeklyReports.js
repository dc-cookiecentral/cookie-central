import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { WEEKLY_REPORTS } from '../data/weeklyReports';
import { formatDate } from '../utils/dates';

// The /weekly page historically rendered from the static WEEKLY_REPORTS seed
// (WK13–16). The Phase-2 email agent now writes live weeks into the
// weekly_reports table (auto_generated=true), so this hook fetches those and
// merges them with the seed — DB rows win on a week conflict, seed fills weeks
// the DB doesn't have — sorted newest-first.

const wkNum = (wk) => parseInt(String(wk).replace(/\D/g, ''), 10) || 0;

// Map a weekly_reports row into the display record shape WeeklyReport.jsx
// expects (same shape importWeekly / weeklyReportFromParts produce).
function rowToReport(row) {
  const raw = row.raw_email_data || {};
  return {
    wk: row.week_number,
    dt: formatDate(row.received_at || row.report_date),
    src: row.source_email,
    subj: row.source_subject,
    hl: row.headline,
    kpis: Array.isArray(row.kpis) ? row.kpis : [],
    findings: Array.isArray(row.findings) ? row.findings : [],
    todos: Array.isArray(row.todos) ? row.todos : [],
    attachments: raw.attachments || [],
    images: row.image_attachments || raw.image_attachments || [],
    pos: raw.pos,
    otif: raw.otif,
    parsed: false, // agent-ingested → "Auto from email" badge (no attachment detail yet)
  };
}

export function useWeeklyReports() {
  // Seed-first so the page renders immediately; DB merges in once it loads.
  const [reports, setReports] = useState(() =>
    [...WEEKLY_REPORTS].sort((a, b) => wkNum(b.wk) - wkNum(a.wk))
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase
      .from('weekly_reports')
      .select(
        `week_number, report_date, headline, kpis, findings, todos,
         source_email, source_subject, received_at, auto_generated, raw_email_data,
         image_attachments`
      )
      .then(({ data, error }) => {
        if (!active) return;
        if (!error && data) {
          const byWk = new Map(WEEKLY_REPORTS.map((r) => [r.wk, r]));
          for (const row of data) byWk.set(row.week_number, rowToReport(row)); // DB wins
          setReports([...byWk.values()].sort((a, b) => wkNum(b.wk) - wkNum(a.wk)));
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { reports, loading };
}
