// Week arithmetic for the EOS scorecard.
//
// A scorecard week is a Monday-start ISO week and is keyed by its Monday
// (`week_start`). The Level 10 meeting runs on TUESDAY, so at the meeting the
// team is filling in the week that closed the day before. Keeping the key on
// Monday rather than the meeting date means changing the meeting day never
// re-buckets history — the meeting day is presentation, not identity.
//
// Everything here is local-midnight arithmetic on purpose. `new Date('2026-08-17')`
// parses as UTC and can land on the previous day west of Greenwich, which would
// silently shift a whole column of numbers into the wrong week.

export const L10_MEETING_DAY = 2; // Tuesday (1 = Monday … 7 = Sunday, ISO)

// 'YYYY-MM-DD' → local Date at midnight. Also accepts a Date.
export function parseDate(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// Local Date → 'YYYY-MM-DD' (never toISOString, which converts to UTC).
export function toISODate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// The Monday of the week containing `date`, as 'YYYY-MM-DD'.
export function weekStartOf(date = new Date()) {
  const d = parseDate(date) || new Date();
  const dow = d.getDay() === 0 ? 7 : d.getDay(); // Sunday(0) → 7
  d.setDate(d.getDate() - (dow - 1));
  return toISODate(d);
}

export function addWeeks(weekStart, n) {
  const d = parseDate(weekStart);
  d.setDate(d.getDate() + n * 7);
  return toISODate(d);
}

// The week the scorecard should open on: the one that has closed. On Monday the
// current week has barely begun and has no numbers yet, so the meeting is always
// about the week before.
export function currentScorecardWeek(today = new Date()) {
  return addWeeks(weekStartOf(today), -1);
}

// n consecutive week_starts ending at `endWeek`, oldest first.
export function weekRange(endWeek, n) {
  return Array.from({ length: n }, (_, i) => addWeeks(endWeek, i - (n - 1)));
}

// 'Aug 17' — the column header on the trend grid.
export function weekLabel(weekStart) {
  const d = parseDate(weekStart);
  if (!d) return '--';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// 'Aug 17 – Aug 23, 2026' — the full span, for the week the meeting is on.
export function weekSpanLabel(weekStart) {
  const a = parseDate(weekStart);
  if (!a) return '--';
  const b = new Date(a);
  b.setDate(b.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${a.toLocaleDateString(undefined, opts)} – ${b.toLocaleDateString(undefined, opts)}, ${b.getFullYear()}`;
}

// The date the Level 10 for `weekStart` is held: the Tuesday AFTER the week
// closes, since the meeting reviews the completed week.
export function meetingDateFor(weekStart) {
  const d = parseDate(weekStart);
  d.setDate(d.getDate() + 7 + (L10_MEETING_DAY - 1));
  return toISODate(d);
}

// '2026-Q3' for a given date — how Rocks are labelled.
export function quarterOf(date = new Date()) {
  const d = parseDate(date) || new Date();
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

// ── Scoring ────────────────────────────────────────────────────────────────
// Green / yellow / red against the metric's CURRENT goal. Yellow is the near
// miss — within 10% of goal on the wrong side — which is the band EOS teams use
// to separate "watch it" from "it's an issue". A metric with no goal yet is
// 'none': the number shows, uncoloured, because inventing a target during the
// baseline period would be worse than showing nothing.
export function scoreEntry(metric, value) {
  if (value == null || value === '') return 'empty';
  const v = Number(value);
  if (!Number.isFinite(v)) return 'empty';
  const goal = metric?.goal_value;
  if (goal == null) return 'none';
  const g = Number(goal);

  if (metric.goal_direction === 'between') {
    const hi = Number(metric.goal_max);
    if (v >= g && v <= hi) return 'green';
    const span = Math.abs(hi - g) || Math.abs(g) || 1;
    const miss = v < g ? g - v : v - hi;
    return miss <= span * 0.1 ? 'yellow' : 'red';
  }

  const tolerance = Math.abs(g) * 0.1;
  if (metric.goal_direction === 'lte') {
    if (v <= g) return 'green';
    return v <= g + tolerance ? 'yellow' : 'red';
  }
  if (v >= g) return 'green';
  return v >= g - tolerance ? 'yellow' : 'red';
}

// ── Display ────────────────────────────────────────────────────────────────
export function formatMetricValue(metric, value) {
  if (value == null || value === '') return '';
  const v = Number(value);
  if (!Number.isFinite(v)) return String(value);
  switch (metric?.unit) {
    case 'usd':
      return Math.abs(v) >= 10000
        ? '$' + Math.round(v / 1000).toLocaleString() + 'k'
        : '$' + Math.round(v).toLocaleString();
    case 'percent':
      return `${Math.round(v * 10) / 10}%`;
    case 'days':
      return `${Math.round(v * 10) / 10}d`;
    default:
      return (Math.round(v * 100) / 100).toLocaleString();
  }
}

export function formatGoal(metric) {
  if (!metric || metric.goal_value == null) return 'baselining';
  const v = formatMetricValue(metric, metric.goal_value);
  if (metric.goal_direction === 'between') {
    return `${v}–${formatMetricValue(metric, metric.goal_max)}`;
  }
  return (metric.goal_direction === 'lte' ? '≤ ' : '≥ ') + v;
}
