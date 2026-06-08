// Shared topline rollup: collapse vendor-specific raw_materials inventory rows
// into their normalized ingredient (raw_materials.ingredient_id →
// ingredient_catalog). Items linked to the catalog group together; unlinked
// items (FG batch / rework SKUs with no DC item #) stand alone under their own
// name. Used by both the Reference > Raw Materials list and the Inventory
// warehouse view so the two stay in lockstep.

// Worst of a set of expiry statuses (partial_expired > almost_expired > good).
export function worstStatus(statuses) {
  if (statuses.has('partial_expired')) return 'partial_expired';
  if (statuses.has('almost_expired')) return 'almost_expired';
  return 'good';
}

// Group raw_materials rows by normalized ingredient. Each group:
//   { key, name, unit, linked, items[], total (sum on-hand), statuses (Set) }
// Rows are expected to embed `ingredient_catalog ( id, name )`.
export function groupByIngredient(materials) {
  const map = new Map();
  for (const m of materials) {
    const cat = m.ingredient_catalog;
    const key = cat?.id ? `cat:${cat.id}` : `raw:${m.code}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: cat?.name || m.name,
        unit: m.unit,
        linked: !!cat?.id,
        items: [],
        total: 0,
        statuses: new Set(),
      });
    }
    const g = map.get(key);
    g.items.push(m);
    g.total += m.quantity || 0;
    g.statuses.add(m.expiry_status || 'good');
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
