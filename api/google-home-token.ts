/**
 * POST /api/google-home-token — OAuth 2.0 token endpoint Google calls (server
 * to server) to exchange an authorization code for tokens, and later to
 * refresh the access token. Form-encoded per RFC 6749; client credentials may
 * arrive in the body or as HTTP Basic.
 */
export const config = { runtime: 'edge' };

import { json as j } from './_responseHelpers.js';
import {
  googleHomeConfig, consumeAuthCode, createLink, findLinkByRefresh,
  signAccessToken, timingSafeEqual,
} from './_googleHome.js';

const oauthError = (error: string, status = 400) => j({ error }, status);

function clientCredentials(req: Request, form: URLSearchParams): { id: string; secret: string } {
  const header = (req.headers.get('authorization') || '').trim();
  // Plain string handling, not a regex: this is an attacker-controlled header.
  if (header.slice(0, 6).toLowerCase() === 'basic ') {
    try {
      const [id, ...rest] = atob(header.slice(6).trim()).split(':');
      return { id: decodeURIComponent(id), secret: decodeURIComponent(rest.join(':')) };
    } catch { /* fall through to body */ }
  }
  return { id: form.get('client_id') || '', secret: form.get('client_secret') || '' };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return oauthError('invalid_request', 405);

  const cfg = googleHomeConfig();
  if (!cfg) return oauthError('temporarily_unavailable', 503);

  const form = new URLSearchParams(await req.text());
  const creds = clientCredentials(req, form);
  if (!timingSafeEqual(creds.id, cfg.clientId) || !timingSafeEqual(creds.secret, cfg.clientSecret)) {
    return oauthError('invalid_client', 401);
  }

  const grant = form.get('grant_type');

  if (grant === 'authorization_code') {
    const code = form.get('code');
    const redirectUri = form.get('redirect_uri');
    if (!code || !redirectUri) return oauthError('invalid_request');
    const row = await consumeAuthCode(code);
    // The code must be valid, unused, unexpired, and redeemed for the same redirect_uri it was issued for.
    if (!row || row.redirect_uri !== redirectUri) return oauthError('invalid_grant');
    const link = await createLink(row.member_id, row.household_id);
    if (!link) return oauthError('server_error', 500);
    const access = await signAccessToken(link.id, cfg.clientSecret);
    return j({ token_type: 'Bearer', access_token: access.token, refresh_token: link.refreshToken, expires_in: access.expiresIn });
  }

  if (grant === 'refresh_token') {
    const refresh = form.get('refresh_token');
    if (!refresh) return oauthError('invalid_request');
    const link = await findLinkByRefresh(refresh);
    if (!link) return oauthError('invalid_grant');
    const access = await signAccessToken(link.id, cfg.clientSecret);
    return j({ token_type: 'Bearer', access_token: access.token, expires_in: access.expiresIn });
  }

  return oauthError('unsupported_grant_type');
}
