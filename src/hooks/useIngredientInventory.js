import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { shortestLeadDays } from '../utils/bom';

// Per-ingredient inventory keyed the same way the BOM resolver keys ingredients
// (`ing:<catalog id>`), so the Reorder Calculator can join BOM lines to on-hand,
// lots (for expiring-before-run), lead time, and a representative supplier +
// raw_material_id for order generation.
export function useIngredientInventory() {
  const [rawMaterials, setRawMaterials] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [rmR, catR] = await Promise.all([
        supabase
          .from('raw_materials')
          .select('id, code, ingredient_id, quantity, unit, raw_material_lots ( lot_number, quantity, expiry_date )')
          .not('ingredient_id', 'is', null),
        supabase
          .from('ingredient_catalog')
          .select('id, name, unit, ingredient_suppliers ( id, brand, distributor, dc_item_number, cost_per_unit, lead_time_text )'),
      ]);
      if (!active) return;
      if (rmR.error || catR.error) setError((rmR.error || catR.error).message);
      else {
        setRawMaterials(rmR.data ?? []);
        setCatalog(catR.data ?? []);
        setError(null);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Map `ing:<id>` → { name, unit, onHand, lots[], leadDays, suppliers[], rawMaterialId }
  const byKey = useMemo(() => {
    const cat = new Map(catalog.map((c) => [c.id, c]));
    const map = new Map();
    for (const rm of rawMaterials) {
      const key = `ing:${rm.ingredient_id}`;
      const c = cat.get(rm.ingredient_id);
      const e =
        map.get(key) ??
        {
          key,
          name: c?.name ?? null,
          unit: rm.unit || c?.unit || null,
          onHand: 0,
          lots: [],
          rawMaterialId: rm.id, // representative row for order generation
          suppliers: c?.ingredient_suppliers ?? [],
          leadDays: shortestLeadDays(c?.ingredient_suppliers),
        };
      e.onHand += Number(rm.quantity) || 0;
      for (const lot of rm.raw_material_lots ?? []) {
        e.lots.push({
          lot_number: lot.lot_number,
          quantity: Number(lot.quantity) || 0,
          expiry_date: lot.expiry_date,
          ingredient: c?.name ?? null,
        });
      }
      map.set(key, e);
    }
    return map;
  }, [rawMaterials, catalog]);

  return { byKey, loading, error };
}
