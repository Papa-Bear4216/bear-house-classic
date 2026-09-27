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

import { resolveCallerMember, dbGetHouseholdMembersByHouseholdId } from './_db.js';
import { json as j } from './_responseHelpers.js';
import { signGmailState } from './_crypto.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return j({ error: 'Method not allowed' }, 405);

  const url = new URL(req.url);
  const accessToken = url.searchParams.get('token') || '';
  const caller = accessToken ? await resolveCallerMember(accessToken) : null;
  if (!caller) return j({ error: 'Unauthorized' }, 401);

  // Gmail connect is normally "connect MY OWN Gmail" (memberId omitted), but
  // the Settings panel also lets an admin connect it on behalf of another
  // member — that's authorized below by role, not merely by household.
  const targetMemberId = url.searchParams.get('memberId') || caller.memberId;
  const isAdmin = caller.role === 'admin' || caller.role === 'superadmin';
  if (targetMemberId !== caller.memberId && !isAdmin) {
    return j({ error: 'Only an admin can connect Gmail for another member' }, 403);
  }
  const members = await dbGetHouseholdMembersByHouseholdId(caller.householdId);
  const target = members.find(m => m.id === targetMemberId);
  if (!target) return j({ error: 'Member not found in this household' }, 404);
  // Role hierarchy: an admin (not superadmin) may not manage a superadmin's
  // integrations — that would be a privilege inversion. Only the target
  // themselves or another superadmin can.
  if (target.role === 'superadmin' && targetMemberId !== caller.memberId && caller.role !== 'superadmin') {
    return j({ error: "Only a superadmin can manage another superadmin's Gmail connection" }, 403);
  }
  const { householdId } = caller;
  const memberId = targetMemberId;

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) return j({ error: 'Gmail integration is not configured' }, 500);

  const redirectUri = `${url.origin}/api/gmail-oauth-callback`;
  // state is HMAC-signed and short-lived (10 min) so it can't be forged or
  // replayed to link Gmail onto a member this request wasn't authorized for.
  const state = encodeURIComponent(await signGmailState({ memberId, householdId }));

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
