// api/finance-sync.ts
export const config = { runtime: 'edge' };

import { dbGet, dbSet, allHouseholdIds } from './_db.js';
import { fetchAccounts } from './_simplefin.js';
import { detectRecurring } from './_subscriptions.js';
import { categorize } from './_categorize.js';
import { runDailyBrainChecks } from './daily-brain.js';
import { notifyPush } from './_notify.js';
import { json as j } from './_responseHelpers.js';

function makeId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

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

async function syncHousehold(baseUrl: string, householdId: string): Promise<{ householdId: string; synced?: number; subscriptions?: number; message?: string; error?: string }> {
  const conn: any = await dbGet('simplefin_access', householdId);
  if (!conn?.accessUrl) return { householdId, synced: 0, message: 'No linked accounts' };
  try {
    const end = new Date();
    const start = new Date(Date.now() - 30 * 86400000);
    const accounts = await fetchAccounts(conn.accessUrl, start, end);
    const cache: Record<string, string> = (await dbGet('merchant_category_cache', householdId)) ?? {};

    const raw: any[] = [];
    for (const acct of accounts) for (const t of acct.transactions) {
      const amt = parseFloat(t.amount);
      if (amt >= 0 || t.pending) continue;
      raw.push({ extId: t.id, amount: Math.abs(amt), date: new Date(t.posted * 1000).toISOString().slice(0, 10), notes: t.description, institutionName: acct.org.name || acct.name });
    }
    const categorized = await categorize(baseUrl, raw, cache);
    await dbSet('merchant_category_cache', householdId, cache);

    const txns = categorized.map((t) => ({ id: makeId(), amount: t.amount, category: t.category, paidBy: conn.person, date: t.date, notes: t.notes, createdAt: Date.now(), extId: t.extId, source: 'simplefin', institutionName: t.institutionName }));

    const existing: any[] = (await dbGet('familyos_expenses', householdId)) ?? [];
    const seen = new Set(existing.filter((e: any) => e.extId).map((e: any) => e.extId));
    const fresh = txns.filter((t) => !seen.has(t.extId));
    const merged = [...fresh, ...existing].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    await dbSet('familyos_expenses', householdId, merged);

    const bills = detectRecurring(txns);
    if (bills.length) {
      const existingBills: any[] = (await dbGet('familyos_bills', householdId)) ?? [];
      let added = 0;
      for (const s of bills) {
        if (!existingBills.some((b: any) => b.name.toLowerCase() === s.merchant.toLowerCase() && b.source === 'simplefin')) {
          existingBills.push({ id: makeId(), name: s.merchant, amount: s.avgAmount, dueDate: null, paid: false, recurring: true, cadence: s.cadence, priceIncreased: s.priceIncreased, createdAt: Date.now(), source: 'simplefin' });
          added++;
        }
      }
      if (added) await dbSet('familyos_bills', householdId, existingBills);
    }
    return { householdId, synced: fresh.length, subscriptions: bills.length };
  } catch (e: any) {
    return { householdId, error: e?.message || 'sync failed' };
  }
}
