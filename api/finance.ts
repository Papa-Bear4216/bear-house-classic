// api/finance.ts
export const config = { runtime: 'edge' };

import { dbGet, dbSet, resolveCallerMember, resolveHouseholdIdByWebhookToken, dbGetHouseholdMembersByHouseholdId } from './_db.js';
import { claimAccessUrl, fetchAccounts } from './_simplefin.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, FinanceBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';
import { syncMemberFinance } from './_financeCore.js';

import { handleCorsPreflight } from './_cors.js';

// SECURITY NOTE: every action below (connect/accounts/disconnect/sync) other
// than the webhook branch operates on the CALLER'S OWN bank connection —
// each household member links and views only their own SimpleFIN account.
// The row is written with owner_member_id = that member's id, and
// family_data's RLS policy restricts reads of an owned row to that member
// plus superadmins. That's what keeps an admin from ever seeing a
// superadmin's linked bank data (or vice versa for another admin) — this
// route never branches on role itself, because the DB already won't hand
// back a row the caller isn't allowed to see.
export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);
  const rawBody = (await req.json().catch(() => ({}))) as any;

  const webhookHouseholdId = rawBody.token ? await resolveHouseholdIdByWebhookToken(rawBody.token) : null;
  const isWebhookAuth = !!webhookHouseholdId;

  let householdId: string | null = webhookHouseholdId;
  let memberId: string | null = null;

  if (!isWebhookAuth) {
    const accessToken = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const caller = accessToken ? await resolveCallerMember(accessToken) : null;
    if (!caller) return j({ error: 'Unauthorized' }, 401);
    householdId = caller.householdId;
    memberId = caller.memberId;
  }
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'finance', 20);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const parsed = parseBody(FinanceBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const params = parsed.data;
  const { action } = params;

  const connKey = memberId ? `simplefin_access_${memberId}` : null;

  if (action === 'connect') {
    const { setupToken, person } = params;
    if (!setupToken) return j({ error: 'Missing setupToken' }, 400);
    if (!connKey || !memberId) return j({ error: 'Unauthorized' }, 401);
    try {
      // Claim only — the account probe below can be slow (bank-dependent) and risks
      // exceeding Edge's 25s cap, so institutions are resolved lazily on next 'accounts' call.
      const accessUrl = await claimAccessUrl(setupToken);
      await dbSet(connKey, householdId, {
        accessUrl, person: person || null, connectedAt: Date.now(),
        institutions: [] as { id: string; name: string }[],
      }, memberId);
      return j({ ok: true, institutions: [] });
    } catch (e: any) {
      return serverError(e?.message || 'connect failed', 'finance:connect', e);
    }
  }

  if (action === 'accounts') {
    if (!connKey) return j({ accounts: [] });
    const conn: any = await dbGet(connKey, householdId);
    if (!conn?.accessUrl) return j({ accounts: [] });
    if (!conn.institutions?.length) {
      // First load after connect: probe institutions now (last 1 day is enough for metadata).
      // fetchAccounts is bank-dependent and can be slow — long enough for a
      // concurrent disconnect (or disconnect+reconnect) to land on this same
      // connKey while this await is in flight. Re-read right before writing
      // and only proceed if accessUrl still matches what we probed; a
      // mismatch means the connection changed underneath us, and writing
      // back the stale `conn` object would resurrect a disconnected
      // connection (or clobber a newer one) with the old accessUrl.
      try {
        const now = new Date();
        const accts = await fetchAccounts(conn.accessUrl, new Date(now.getTime() - 86400000), now);
        const institutions = accts.map((a) => ({ id: a.id, name: a.org.name || a.name }));
        const current: any = await dbGet(connKey, householdId);
        if (current?.accessUrl === conn.accessUrl) {
          conn.institutions = institutions;
          await dbSet(connKey, householdId, { ...current, institutions }, memberId!);
        } else {
          conn.institutions = institutions; // reflect in this response only, don't persist
        }
      } catch {
        // Bank may still be provisioning; leave institutions empty and let the UI retry later.
      }
    }
    return j({ accounts: (conn.institutions || []).map((i: any) => ({
      person: conn.person, institutionName: i.name, connectedAt: conn.connectedAt, itemId: i.id,
    })) });
  }

  if (action === 'disconnect') {
    if (!connKey || !memberId) return j({ error: 'Unauthorized' }, 401);
    try {
      // {} not null — the value column may reject NULL, and dbGet's callers
      // (e.g. the 'accounts' check above) already treat a valueless/empty
      // record as "no connection" via `!conn`/`conn.accessUrl` checks.
      await dbSet(connKey, householdId, {}, memberId);
      return j({ ok: true });
    } catch (e: any) {
      return serverError(e?.message || 'disconnect failed', 'finance:disconnect', e);
    }
  }

  if (action === 'sync') {
    const days = params.action === 'sync' ? (params.days ?? 30) : 30;
    try {
      if (isWebhookAuth) {
        // No per-request session — an external caller (HA/Tasker/SimpleFIN
        // webhook) knows only the household, not which member's bank link
        // changed. Refresh every member's connection in this household.
        const members = await dbGetHouseholdMembersByHouseholdId(householdId);
        let synced = 0, accountsTotal = 0, subsTotal = 0;
        for (const m of members) {
          const r = await syncMemberFinance(householdId, m.id, days);
          synced += r.synced; accountsTotal += r.accounts; subsTotal += r.subscriptions;
        }
        return j({ synced, accounts: accountsTotal, subscriptions: subsTotal });
      }

      if (!memberId) return j({ error: 'Unauthorized' }, 401);
      const r = await syncMemberFinance(householdId, memberId, days);
      if (r.message) return j({ synced: 0, transactions: [], recurringBills: [], message: r.message });
      return j({ synced: r.synced, transactions: r.transactions, recurringBills: r.recurringBills, accounts: r.accounts });
    } catch (e: any) {
      return serverError(e?.message || 'sync failed', 'finance:sync', e);
    }
  }

  return j({ error: 'Unknown action. Use: connect, accounts, sync, disconnect' }, 400);
}
