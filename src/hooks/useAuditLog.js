import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Audit log fetch with filters (BUILD_PLAN 7.3). RLS gates read access to
// admin/finance roles, so ops users get empty results — the page surfaces
// that case explicitly. Filters are applied server-side where possible to
// avoid pulling thousands of rows into the browser.
//
// filters: { table?: string, action?: string, userId?: string, sinceDays?: number, limit?: number }
export function useAuditLog(filters = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    let q = supabase
      .from('audit_log')
      .select(
        `id, timestamp, table_name, record_id, action, field_name, old_value, new_value,
         user:user_profiles ( id, full_name, role )`
      )
      .order('timestamp', { ascending: false })
      .limit(filters.limit ?? 200);

    if (filters.table) q = q.eq('table_name', filters.table);
    if (filters.action) q = q.eq('action', filters.action);
    if (filters.userId) q = q.eq('user_id', filters.userId);
    if (filters.sinceDays && filters.sinceDays > 0) {
      const since = new Date(Date.now() - filters.sinceDays * 86400000).toISOString();
      q = q.gte('timestamp', since);
    }

    const { data, error } = await q;
    if (error) setError(error.message);
    else setRows(data ?? []);
    setLoading(false);
  }, [filters.table, filters.action, filters.userId, filters.sinceDays, filters.limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rows, loading, error, refresh };
}

// Distinct table_name + action values present in the log — drives the filter
// dropdowns. Lightweight; runs once on mount.
export function useAuditFacets() {
  const [facets, setFacets] = useState({ tables: [], users: [] });

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from('audit_log').select('table_name').limit(1000),
      supabase.from('user_profiles').select('id, full_name').order('full_name'),
    ]).then(([tablesR, usersR]) => {
      if (!active) return;
      const tables = [...new Set((tablesR.data ?? []).map((r) => r.table_name))].sort();
      const users = usersR.data ?? [];
      setFacets({ tables, users });
    });
    return () => {
      active = false;
    };
  }, []);

  return facets;
}
