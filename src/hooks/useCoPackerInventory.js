import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Raw materials and packaging Dirty Cookie holds at its co-packer: raw_materials
// split into ingredients vs packaging, plus the most recent import timestamp.
// Was useAssemblersInventory until Nov 5 2026: the Assemblers import is gone,
// so the stock now moves only through Incoming (receive) and adjustments.
export function useCoPackerInventory() {
  const [rawMaterials, setRawMaterials] = useState([]);
  const [packaging, setPackaging] = useState([]);
  const [lastUpload, setLastUpload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('raw_materials')
      .select('id, code, name, quantity, unit, lot_count, expiry_status, expired_quantity, default_lead_days, category, last_upload_at, ingredient_id, ingredient_catalog ( id, name )')
      .in('category', ['raw_material', 'packaging'])
      .order('name')
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setError(error.message);
          setLoading(false);
          return;
        }
        const all = data ?? [];
        setRawMaterials(all.filter((m) => m.category === 'raw_material'));
        setPackaging(all.filter((m) => m.category === 'packaging'));
        const latest = all.reduce((max, m) => {
          if (m.last_upload_at && (!max || m.last_upload_at > max)) return m.last_upload_at;
          return max;
        }, null);
        setLastUpload(latest);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { rawMaterials, packaging, lastUpload, loading, error };
}
