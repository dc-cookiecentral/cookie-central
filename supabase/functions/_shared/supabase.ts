import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Service-role client for the Gmail agent. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are injected into every Edge Function by the
// platform. Service role bypasses RLS (so the agent can write po_emails /
// po_lot_numbers / po_changes / upload_log / weekly_reports) and is the only
// role permitted to call the Vault secret RPCs.
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
