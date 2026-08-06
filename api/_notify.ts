/**
 * Notification helpers — IFTTT Maker Webhooks (legacy, out-of-band) plus
 * native Android push via Firebase Cloud Messaging (FCM) HTTP v1.
 * Underscore prefix means Vercel won't expose this as a route.
 *
 * IFTTT: create an applet per event name with trigger
 * "Webhooks -> Receive a web request" (event name must match), action = whatever
 * you want (phone notification, SMS, etc). Value1/Value2/Value3 are passed through.
 * Env var needed: IFTTT_WEBHOOKS_KEY (from ifttt.com/maker_webhooks -> Documentation)
 *
 * FCM: every api/*.ts route that calls notifyPush runs under the Vercel Edge
 * Runtime, which has no Node SDKs — so no firebase-admin. Instead we do raw
 * fetch against the FCM v1 REST API, signing the Google OAuth2 JWT with the
 * service account's private key via Web Crypto (crypto.subtle, edge-native).
 * Env var needed: FIREBASE_SERVICE_ACCOUNT (the service-account JSON string,
 * same file Firebase console "Generate new private key" downloads).
 */
export async function notifyIFTTT(event: string, value1?: string, value2?: string, value3?: string): Promise<void> {
  const key = process.env.IFTTT_WEBHOOKS_KEY;
  if (!key) return;
  try {
    await fetch(`https://maker.ifttt.com/trigger/${encodeURIComponent(event)}/with/key/${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value1, value2, value3 }),
    });
  } catch {
    // best-effort — never let a notification failure break the caller
  }
}

import { dbGetPushTokensByHouseholdId, dbDeletePushToken } from './_db.js';

// ── FCM v1 plumbing ──────────────────────────────────────────────────────────

/** Parsed once at module scope; null if the env var is absent/unparseable. */
const SA = parseServiceAccount();
let cachedToken: { access_token: string; expires_at: number } | null = null;

function parseServiceAccount(): { client_email: string; private_key: string; project_id: string } | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string; project_id?: string };
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key, project_id: parsed.project_id };
  } catch {
    return null;
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toBase64UrlString(s: string): string {
  return toBase64Url(new TextEncoder().encode(s));
}

/** RS256-sign a JWT payload with the service account private key (Web Crypto, edge-safe). */
async function signJwt(unsigned: string, privateKeyPem: string): Promise<string> {
  const pemBody = privateKeyPem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(pemBody);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const key = await crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return toBase64Url(new Uint8Array(sig));
}

/**
 * Exchange the service account JWT for a short-lived OAuth2 access token,
 * cached for its lifetime (refresh ~5 min early) so a warm Edge instance
 * doesn't re-sign per send.
 */
async function getFcmAccessToken(): Promise<string> {
  if (!SA) throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');
  if (cachedToken && cachedToken.expires_at > Date.now() + 5 * 60 * 1000) return cachedToken.access_token;

  const nowSec = Math.floor(Date.now() / 1000);
  const header = toBase64UrlString(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = toBase64UrlString(
    JSON.stringify({
      iss: SA.client_email,
      sub: SA.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      iat: nowSec,
      exp: nowSec + 3600,
    })
  );
  const unsigned = `${header}.${payload}`;
  const signature = await signJwt(unsigned, SA.private_key);
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(jwt)}`,
  });
  if (!res.ok) throw new Error(`FCM token exchange failed: ${res.status}`);
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('FCM token exchange: no access_token in response');

  const expiresInMs = (data.expires_in ? data.expires_in : 3600) * 1000;
  cachedToken = { access_token: data.access_token, expires_at: Date.now() + expiresInMs };
  return data.access_token;
}

/**
 * Send a household-wide push to every device registered under that household.
 * Fire-and-forget like notifyIFTTT: a push failure must never break the
 * caller's real work. Dead tokens (FCM says NOT_FOUND/UNREGISTERED) are
 * pruned inline so the table self-cleans — no separate cron needed.
 */
export async function notifyPush(householdId: string, title: string, body: string): Promise<void> {
  if (!SA) return; // FIREBASE_SERVICE_ACCOUNT missing → silent no-op, like notifyIFTTT
  try {
    const tokens = await dbGetPushTokensByHouseholdId(householdId);
    if (!tokens.length) return;

    const accessToken = await getFcmAccessToken();
    await Promise.allSettled(
      tokens.map(async (token) => {
        try {
          const res = await fetch(
            `https://fcm.googleapis.com/v1/projects/${SA!.project_id}/messages:send`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
              body: JSON.stringify({ message: { token, notification: { title, body } } }),
            }
          );
          if (!res.ok) {
            // FCM v1 surfaces errors as JSON in the body — a 404 alone is NOT
            // the signal (404s can carry other statuses). Prune only on the
            // explicit dead-token statuses, never on HTTP 400.
            const text = await res.text().catch(() => '');
            let status = '';
            try { status = (JSON.parse(text) as any)?.error?.status ?? ''; } catch { /* keep '' */ }
            if (res.status === 404 || status === 'NOT_FOUND' || status === 'UNREGISTERED') {
              await dbDeletePushToken(token).catch(() => {});
            }
          }
        } catch {
          // one bad token must not abort the rest
        }
      })
    );
  } catch {
    // best-effort — swallow, like notifyIFTTT
  }
}