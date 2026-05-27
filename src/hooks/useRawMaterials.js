import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Raw materials (ingredients only) with their supplier options, for the
// reorder view. Packaging/finished_good are excluded — reorder is ingredients.
export function useRawMaterials() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('raw_materials')
      .select(
        `id, code, name, quantity, unit, lot_count, expiry_status, default_lead_days, category,
         raw_material_suppliers ( id, distributor, brand, cost_per_unit, moq, lead_time_days, is_active )`
      )
      .eq('category', 'raw_material')
      .order('name');
    if (error) setError(error.message);
    else setMaterials(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { materials, loading, error, refresh };
}
