import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createRawMaterialOrders } from './useRawMaterialOrders';

// ── Scenario list + CRUD ────────────────────────────────────────────────────
export function useScenarios() {
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('production_scenarios')
      .select('id, name, status, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setScenarios(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { scenarios, loading, error, refresh };
}

export async function createScenario(name) {
  const { data, error } = await supabase
    .from('production_scenarios')
    .insert({ name: name?.trim() || 'Untitled scenario' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateScenarioStatus(id, status) {
  const { error } = await supabase.from('production_scenarios').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function deleteScenario(id) {
  const { error } = await supabase.from('production_scenarios').delete().eq('id', id);
  if (error) throw error;
}

// ── Runs for a scenario ─────────────────────────────────────────────────────
export function useScenarioRuns(scenarioId) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!scenarioId) {
      setRuns([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('scenario_runs')
      .select('id, product_sku, quantity_cases, run_date')
      .eq('scenario_id', scenarioId)
      .order('run_date');
    setRuns(data ?? []);
    setLoading(false);
  }, [scenarioId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { runs, loading, refresh };
}

export async function addScenarioRun(scenarioId, { product_sku, quantity_cases, run_date }) {
  const { error } = await supabase.from('scenario_runs').insert({
    scenario_id: scenarioId,
    product_sku,
    quantity_cases: Number(quantity_cases) || 0,
    run_date,
  });
  if (error) throw error;
}

export async function deleteScenarioRun(id) {
  const { error } = await supabase.from('scenario_runs').delete().eq('id', id);
  if (error) throw error;
}

// ── BOM overrides ───────────────────────────────────────────────────────────
export function useBomOverrides() {
  const [overrides, setOverrides] = useState([]);
  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('bom_overrides')
      .select('product_sku, ingredient_code, ingredient_name, quantity_per_case, unit, yield_factor, source, derived_from_jobs');
    setOverrides(data ?? []);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  // Keyed lookup: `${sku}::${code}`
  const map = new Map((overrides ?? []).map((o) => [`${o.product_sku}::${o.ingredient_code}`, o]));
  return { overrides, map, refresh };
}

export async function saveBomOverride(row) {
  const { error } = await supabase.from('bom_overrides').upsert(
    {
      product_sku: row.product_sku,
      ingredient_code: row.ingredient_code,
      ingredient_name: row.ingredient_name ?? null,
      quantity_per_case: row.quantity_per_case,
      unit: row.unit ?? 'ea',
      yield_factor: row.yield_factor ?? 1.0,
      source: 'adjusted',
      derived_from_jobs: row.derived_from_jobs ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'product_sku,ingredient_code' }
  );
  if (error) throw error;
}

export async function resetBomOverride(product_sku, ingredient_code) {
  const { error } = await supabase
    .from('bom_overrides')
    .delete()
    .eq('product_sku', product_sku)
    .eq('ingredient_code', ingredient_code);
  if (error) throw error;
}

// ── Generate orders from the deficit lines of a scenario explosion ──────────
// deficitLines: [{ rawMaterialId, distributor, brand, supplierId, costPerUnit,
//                  leadDays, quantity }]
export async function generateScenarioOrders(deficitLines) {
  // Group by distributor + brand so each group reads back as one PO. order_group_id
  // is a synthetic per-group token (timestamp + index) — matches the Reorder flow.
  const groups = new Map();
  for (const l of deficitLines) {
    const gk = `${l.distributor ?? '—'}::${l.brand ?? '—'}`;
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk).push(l);
  }
  const stamp = new Date().toISOString();
  const rows = [];
  let gi = 0;
  for (const [, lines] of groups) {
    const groupId = `${stamp}-${gi++}`;
    for (const l of lines) {
      if (!l.rawMaterialId) continue; // can't create an order without an inventory row
      rows.push({
        raw_material_id: l.rawMaterialId,
        supplier_id: l.supplierId ?? null,
        distributor: l.distributor ?? null,
        brand: l.brand ?? null,
        quantity: l.quantity,
        cost_per_unit: l.costPerUnit ?? null,
        lead_time_days: l.leadDays ?? null,
        order_group_id: groupId,
      });
    }
  }
  if (!rows.length) return { created: 0 };
  return createRawMaterialOrders(rows);
}
