import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Supplies & Vendors data layer (docs/SUPPLIES_SPEC.md, Phase V1 — read-only).
// Fetches the whole supplies model plus the v_sku_pricing view in parallel.
// $/lb and $/1,000 come from the view — never computed or stored client-side.

const SOURCES = [
  ['vendors', 'vendors'],
  ['contacts', 'vendor_contacts'],
  ['items', 'supply_items'],
  ['skus', 'supply_skus'],
  ['quotes', 'quotes'],
  ['pricing', 'v_sku_pricing'],
];

export function useSupplies() {
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

// The `supply-docs` bucket is private: open an original through a short-lived
// signed URL. The tab is opened synchronously (before the await) so popup
// blockers treat it as part of the click.
export async function openSupplyDoc(path) {
  const tab = window.open('', '_blank');
  const { data, error } = await supabase.storage.from('supply-docs').createSignedUrl(path, 300);
  if (error) {
    tab?.close();
    window.alert(`Couldn't open document: ${error.message}`);
    return;
  }
  if (tab) tab.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
}
