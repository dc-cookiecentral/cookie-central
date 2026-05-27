import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Latest DOT snapshot per SKU. dot_inventory accumulates snapshots over time;
// we keep the most recent row per SKU and report the newest snapshot_date.
export function useDotInventory() {
  const [rows, setRows] = useState([]);
  const [lastSnapshot, setLastSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('dot_inventory')
      .select(
        `sku, on_hand, incoming, in_transit_to_retailer, allocated, weekly_velocity, snapshot_date,
         products ( short_name, full_name )`
      )
      .order('snapshot_date', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setError(error.message);
          setLoading(false);
          return;
        }
        const seen = new Set();
        const latest = [];
        for (const r of data ?? []) {
          if (seen.has(r.sku)) continue;
          seen.add(r.sku);
          latest.push(r);
        }
        setRows(latest);
        setLastSnapshot(data?.[0]?.snapshot_date ?? null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { rows, lastSnapshot, loading, error };
}
