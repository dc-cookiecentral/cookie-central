import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { buildCodeMap, buildRunRates, deriveBom } from '../utils/bom';

// Loads the production feed (runs + subcomponents) plus the code→ingredient
// resolver inputs, and exposes:
//   deriveBomFor(sku)     — per-case BOM derived from production history
//   runRate(ingredientId) — weekly consumption for a catalog ingredient
//   skuOptions            — distinct produced SKUs (have BOMs)
export function useProductionData() {
  const [runs, setRuns] = useState([]);
  const [subs, setSubs] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [runsR, subsR, rmR, supR] = await Promise.all([
      supabase
        .from('production_runs')
        .select('id, job_id, fg_item_code, fg_item_description, quantity_produced, quantity_unit, produced_date'),
      supabase
        .from('production_subcomponents')
        .select('run_id, subcomponent_code, subcomponent_description, quantity_consumed, quantity_rejected, quantity_used, unit_of_measure, reject_pct'),
      supabase.from('raw_materials').select('code, ingredient_id, ingredient_catalog ( name, unit, category )'),
      supabase.from('ingredient_suppliers').select('dc_item_number, ingredient_id, ingredient_catalog ( name, unit, category )'),
    ]);
    const firstErr = runsR.error || subsR.error || rmR.error || supR.error;
    if (firstErr) setError(firstErr.message);
    else {
      setRuns(runsR.data ?? []);
      setSubs(subsR.data ?? []);
      setRawMaterials(rmR.data ?? []);
      setSuppliers(supR.data ?? []);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const codeMap = useMemo(() => buildCodeMap(rawMaterials, suppliers), [rawMaterials, suppliers]);
  const runRates = useMemo(() => buildRunRates(subs, runs, codeMap), [subs, runs, codeMap]);

  const deriveBomFor = useCallback((sku) => deriveBom(sku, runs, subs, codeMap), [runs, subs, codeMap]);

  // Weekly run rate for a catalog ingredient id (null if no production history).
  const runRate = useCallback(
    (ingredientId) => runRates.rates.get(`ing:${ingredientId}`)?.perWeek ?? null,
    [runRates]
  );

  const skuOptions = useMemo(() => {
    const seen = new Map();
    for (const r of runs) {
      if (!r.fg_item_code) continue;
      if (!seen.has(r.fg_item_code)) {
        seen.set(r.fg_item_code, { value: r.fg_item_code, label: r.fg_item_description || r.fg_item_code });
      }
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [runs]);

  return { runs, subs, codeMap, runRates, deriveBomFor, runRate, skuOptions, loading, error, refresh };
}
