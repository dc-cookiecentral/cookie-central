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

// A step is late when both dates exist and actual is after planned.
export function isLate(planned, actual) {
  if (!planned || !actual) return false;
  const p = new Date(planned);
  const a = new Date(actual);
  if (isNaN(p) || isNaN(a)) return false;
  return a > p;
}
