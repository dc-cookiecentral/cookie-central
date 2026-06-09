// Pure helpers for BOM derivation, run-rate, lead-time parsing, and reorder
// math. Shared by the Reference > Raw Materials overview and the Inventory >
// Reorder Calculator so both compute identically.

export const WEEK_MS = 7 * 86400000;

// Free-form lead time ("1-2 days", "2 wks", "6-8 wks", "1 week", "1 month") →
// whole days. Uses the UPPER bound of a range (conservative for one distributor).
export function parseLeadDays(text) {
  if (text == null) return null;
  const m = String(text)
    .toLowerCase()
    .match(/(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*(months?|mo|weeks?|wks?|w|days?|d)\b/);
  if (!m) return null;
  const hi = Number(m[2] ?? m[1]);
  if (!Number.isFinite(hi)) return null;
  const unit = m[3];
  if (unit.startsWith('mo') || unit.startsWith('month')) return Math.round(hi * 30);
  if (unit.startsWith('w')) return Math.round(hi * 7);
  return Math.round(hi);
}

// Shortest (min) lead across a set of supplier rows' lead_time_text.
export function shortestLeadDays(suppliers) {
  const days = (suppliers ?? []).map((s) => parseLeadDays(s.lead_time_text)).filter((d) => d != null);
  return days.length ? Math.min(...days) : null;
}

// Weighted-average cost across brand variants, weighting cost_per_unit by the
// on-hand qty of the matching inventory row (by DC item #); simple mean if no
// on-hand to weight by.
export function avgCogs(suppliers, onHandByCode) {
  const rows = (suppliers ?? []).filter((s) => s.cost_per_unit != null);
  if (!rows.length) return null;
  let wsum = 0;
  let w = 0;
  for (const s of rows) {
    const oh = Number(onHandByCode?.[String(s.dc_item_number)] ?? 0);
    if (oh > 0) {
      wsum += Number(s.cost_per_unit) * oh;
      w += oh;
    }
  }
  if (w > 0) return wsum / w;
  return rows.reduce((a, s) => a + Number(s.cost_per_unit), 0) / rows.length;
}

// Build a code → ingredient resolver from inventory + supplier rows (both carry
// an embedded ingredient_catalog). Keyed by DC item # / raw-material code.
export function buildCodeMap(rawMaterials, suppliers) {
  const map = new Map();
  const put = (code, ingId, cat) => {
    if (code == null || !ingId) return;
    const key = String(code).trim();
    if (!key || map.has(key)) return;
    map.set(key, { ingredientId: ingId, name: cat?.name ?? null, unit: cat?.unit ?? null, category: cat?.category ?? null });
  };
  for (const s of suppliers ?? []) put(s.dc_item_number, s.ingredient_id, s.ingredient_catalog);
  for (const r of rawMaterials ?? []) put(r.code, r.ingredient_id, r.ingredient_catalog);
  return map;
}

// Resolve a production subcomponent to an ingredient identity, falling back to
// its own description when the code isn't a catalog DC item # (intermediate
// batches, slip sheets, etc.).
export function resolveIngredient(code, description, codeMap) {
  const hit = code != null ? codeMap.get(String(code).trim()) : null;
  if (hit) {
    return { key: `ing:${hit.ingredientId}`, name: hit.name, unit: hit.unit, category: hit.category, linked: true };
  }
  const name = description || code || 'Unknown';
  return { key: `desc:${name}`, name, unit: null, category: null, linked: false };
}

// Weekly consumption per ingredient from production_subcomponents.
// Returns { rates: Map(key → {key,name,unit,totalUsed,perWeek}), spanWeeks, minDate, maxDate }.
export function buildRunRates(subs, runs, codeMap) {
  const runDate = new Map((runs ?? []).map((r) => [r.id, r.produced_date]));
  const acc = new Map();
  let minD = null;
  let maxD = null;
  for (const s of subs ?? []) {
    const used = Number(s.quantity_used) || 0;
    if (!used) continue;
    const ing = resolveIngredient(s.subcomponent_code, s.subcomponent_description, codeMap);
    const e = acc.get(ing.key) ?? { key: ing.key, name: ing.name, unit: s.unit_of_measure, totalUsed: 0 };
    e.totalUsed += used;
    acc.set(ing.key, e);
    const d = runDate.get(s.run_id);
    if (d) {
      if (!minD || d < minD) minD = d;
      if (!maxD || d > maxD) maxD = d;
    }
  }
  const spanWeeks = minD && maxD ? Math.max(1, (new Date(maxD) - new Date(minD)) / WEEK_MS) : 1;
  for (const e of acc.values()) e.perWeek = e.totalUsed / spanWeeks;
  return { rates: acc, spanWeeks, minDate: minD, maxDate: maxD };
}

// Derive a per-case BOM for a SKU from production runs + subcomponents.
// perCase = quantity_used / quantity_produced (reject already baked into
// quantity_used = consumed + rejected). Returns lines + provenance.
export function deriveBom(sku, runs, subs, codeMap) {
  const matched = (runs ?? []).filter(
    (r) => (r.fg_item_code === sku || r.fg_item_description === sku) && Number(r.quantity_produced) > 0
  );
  const runIds = new Set(matched.map((r) => r.id));
  const totalProduced = matched.reduce((a, r) => a + Number(r.quantity_produced), 0);
  const jobs = [...new Set(matched.map((r) => r.job_id).filter(Boolean))];
  if (!totalProduced || !runIds.size) {
    return { lines: [], jobs, runCount: matched.length, totalProduced: 0, found: false };
  }

  const byIng = new Map();
  for (const s of subs ?? []) {
    if (!runIds.has(s.run_id)) continue;
    const ing = resolveIngredient(s.subcomponent_code, s.subcomponent_description, codeMap);
    const e =
      byIng.get(ing.key) ??
      {
        key: ing.key,
        code: s.subcomponent_code,
        name: ing.name,
        unit: s.unit_of_measure,
        used: 0,
        consumed: 0,
        rejected: 0,
        linked: ing.linked,
      };
    e.used += Number(s.quantity_used) || 0;
    e.consumed += Number(s.quantity_consumed) || 0;
    e.rejected += Number(s.quantity_rejected) || 0;
    byIng.set(ing.key, e);
  }

  const lines = [...byIng.values()]
    .map((e) => ({
      key: e.key,
      code: e.code,
      name: e.name,
      unit: e.unit,
      perCase: e.used / totalProduced, // order requirement, reject baked in
      netPerCase: e.consumed / totalProduced, // net into the product
      rejectPct: e.used > 0 ? (e.rejected / e.used) * 100 : 0,
      yieldFactor: e.consumed > 0 ? e.used / e.consumed : 1,
      linked: e.linked,
      jobs,
    }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return { lines, jobs, runCount: matched.length, totalProduced, found: true };
}

// Reorder urgency tier from weeks-until-order. ≤1 red, ≤2 yellow, else green.
export function reorderTier(weeks) {
  if (weeks == null) return null;
  if (weeks <= 1) return 'red';
  if (weeks <= 2) return 'yellow';
  return 'green';
}

// Recommendation sentence for a Reference ingredient row.
export function recommendation({ netWeeks, leadDays, expiringQty, runRate }) {
  if (runRate == null || runRate <= 0) return null;
  const leadWeeks = leadDays != null ? leadDays / 7 : 0;
  if (netWeeks <= leadWeeks) {
    const exp = expiringQty > 0 ? ` after ${Math.round(expiringQty).toLocaleString()} expiring units` : '';
    const lead = leadDays != null ? ` and ${leadDays}-day lead time` : '';
    return `Order now — ${Math.max(0, netWeeks).toFixed(1)} weeks until stockout${exp}${lead}`;
  }
  return `OK — ${netWeeks.toFixed(1)} weeks of supply`;
}

export const num = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
