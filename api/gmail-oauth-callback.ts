/**
 * /api/gmail-oauth-callback — Google redirects here after consent, with a
 * one-time code. Exchanges it for tokens, encrypts + stores the refresh
 * token on the member, then redirects back into the app.
 *
 * No Authorization header is available on a browser redirect, so identity
 * comes from `state` (set in gmail-oauth-start.ts) — re-verified against
 * the member row directly rather than trusted blindly.
 */
export const config = { runtime: 'edge' };

import { dbGetHouseholdMemberById, dbSetMemberGmailToken } from './_db.js';
import { encryptSecret } from './_crypto.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

function redirectToApp(origin: string, status: 'connected' | 'error', detail?: string): Response {
  const url = new URL('/', origin);
  url.searchParams.set('gmail_oauth', status);
  if (detail) url.searchParams.set('detail', detail);
  return Response.redirect(url.toString(), 302);
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) return redirectToApp(url.origin, 'error', error);
  if (!code || !stateRaw) return redirectToApp(url.origin, 'error', 'missing_code_or_state');

  let state: { memberId: string; householdId: string };
  try {
    state = JSON.parse(decodeURIComponent(stateRaw));
  } catch {
    return redirectToApp(url.origin, 'error', 'invalid_state');
  }

  const member = await dbGetHouseholdMemberById(state.memberId);
  if (!member || member.household_id !== state.householdId) {
    return redirectToApp(url.origin, 'error', 'member_mismatch');
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return redirectToApp(url.origin, 'error', 'not_configured');

  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${url.origin}/api/gmail-oauth-callback`,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      const detail = await tokenRes.text().catch(() => '');
      return redirectToApp(url.origin, 'error', `token_exchange_failed:${detail.slice(0, 100)}`);
    }
    const tokens = await tokenRes.json() as any;
    if (!tokens.refresh_token) {
      // Happens if the user has connected before and Google doesn't
      // re-issue a refresh token without prompt=consent forcing it —
      // gmail-oauth-start.ts already sets prompt=consent, so this should
      // be rare, but surface it plainly rather than silently no-op.
      return redirectToApp(url.origin, 'error', 'no_refresh_token');
    }

    const userInfoRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = userInfoRes.ok ? await userInfoRes.json() as any : {};
    const connectedEmail = userInfo.email || 'unknown';

    const encrypted = await encryptSecret(tokens.refresh_token);
    await dbSetMemberGmailToken(state.memberId, encrypted, connectedEmail);

    return redirectToApp(url.origin, 'connected');
  } catch (e: any) {
    return redirectToApp(url.origin, 'error', e?.message?.slice(0, 100) || 'unknown_error');
  }
}
