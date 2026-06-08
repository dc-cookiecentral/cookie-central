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

// "Check for new": poll (classify) then extract (process), sequentially, from
// the client. gmail-poll tail-calls gmail-extract server-side too, but that
// tail-call has proven unreliable (fails silently — e.g. WK18 classified but
// never extracted), so we invoke gmail-extract explicitly here to guarantee
// extraction runs on every click. gmail-extract is idempotent (only touches
// processed=false rows), so the redundant call is safe.
// Returns { data, error } — data carries { scanned, classified, skipped, extract }.
export async function checkForNew() {
  // a) classify new mail
  const poll = await supabase.functions.invoke('gmail-poll', { body: { trigger: 'manual' } });
  if (poll.error) return { error: poll.error.message };
  if (poll.data?.error) return { error: poll.data.error };

  // b) process classified mail — don't rely on the server-side tail-call
  const extract = await supabase.functions.invoke('gmail-extract', { body: { trigger: 'manual' } });
  const extractData = extract.error
    ? { error: extract.error.message }
    : extract.data ?? null;

  // c/d) hand back combined counts; the caller refetches data + shows the result
  return {
    data: {
      scanned: poll.data?.scanned ?? 0,
      classified: poll.data?.classified ?? 0,
      skipped: poll.data?.skipped ?? 0,
      extract: extractData,
    },
  };
}

// Absolute URL the "Connect Gmail" button navigates to (start mode of the
// OAuth callback function). Derived from the Supabase project URL.
export function gmailConnectUrl() {
  const base = import.meta.env.VITE_SUPABASE_URL;
  return `${base}/functions/v1/gmail-oauth-callback`;
}
