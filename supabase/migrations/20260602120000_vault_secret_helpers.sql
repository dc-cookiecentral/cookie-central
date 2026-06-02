-- Cookie Central — Vault secret helpers (read/write from Edge Functions)
--
-- The Phase 2 AI email agent runs in Supabase Edge Functions and needs the
-- secrets that live in Vault (ANTHROPIC_API_KEY, GMAIL_OAUTH_CLIENT_ID,
-- GMAIL_OAUTH_CLIENT_SECRET) — and, after the Gmail OAuth handshake, it writes a
-- new secret back (GMAIL_REFRESH_TOKEN). The `vault` schema is NOT exposed to
-- PostgREST, so an Edge Function can't `select` from `vault.decrypted_secrets`
-- directly. These two SECURITY DEFINER RPCs in `public` are the "small Postgres
-- helper" the RUNBOOK (§8.2) anticipates: callable by the service role only.
--
-- NOT auto-deployed — paste into the SQL editor in filename order (RUNBOOK §7).

-- Read one decrypted secret by name. NULL if it doesn't exist.
CREATE OR REPLACE FUNCTION public.get_secret(secret_name text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;
$$;

-- Upsert a secret by name: update in place if it exists, else create it.
-- Returns the secret's id. Used to persist GMAIL_REFRESH_TOKEN after OAuth and
-- on every token rotation.
CREATE OR REPLACE FUNCTION public.set_secret(secret_name text, secret_value text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  existing_id uuid;
BEGIN
  SELECT id INTO existing_id FROM vault.secrets WHERE name = secret_name LIMIT 1;
  IF existing_id IS NULL THEN
    RETURN vault.create_secret(secret_value, secret_name, 'Managed by Cookie Central gmail agent');
  END IF;
  PERFORM vault.update_secret(existing_id, secret_value);
  RETURN existing_id;
END;
$$;

-- Lock these down: only the service role (Edge Functions) may call them.
-- anon/authenticated (the browser clients) must never read or write Vault.
REVOKE EXECUTE ON FUNCTION public.get_secret(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_secret(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_secret(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_secret(text, text) TO service_role;

-- Verify (run as service role / SQL editor):
--   SELECT public.get_secret('ANTHROPIC_API_KEY') IS NOT NULL AS has_key;
