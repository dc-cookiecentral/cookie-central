// Gmail OAuth + message access for systems@dirtycookie.com.
//
// The OAuth consent screen is Internal (dirtycookie.com) and the redirect URI
// is fixed to the gmail-oauth-callback function. Mail is read (the report
// ingest) and, since Oct 2026, SENT — but only by sendMessage() below, for
// Sample Central's "order never reached ShipStation" alert. Never modified or
// deleted. Adding gmail.send needs a one-time reconnect (Connect Gmail): a
// refresh token minted before then carries readonly alone, and sending with it
// returns 403 while the ingest keeps working.

const REDIRECT_URI =
  'https://niesswmibmonlbrbcecj.supabase.co/functions/v1/gmail-oauth-callback';
const SCOPE = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');
const TARGET_INBOX = 'systems@dirtycookie.com';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface ParsedAttachment {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
  // Inline/signature images carry a Content-ID and/or Content-Disposition:
  // inline. True report attachments are "attachment" with no CID. We use this
  // to keep only standalone data images (Retail Link screenshots) and drop
  // logos / promo banners embedded in the email signature.
  contentId: string | null;
  inline: boolean;
}

export interface ParsedMessage {
  id: string;
  threadId: string;
  internalDate: string | null;
  subject: string | null;
  from: string | null;
  fromEmail: string | null;
  fromName: string | null;
  date: string | null;
  snippet: string;
  body: string;
  attachments: ParsedAttachment[];
}

// ── OAuth ───────────────────────────────────────────────────────────────────

// access_type=offline + prompt=consent forces Google to return a refresh_token
// (it otherwise omits it on repeat grants).
export function buildConsentUrl(clientId: string, state?: string): string {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    login_hint: TARGET_INBOX,
    include_granted_scopes: 'true',
  });
  if (state) p.set('state', state);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`oauth token ${res.status}: ${await res.text()}`);
  return res.json();
}

export function exchangeCode(clientId: string, clientSecret: string, code: string) {
  return tokenRequest({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  });
}

export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const j = await tokenRequest({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
  return j.access_token;
}

// ── Messages ────────────────────────────────────────────────────────────────

async function gmailGet(accessToken: string, path: string) {
  const res = await fetch(`${GMAIL}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`gmail ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getProfile(accessToken: string) {
  return gmailGet(accessToken, '/profile'); // { emailAddress, historyId }
}

export async function listMessages(
  accessToken: string,
  q: string,
  max = 40,
): Promise<{ id: string; threadId: string }[]> {
  const p = new URLSearchParams({ q, maxResults: String(max) });
  const j = await gmailGet(accessToken, `/messages?${p}`);
  return j.messages ?? [];
}

export function getMessage(accessToken: string, id: string) {
  return gmailGet(accessToken, `/messages/${id}?format=full`);
}

export async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<Uint8Array> {
  const j = await gmailGet(
    accessToken,
    `/messages/${messageId}/attachments/${attachmentId}`,
  );
  return b64urlToBytes(j.data);
}

// ── Parsing ─────────────────────────────────────────────────────────────────

// ── Sending ─────────────────────────────────────────────────────────────────
// Prefix on every message this system sends. gmail-poll excludes it from the
// inbox scan — the alerts land in the same inbox the ingest reads, and without
// the exclusion each one would be fetched and run past the classifier.
export const SYSTEM_SUBJECT_PREFIX = '[Sample Central]';

// RFC 2047 — a raw non-ASCII Subject header arrives as mojibake.
const encodeHeader = (v: string) =>
  /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${bytesToB64(new TextEncoder().encode(v))}?=`;

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Plain-text mail from the connected account (systems@). Throws on failure. */
export async function sendMessage(
  accessToken: string,
  msg: { to: string; subject: string; text: string },
): Promise<void> {
  const mime = [
    `To: ${msg.to}`,
    `Subject: ${encodeHeader(msg.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    bytesToB64(new TextEncoder().encode(msg.text)),
  ].join('\r\n');
  const raw = bytesToB64(new TextEncoder().encode(mime))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const res = await fetch(`${GMAIL}/messages/send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`gmail send ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

function b64urlToBytes(data: string): Uint8Array {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlToText(data: string): string {
  return new TextDecoder().decode(b64urlToBytes(data));
}

function header(headers: { name: string; value: string }[], name: string) {
  const h = (headers ?? []).find(
    (x) => x.name.toLowerCase() === name.toLowerCase(),
  );
  return h ? h.value : null;
}

// Walk the MIME tree: collect the text/plain body, fall back to stripped
// text/html, and gather attachment metadata. Mirrors the intent of
// src/parsers/weeklyEmail.js extractEmailParts, adapted to the Gmail JSON shape.
export function parseMessage(msg: any): ParsedMessage {
  const headers = msg.payload?.headers ?? [];
  const from = header(headers, 'From');
  const fromEmail = (from?.match(/[\w.+-]+@[\w.-]+/) ?? [])[0] ?? from;
  const fromName = from
    ? from.replace(/<[^>]*>/, '').replace(/"/g, '').trim() || fromEmail
    : null;

  let text = '';
  let html = '';
  const attachments: ParsedAttachment[] = [];

  const walk = (part: any) => {
    if (!part) return;
    const mime = part.mimeType ?? '';
    if (part.filename && part.body?.attachmentId) {
      const partHeaders = part.headers ?? [];
      const rawCid = header(partHeaders, 'Content-ID') || header(partHeaders, 'X-Attachment-Id');
      const contentId = rawCid ? rawCid.replace(/^<|>$/g, '').trim() : null;
      const disposition = header(partHeaders, 'Content-Disposition') ?? '';
      attachments.push({
        filename: part.filename,
        mimeType: mime,
        attachmentId: part.body.attachmentId,
        size: part.body.size ?? 0,
        contentId,
        // Inline if Gmail tagged it inline OR it has a Content-ID (CID refs are
        // almost always signature logos / banners).
        inline: /inline/i.test(disposition) || !!contentId,
      });
    }
    if (mime === 'text/plain' && part.body?.data) text += b64urlToText(part.body.data);
    else if (mime === 'text/html' && part.body?.data) html += b64urlToText(part.body.data);
    (part.parts ?? []).forEach(walk);
  };
  walk(msg.payload);

  if (!text && html) {
    text = html.replace(/<[^>]+>/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
  }

  return {
    id: msg.id,
    threadId: msg.threadId,
    internalDate: msg.internalDate
      ? new Date(Number(msg.internalDate)).toISOString()
      : null,
    subject: header(headers, 'Subject'),
    from,
    fromEmail,
    fromName,
    date: header(headers, 'Date'),
    snippet: msg.snippet ?? '',
    body: text,
    attachments,
  };
}
