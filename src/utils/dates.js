// Date helpers shared across PO views.

// Whole days from today until `date` (negative = past). null-safe.
export function daysUntil(date) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

// Short display: "May 28". Returns "--" for empty.
export function formatDate(date) {
  if (!date) return '--';
  const d = new Date(date);
  if (isNaN(d)) return '--';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Short display for a DATE-ONLY value: "May 28". Returns "--" for empty.
//
// Use this, not formatDate, for anything backed by a Postgres `date` column or
// any bare 'YYYY-MM-DD' string. `new Date('2026-08-18')` parses as UTC midnight,
// which is the *previous evening* anywhere west of Greenwich — so the date
// renders a day early. Parsing the parts by hand pins it to local midnight.
// `formatDate` stays correct for real timestamps, which carry a zone.
export function formatDateOnly(value) {
  if (!value) return '--';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
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
