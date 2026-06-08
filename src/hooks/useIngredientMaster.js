import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Ingredient Master catalog (Reference page): every normalized ingredient with
// its full set of distributor/brand sourcing options. Sourced from the
// ingredient_master upload (ingredient_catalog + ingredient_suppliers) and kept
// separate from the live raw_materials inventory feed.
export function useIngredientMaster() {
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ingredient_catalog')
      .select(
        `id, name, unit, category,
         ingredient_suppliers ( id, brand, dc_item_number, supplier_number, distributor,
           pkg_type, qty_per_package, unit, cost, cost_per_unit, priority, product_line,
           lead_time_text, shelf_life_text, moq, terms, notes )`
      )
      .order('name');
    if (error) setError(error.message);
    else setIngredients(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ingredients, loading, error, refresh };
}
