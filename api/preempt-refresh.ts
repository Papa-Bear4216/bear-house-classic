// api/preempt-refresh.ts
export const config = { runtime: 'edge' };

import { runFix } from './ha-fix.js';
import { json as j, serverError } from './_responseHelpers.js';

// Integrations whose tokens expire on a known cadence and can be refreshed with a Tier-1 action.
const PREEMPT_TARGETS = ['wyze_bridge'];

export default async function handler(req: Request): Promise<Response> {
  const CRON_SECRET = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization') || '';
  const suppliedToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!CRON_SECRET || suppliedToken !== CRON_SECRET) return j({ error: 'Unauthorized' }, 401);
  if (req.method !== 'GET') return j({ error: 'Method not allowed' }, 405);

  // Same single-household pinning as api/health-check.ts — this cron has no
  // per-request household context, so it can only ever refresh this one household.
  const householdId = process.env.HOME_ASSISTANT_HOUSEHOLD_ID;
  if (!householdId) return serverError('HOME_ASSISTANT_HOUSEHOLD_ID not configured', 'preempt-refresh');

  const refreshed: string[] = [];
  for (const id of PREEMPT_TARGETS) {
    const result = await runFix(householdId, id);
    if (result.ok) refreshed.push(id);
  }
  return j({ ok: true, refreshed });
}
