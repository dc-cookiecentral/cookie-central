import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Spec Sheet (Cookulator) data layer. Fetches the whole product spine plus the
// price_list view in parallel and exposes it as one `data` object. Every level
// is table-backed (Task 1.6); derived values (storage, net weight) are computed
// client-side via utils/cookulator.js and in the price_list view — never stored.

const SOURCES = [
  ['rawDoughs', 'raw_doughs', 'raw_sku'],
  ['wipDoughs', 'wip_doughs', 'wip_sku'],
  ['stuffings', 'stuffings', 'stuffing_id'],
  ['products', 'products', 'code'],
  ['eaches', 'eaches', 'each_sku'],
  ['inners', 'inners', 'inner_sku'],
  ['masterCases', 'master_cases', 'case_id'],
  ['priceList', 'price_list', 'case_id'],
];

export function useSpecSheet() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(SOURCES.map(([, table]) => supabase.from(table).select('*')));
    const failed = results.find((r) => r.error);
    if (failed) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }
    const next = {};
    SOURCES.forEach(([key], i) => {
      next[key] = results[i].data ?? [];
    });
    setData(next);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

// ── Mutations. Writes are RLS-gated (spine = admin/ops; product_prices =
// admin/finance), so a non-authorized role gets an error surfaced to the caller.

// Insert or update one row, keyed by the table's natural unique column.
export async function saveSpecRow(table, conflictKey, row) {
  const { error } = await supabase.from(table).upsert(row, { onConflict: conflictKey });
  return { error };
}

export async function deleteSpecRow(table, keyCol, keyVal) {
  const { error } = await supabase.from(table).delete().eq(keyCol, keyVal);
  return { error };
}

// Sample-eligibility toggle (Cookies / Eaches / Inner / Master tabs, edit mode).
export async function toggleSampleEligible(table, keyCol, keyVal, next) {
  const { error } = await supabase.from(table).update({ sample_eligible: next }).eq(keyCol, keyVal);
  return { error };
}
