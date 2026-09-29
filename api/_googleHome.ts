/**
 * Google Smart Home (cloud-to-cloud) account linking — server helpers.
 *
 * Google needs this app to be an OAuth 2.0 provider: it sends the user to our
 * authorize page, exchanges the code at our token endpoint, then calls
 * /api/voice-google with the access token we issued. Supabase session tokens
 * can't do that (they expire hourly and Google can't refresh them).
 *
 * Env (all required, unset = Google Home disabled):
 *   GOOGLE_HOME_CLIENT_ID      identifier we give Google in the Home Developer Console
 *   GOOGLE_HOME_CLIENT_SECRET  secret we give Google; also signs access tokens
 *   GOOGLE_HOME_PROJECT_ID     the Google Cloud/Home project id (fixes the allowed redirect URIs)
 */
const SUPABASE_URL = 'https://zjialvdolbkccduuwsck.supabase.co';
const ACCESS_TTL_SECONDS = 3600;
const CODE_TTL_SECONDS = 300;

export function googleHomeConfig(): { clientId: string; clientSecret: string; projectId: string } | null {
  const clientId = process.env.GOOGLE_HOME_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_HOME_CLIENT_SECRET;
  const projectId = process.env.GOOGLE_HOME_PROJECT_ID;
  return clientId && clientSecret && projectId ? { clientId, clientSecret, projectId } : null;
}

function svcHeaders(extra: Record<string, string> = {}) {
  const key = process.env.SUPABASE_SERVICE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra };
}

/** Google only ever redirects to these two URLs for a given project. */
export function isAllowedRedirect(uri: string, projectId: string): boolean {
  return uri === `https://oauth-redirect.googleusercontent.com/r/${projectId}`
    || uri === `https://oauth-redirect-sandbox.googleusercontent.com/r/${projectId}`;
}

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomToken(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `${prefix}${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

// ── Access tokens: stateless, signed, 1h ───────────────────────────────────
export async function signAccessToken(linkId: string, secret: string, now = Date.now()): Promise<{ token: string; expiresIn: number }> {
  const exp = Math.floor(now / 1000) + ACCESS_TTL_SECONDS;
  const sig = await hmacHex(secret, `${linkId}.${exp}`);
  return { token: `ght1.${linkId}.${exp}.${sig}`, expiresIn: ACCESS_TTL_SECONDS };
}

export async function verifyAccessToken(token: string, secret: string, now = Date.now()): Promise<{ linkId: string } | null> {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'ght1') return null;
  const [, linkId, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < now) return null;
  if (!timingSafeEqual(sig, await hmacHex(secret, `${linkId}.${exp}`))) return null;
  return { linkId };
}

// ── Auth codes: random, hashed, single-use ─────────────────────────────────
export async function createAuthCode(member: { memberId: string; householdId: string }, redirectUri: string): Promise<string | null> {
  const code = randomToken('ghc_');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/google_home_auth_codes`, {
    method: 'POST',
    headers: svcHeaders(),
    body: JSON.stringify({
      code_hash: await sha256Hex(code),
      member_id: member.memberId,
      household_id: member.householdId,
      redirect_uri: redirectUri,
      expires_at: new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString(),
    }),
  });
  return res.ok ? code : null;
}

/** Deletes and returns the code's row in one statement, so it works exactly once. */
export async function consumeAuthCode(code: string): Promise<{ member_id: string; household_id: string; redirect_uri: string } | null> {
  const hash = await sha256Hex(code);
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/google_home_auth_codes?code_hash=eq.${hash}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
    { method: 'DELETE', headers: svcHeaders({ Prefer: 'return=representation' }) },
  );
  if (!res.ok) return null;
  const rows = await res.json() as any[];
  return rows[0] ?? null;
}

// ── Links ──────────────────────────────────────────────────────────────────
export async function createLink(member_id: string, household_id: string): Promise<{ id: string; refreshToken: string } | null> {
  const refreshToken = randomToken('ghr_');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/google_home_links`, {
    method: 'POST',
    headers: svcHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({ member_id, household_id, refresh_token_hash: await sha256Hex(refreshToken) }),
  });
  if (!res.ok) return null;
  const [row] = await res.json() as any[];
  return row ? { id: row.id, refreshToken } : null;
}

export async function findLinkByRefresh(refreshToken: string): Promise<{ id: string } | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/google_home_links?refresh_token_hash=eq.${await sha256Hex(refreshToken)}&revoked_at=is.null&select=id`,
    { headers: svcHeaders() },
  );
  if (!res.ok) return null;
  const rows = await res.json() as any[];
  return rows[0] ?? null;
}

export async function revokeLink(id: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/google_home_links?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: svcHeaders(),
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  }).catch(() => {});
}

export type GoogleHomeCaller = { linkId: string; householdId: string; memberId: string; role: string; canControlDevices: boolean };

/** Bearer access token -> the linked member, with their CURRENT role and
 * household (so demoting a member or unlinking takes effect immediately). */
export async function resolveGoogleHomeCaller(accessToken: string): Promise<GoogleHomeCaller | null> {
  const cfg = googleHomeConfig();
  if (!cfg) return null;
  const verified = await verifyAccessToken(accessToken, cfg.clientSecret);
  if (!verified) return null;

  const linkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/google_home_links?id=eq.${encodeURIComponent(verified.linkId)}&revoked_at=is.null&select=id,member_id`,
    { headers: svcHeaders() },
  );
  if (!linkRes.ok) return null;
  const link = ((await linkRes.json()) as any[])[0];
  if (!link) return null;

  const memRes = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?id=eq.${encodeURIComponent(link.member_id)}&select=id,household_id,role,can_control_devices`,
    { headers: svcHeaders() },
  );
  if (!memRes.ok) return null;
  const m = ((await memRes.json()) as any[])[0];
  if (!m) return null;
  return { linkId: link.id, householdId: m.household_id, memberId: m.id, role: m.role, canControlDevices: !!m.can_control_devices };
}
