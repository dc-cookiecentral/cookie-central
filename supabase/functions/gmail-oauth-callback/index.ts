// gmail-oauth-callback — dual-mode OAuth endpoint for systems@dirtycookie.com.
//
//   No `code` query param  → "start" mode: 302 to Google's consent screen.
//   `code` present         → callback: exchange for tokens, store the refresh
//                            token in Vault, record the connection, 302 back to
//                            the app's Uploads page.
//
// Public (verify_jwt = false in config.toml) — the browser hits it directly from
// Google with no JWT. It reads/writes Vault via the service role (the function's
// injected SUPABASE_SERVICE_ROLE_KEY), never exposing secrets to the client.
//
// Deploy:  npx supabase functions deploy gmail-oauth-callback --no-verify-jwt
// Optional Edge secret:  APP_BASE_URL  (where to land after OAuth)

import { serviceClient } from '../_shared/supabase.ts';
import { getSecret, setSecret } from '../_shared/vault.ts';
import { buildConsentUrl, exchangeCode, getProfile } from '../_shared/gmail.ts';

const APP_BASE_URL = Deno.env.get('APP_BASE_URL') ?? 'https://cookiecentral.dirtycookie.com';

function back(path: string): Response {
  return Response.redirect(`${APP_BASE_URL}${path}`, 302);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const supabase = serviceClient();

  try {
    const code = url.searchParams.get('code');
    const oauthError = url.searchParams.get('error');
    if (oauthError) return back(`/uploads?gmail=error&msg=${encodeURIComponent(oauthError)}`);

    const clientId = await getSecret(supabase, 'GMAIL_OAUTH_CLIENT_ID');
    if (!clientId) throw new Error('GMAIL_OAUTH_CLIENT_ID not in Vault');

    // Start mode → bounce to Google.
    if (!code) {
      return Response.redirect(buildConsentUrl(clientId, 'systems'), 302);
    }

    // Callback mode → exchange the code.
    const clientSecret = await getSecret(supabase, 'GMAIL_OAUTH_CLIENT_SECRET');
    if (!clientSecret) throw new Error('GMAIL_OAUTH_CLIENT_SECRET not in Vault');
    const tok = await exchangeCode(clientId, clientSecret, code);
    if (!tok.refresh_token) {
      throw new Error(
        'Google returned no refresh_token. Remove the prior grant at ' +
          'myaccount.google.com/permissions and reconnect (forces prompt=consent).',
      );
    }
    await setSecret(supabase, 'GMAIL_REFRESH_TOKEN', tok.refresh_token);

    // Record connection metadata (best-effort).
    let email: string | null = null;
    try {
      email = (await getProfile(tok.access_token)).emailAddress ?? null;
    } catch (_) {
      /* profile is optional */
    }
    const now = new Date().toISOString();
    const { data: existing } = await supabase.from('gmail_sync_state').select('id').limit(1);
    const payload = { connected_email: email, connected_at: now, updated_at: now };
    if (existing && existing.length) {
      await supabase.from('gmail_sync_state').update(payload).eq('id', existing[0].id);
    } else {
      await supabase.from('gmail_sync_state').insert(payload);
    }

    return back('/uploads?gmail=connected');
  } catch (e) {
    return back(`/uploads?gmail=error&msg=${encodeURIComponent(String((e as Error)?.message ?? e))}`);
  }
});
