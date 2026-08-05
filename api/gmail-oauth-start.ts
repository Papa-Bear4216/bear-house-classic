/**
 * /api/gmail-oauth-start — begins the server-side Gmail OAuth flow for the
 * signed-in household member. Redirects to Google's consent screen;
 * Google redirects back to api/gmail-oauth-callback.ts with a code.
 *
 * access_type=offline + prompt=consent are required to get a refresh
 * token back — without both, Google only issues a short-lived access
 * token (the same limitation the existing client-side flow already has).
 */
export const config = { runtime: 'edge' };

import { resolveHouseholdId, dbGetHouseholdMembersByHouseholdId } from './_db.js';
import { json as j } from './_responseHelpers.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return j({ error: 'Method not allowed' }, 405);

  const url = new URL(req.url);
  const accessToken = url.searchParams.get('token') || '';
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const memberId = url.searchParams.get('memberId');
  if (!memberId) return j({ error: 'Missing memberId' }, 400);

  // Confirm the member belongs to this household — don't let a caller
  // connect Gmail onto an arbitrary member ID from another household.
  const members = await dbGetHouseholdMembersByHouseholdId(householdId);
  if (!members.some(m => m.id === memberId)) return j({ error: 'Member not found in this household' }, 404);

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) return j({ error: 'Gmail integration is not configured' }, 500);

  const redirectUri = `${url.origin}/api/gmail-oauth-callback`;
  // state carries memberId + a return path — signed implicitly by requiring
  // the callback to re-verify household membership, not by a signature,
  // since it only ever triggers a read-scope Gmail connect, not a write.
  const state = encodeURIComponent(JSON.stringify({ memberId, householdId }));

  const authUrl = new URL(AUTH_URL);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  return Response.redirect(authUrl.toString(), 302);
}
