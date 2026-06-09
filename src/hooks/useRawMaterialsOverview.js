import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useProductionData } from './useProductionData';
import { avgCogs, shortestLeadDays, reorderTier, recommendation } from '../utils/bom';

const EXPIRY_SOON_DAYS = 30;

// Type grouping for the Reference > Raw Materials tab.
const TYPE_OF = { raw_material: 'Ingredients', wip: 'Ingredients', finished_good: 'Finished Goods', packaging: 'Packaging' };
const TYPE_ORDER = ['Ingredients', 'Finished Goods', 'Packaging'];

// One analytics row per normalized ingredient (ingredient_catalog), grouped by
// type. Combines the ingredient master (cost / lead / MOQ / shelf life per
// brand), live Assemblers inventory (on hand + expiring lots), and the
// production run rate to derive weeks-on-hand, reorder timing, and a
// recommendation.
export function useRawMaterialsOverview() {
  const prod = useProductionData();
  const [catalog, setCatalog] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [catR, rmR] = await Promise.all([
        supabase
          .from('ingredient_catalog')
          .select(
            `id, name, unit, category,
             ingredient_suppliers ( id, brand, distributor, dc_item_number, supplier_number, pkg_type,
               qty_per_package, cost, cost_per_unit, moq, lead_time_text, shelf_life_text )`
          )
          .order('name'),
        supabase
          .from('raw_materials')
          .select('id, code, ingredient_id, quantity, unit, raw_material_lots ( quantity, expiry_date )')
          .not('ingredient_id', 'is', null),
      ]);
      if (!active) return;
      if (catR.error || rmR.error) setError((catR.error || rmR.error).message);
      else {
        setCatalog(catR.data ?? []);
        setRawMaterials(rmR.data ?? []);
        setError(null);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const groups = useMemo(() => {
    // Inventory aggregates per ingredient + a global code→on-hand map (for COGS).
    const onHandByIngredient = new Map();
    const expiringByIngredient = new Map();
    const onHandByCode = {};
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + EXPIRY_SOON_DAYS);

    for (const rm of rawMaterials) {
      const q = Number(rm.quantity) || 0;
      onHandByIngredient.set(rm.ingredient_id, (onHandByIngredient.get(rm.ingredient_id) || 0) + q);
      if (rm.code != null) onHandByCode[String(rm.code)] = (onHandByCode[String(rm.code)] || 0) + q;
      let exp = 0;
      for (const lot of rm.raw_material_lots ?? []) {
        if (lot.expiry_date && new Date(lot.expiry_date) <= cutoff) exp += Number(lot.quantity) || 0;
      }
      if (exp) expiringByIngredient.set(rm.ingredient_id, (expiringByIngredient.get(rm.ingredient_id) || 0) + exp);
    }

    const rows = catalog.map((ing) => {
      const suppliers = (ing.ingredient_suppliers ?? [])
        .slice()
        .sort((a, b) => (a.cost_per_unit ?? Infinity) - (b.cost_per_unit ?? Infinity));
      const onHand = onHandByIngredient.get(ing.id) ?? 0;
      const expiring = expiringByIngredient.get(ing.id) ?? 0;
      const netAvailable = Math.max(0, onHand - expiring);
      const runRate = prod.runRate(ing.id); // weekly; null if no production history
      const leadDays = shortestLeadDays(suppliers);
      const cogs = avgCogs(suppliers, onHandByCode);

      const weeksOnHand = runRate ? onHand / runRate : null;
      const netWeeks = runRate ? netAvailable / runRate : null;
      const reorderByWeeks = netWeeks != null ? netWeeks - (leadDays != null ? leadDays / 7 : 0) : null;

      return {
        id: ing.id,
        name: ing.name,
        type: TYPE_OF[ing.category] ?? 'Ingredients',
        unit: ing.unit,
        avgCogs: cogs,
        onHand,
        runRate,
        weeksOnHand,
        expiring,
        netAvailable,
        netWeeks,
        leadDays,
        reorderByWeeks,
        reorderTier: reorderTier(reorderByWeeks),
        recommendation: recommendation({ netWeeks, leadDays, expiringQty: expiring, runRate }),
        suppliers,
      };
    });

    const byType = new Map(TYPE_ORDER.map((t) => [t, []]));
    for (const r of rows) (byType.get(r.type) ?? byType.set(r.type, []).get(r.type)).push(r);
    return TYPE_ORDER.filter((t) => (byType.get(t) ?? []).length).map((t) => ({
      type: t,
      rows: byType.get(t).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [catalog, rawMaterials, prod]);

  return { groups, loading: loading || prod.loading, error: error || prod.error };
}
