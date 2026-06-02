import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Connection status for the systems@ inbox (gmail_sync_state) + the on-demand
// poll. The "Connect Gmail" flow is a top-level navigation (see Uploads.jsx);
// this hook covers status display and the "Check for new" button, mirroring the
// weekly-report manual-check pattern.
export function useGmailStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('gmail_sync_state')
      .select('connected_email, connected_at, last_polled_at, last_poll_count')
      .limit(1)
      .maybeSingle();
    setStatus(data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, loading, refresh };
}

// Invoke gmail-poll (which classifies new mail and tail-calls gmail-extract).
// Returns { data, error } — data carries { scanned, classified, skipped, extract }.
export async function checkForNew() {
  const { data, error } = await supabase.functions.invoke('gmail-poll', {
    body: { trigger: 'manual' },
  });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { data };
}

// Absolute URL the "Connect Gmail" button navigates to (start mode of the
// OAuth callback function). Derived from the Supabase project URL.
export function gmailConnectUrl() {
  const base = import.meta.env.VITE_SUPABASE_URL;
  return `${base}/functions/v1/gmail-oauth-callback`;
}
