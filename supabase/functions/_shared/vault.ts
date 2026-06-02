import type { SupabaseClient } from '@supabase/supabase-js';

// Read/write Vault secrets through the public.get_secret / public.set_secret
// SECURITY DEFINER RPCs (migration 20260602120000). The `vault` schema isn't
// exposed to PostgREST, so these wrappers are the only way an Edge Function
// reaches it — and they're granted to the service role only.

export async function getSecret(
  supabase: SupabaseClient,
  name: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_secret', { secret_name: name });
  if (error) throw new Error(`get_secret(${name}): ${error.message}`);
  return data ?? null;
}

export async function setSecret(
  supabase: SupabaseClient,
  name: string,
  value: string,
): Promise<void> {
  const { error } = await supabase.rpc('set_secret', {
    secret_name: name,
    secret_value: value,
  });
  if (error) throw new Error(`set_secret(${name}): ${error.message}`);
}
