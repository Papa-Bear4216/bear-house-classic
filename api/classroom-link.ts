/**
 * /api/classroom-link — link a household member's Google Classroom (their
 * school account), so grades and assignments can be tracked without the
 * member being signed in.
 *
 *   GET  ?action=start&token=…&memberId=…   redirect to Google consent
 *   GET  ?action=callback                   Google redirects here with a code
 *   GET  ?action=status                     per-member link status (Bearer)
 *   POST { action: 'disconnect', memberId } unlink (Bearer)
 *   GET  ?action=grades&memberId=…          grades for a member (Bearer)
 *
 * Only an admin may link or read grades for another member; a member may
 * manage and read their own. Schools may block third-party apps — Google
 * then reports access_denied and we surface that plainly.
 */
export const config = { runtime: 'edge' };

import {
  resolveCallerMember, dbGetHouseholdMembersByHouseholdId, dbGetHouseholdMemberById,
  dbSetMemberClassroomToken, dbGetHouseholdClassroomStatus, dbGet,
} from './_db.js';
import { handleCorsPreflight } from './_cors.js';
import { checkRateLimit } from './_rateLimit.js';
import { encryptSecret, signGmailState, verifyGmailState } from './_crypto.js';
import { json as j, serverError } from './_responseHelpers.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const PURPOSE = 'classroom';
const SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

type Caller = NonNullable<Awaited<ReturnType<typeof resolveCallerMember>>>;

/** Returns an error Response if the caller may not manage this member's link, else null. */
async function authorizeTarget(caller: Caller, targetMemberId: string): Promise<Response | null> {
  const isAdmin = caller.role === 'admin' || caller.role === 'superadmin';
  if (targetMemberId !== caller.memberId && !isAdmin) {
    return j({ error: 'Only an admin can manage Classroom for another member' }, 403);
  }
  const members = await dbGetHouseholdMembersByHouseholdId(caller.householdId);
  const target = members.find(m => m.id === targetMemberId);
  if (!target) return j({ error: 'Member not found in this household' }, 404);
  if (target.role === 'pet') return j({ error: 'Pets do not have school accounts' }, 400);
  if (target.role === 'superadmin' && targetMemberId !== caller.memberId && caller.role !== 'superadmin') {
    return j({ error: "Only a superadmin can manage another superadmin's Classroom link" }, 403);
  }
  return null;
}

function redirectToApp(origin: string, status: 'connected' | 'error', detail?: string): Response {
  const url = new URL('/', origin);
  url.searchParams.set('classroom_oauth', status);
  if (detail) url.searchParams.set('detail', detail);
  return Response.redirect(url.toString(), 302);
}

async function start(url: URL): Promise<Response> {
  const accessToken = url.searchParams.get('token') || '';
  const caller = accessToken ? await resolveCallerMember(accessToken) : null;
  if (!caller) return j({ error: 'Unauthorized' }, 401);
  const memberId = url.searchParams.get('memberId') || caller.memberId;
  const denied = await authorizeTarget(caller, memberId);
  if (denied) return denied;

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) return j({ error: 'Classroom integration is not configured' }, 500);

  const authUrl = new URL(AUTH_URL);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', `${url.origin}/api/classroom-link?action=callback`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent select_account');
  authUrl.searchParams.set('state', encodeURIComponent(await signGmailState({ memberId, householdId: caller.householdId, purpose: PURPOSE })));
  return Response.redirect(authUrl.toString(), 302);
}

async function callback(url: URL): Promise<Response> {
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  if (error) return redirectToApp(url.origin, 'error', error);
  if (!code || !stateRaw) return redirectToApp(url.origin, 'error', 'missing_code_or_state');

  const state = await verifyGmailState(stateRaw, PURPOSE);
  if (!state) return redirectToApp(url.origin, 'error', 'invalid_state');
  const member = await dbGetHouseholdMemberById(state.memberId);
  if (!member || member.household_id !== state.householdId) return redirectToApp(url.origin, 'error', 'member_mismatch');

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return redirectToApp(url.origin, 'error', 'not_configured');

  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: `${url.origin}/api/classroom-link?action=callback`,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) return redirectToApp(url.origin, 'error', 'token_exchange_failed');
    const tokens = await tokenRes.json() as any;
    if (!tokens.refresh_token) return redirectToApp(url.origin, 'error', 'no_refresh_token');
    const info = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const email = info.ok ? ((await info.json()) as any).email || 'unknown' : 'unknown';
    await dbSetMemberClassroomToken(state.memberId, await encryptSecret(tokens.refresh_token), email);
    return redirectToApp(url.origin, 'connected');
  } catch (e: any) {
    return redirectToApp(url.origin, 'error', e?.message?.slice(0, 100) || 'unknown_error');
  }
}

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const action = url.searchParams.get('action');
    if (action === 'start') return start(url);
    if (action === 'callback') return callback(url);
  } else if (req.method !== 'POST') {
    return j({ error: 'Method not allowed' }, 405);
  }

  const accessToken = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const caller = accessToken ? await resolveCallerMember(accessToken) : null;
  if (!caller) return j({ error: 'Unauthorized' }, 401);
  const rl = await checkRateLimit(caller.householdId, 'classroom-link', 30);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  try {
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as any;
      if (body.action !== 'disconnect' || typeof body.memberId !== 'string') return j({ error: 'Invalid request' }, 400);
      const denied = await authorizeTarget(caller, body.memberId);
      if (denied) return denied;
      await dbSetMemberClassroomToken(body.memberId, null, null);
      return j({ ok: true });
    }

    const action = url.searchParams.get('action');
    if (action === 'status') {
      const members = await dbGetHouseholdMembersByHouseholdId(caller.householdId);
      const rows = await dbGetHouseholdClassroomStatus(caller.householdId);
      const email = new Map(rows.map(r => [r.id, r.classroom_connected_email]));
      return j({ members: members.map(m => ({ memberId: m.id, name: m.name, connected: !!email.get(m.id), email: email.get(m.id) || null })) });
    }
    if (action === 'grades') {
      const memberId = url.searchParams.get('memberId') || caller.memberId;
      const denied = await authorizeTarget(caller, memberId);
      if (denied) return denied;
      return j({ grades: (await dbGet(`school_grades:${memberId}`, caller.householdId)) ?? { syncedAt: null, grades: [] } });
    }
    return j({ error: 'Unknown action' }, 400);
  } catch (e: any) {
    return serverError(e?.message || 'Classroom request failed', 'classroom-link', e);
  }
}
