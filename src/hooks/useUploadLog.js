import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Fetches upload_log rows (most recent first) with the uploader's name.
export function useUploadLog(limit = 50) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('upload_log')
      .select('id, upload_type, filename, row_count, status, errors, uploaded_at, uploaded_by, user_profiles(full_name)')
      .order('uploaded_at', { ascending: false })
      .limit(limit);
    if (error) setError(error.message);
    else setRows(data ?? []);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rows, loading, error, refresh };
}
