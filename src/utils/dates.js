// Date helpers shared across PO views.

// A Postgres `date` column arrives as a bare 'YYYY-MM-DD' with no timezone, and
// `new Date('2026-08-18')` parses that as UTC midnight — which is the PREVIOUS
// evening anywhere west of Greenwich. Everything downstream then reads a day
// early: labels render the wrong date, and `daysUntil` returns one less than the
// truth, so a PO due today reports as a day late.
//
// The match is anchored at BOTH ends on purpose. A prefix match would also catch
// the leading date of an ISO timestamp ('2026-08-18T14:30:00Z') and strip the
// time and zone off a value that was already correct. Only a bare date, alone,
// takes the local-midnight branch; everything else goes through `new Date`,
// which is right for anything carrying a zone.
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function toDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  const m = DATE_ONLY.exec(String(value).trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

// Whole days from today until `date` (negative = past). null-safe.
export function daysUntil(date) {
  if (!date) return null;
  const d = toDate(date);
  if (isNaN(d)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

// Short display: "May 28". Returns "--" for empty.
// Correct for both a bare 'YYYY-MM-DD' and a real timestamp — see `toDate`.
export function formatDate(date) {
  if (!date) return '--';
  const d = toDate(date);
  if (isNaN(d)) return '--';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Longer display with time: "May 18, 3:20 PM". Returns "never" for empty.
export function formatDateTime(ts) {
  if (!ts) return 'never';
  const d = new Date(ts);
  if (isNaN(d)) return 'never';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// A step is late when both dates exist and actual is after planned.
export function isLate(planned, actual) {
  if (!planned || !actual) return false;
  const p = new Date(planned);
  const a = new Date(actual);
  if (isNaN(p) || isNaN(a)) return false;
  return a > p;
}
