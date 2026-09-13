// api/finance-sync.ts
export const config = { runtime: 'edge' };

import { allHouseholdIds, dbGetHouseholdMembersByHouseholdId } from './_db.js';
import { runDailyBrainChecks } from './daily-brain.js';
import { notifyPush } from './_notify.js';
import { json as j } from './_responseHelpers.js';
import { syncMemberFinance } from './_financeCore.js';

/**
 * One push per household per daily run, only when there's something to say —
 * bundling by construction (never one notification per finding). emotionsFlagged
 * is deliberately NOT counted: that write is for Hermes' household_memory, not
 * for pinging family devices.
 */
async function maybeNotifyDailySummary(
  householdId: string,
  dailyBrain: { shoppingAdded: string[]; tasksAdded: string[]; carMaintenanceAdded: string[]; gmailTasksAdded: string[] } | { error: string }
): Promise<void> {
  if (!dailyBrain || 'error' in dailyBrain) return;
  const total =
    dailyBrain.shoppingAdded.length +
    dailyBrain.tasksAdded.length +
    dailyBrain.carMaintenanceAdded.length +
    dailyBrain.gmailTasksAdded.length;
  if (total === 0) return; // silent day

  const parts: string[] = [];
  if (dailyBrain.shoppingAdded.length) parts.push(`${dailyBrain.shoppingAdded.length} to the shopping list`);
  if (dailyBrain.tasksAdded.length) parts.push(`${dailyBrain.tasksAdded.length} new task${dailyBrain.tasksAdded.length > 1 ? 's' : ''}`);
  if (dailyBrain.carMaintenanceAdded.length) parts.push(`${dailyBrain.carMaintenanceAdded.length} car maintenance item${dailyBrain.carMaintenanceAdded.length > 1 ? 's' : ''}`);
  if (dailyBrain.gmailTasksAdded.length) parts.push(`${dailyBrain.gmailTasksAdded.length} from email`);

  await notifyPush(householdId, `Bear House — ${total} thing${total > 1 ? 's' : ''} need attention`, parts.join(' · '));
}

// True Vercel cron — no per-request session, so it fans out over every
// household independently instead of assuming a single one.
export default async function handler(req: Request): Promise<Response> {
  const baseUrl = new URL(req.url).origin; // for self-call to /api/chat in categorize()
  const householdIds = await allHouseholdIds();
  const results = await Promise.all(householdIds.map(async (householdId) => {
    const sync = await syncHousehold(baseUrl, householdId);
    // Piggybacks on this cron rather than getting its own — see daily-brain.ts.
    const dailyBrain = await runDailyBrainChecks(householdId);
    await maybeNotifyDailySummary(householdId, dailyBrain);
    return { ...sync, dailyBrain };
  }));
  return j({ households: results });
}

/**
 * Each household member links their own bank account (see api/finance.ts and
 * api/_financeCore.ts), so a household with N members can have up to N
 * independent SimpleFIN connections. Fan out over the roster and sync
 * whichever members actually have one — most will have none.
 */
async function syncHousehold(baseUrl: string, householdId: string): Promise<{ householdId: string; synced?: number; subscriptions?: number; message?: string; error?: string }> {
  try {
    const members = await dbGetHouseholdMembersByHouseholdId(householdId);
    let synced = 0, subscriptions = 0, anyConnected = false;
    for (const m of members) {
      const r = await syncMemberFinance(baseUrl, householdId, m.id, 30);
      if (r.accounts > 0 || r.synced > 0) anyConnected = true;
      synced += r.synced;
      subscriptions += r.subscriptions;
    }
    if (!anyConnected) return { householdId, synced: 0, message: 'No linked accounts' };
    return { householdId, synced, subscriptions };
  } catch (e: any) {
    return { householdId, error: e?.message || 'sync failed' };
  }
}
