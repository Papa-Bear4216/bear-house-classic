// api/finance-sync.ts
export const config = { runtime: 'edge' };

import { dbGet, dbSet, soleHouseholdId } from './_db.js';
import { fetchAccounts } from './_simplefin.js';
import { detectRecurring } from './_subscriptions.js';
import { categorize } from './_categorize.js';

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
function makeId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

// Server-side daily sync — same logic as finance.ts sync/webhook branch, no token needed (cron is trusted).
export default async function handler(req: Request): Promise<Response> {
  const baseUrl = new URL(req.url).origin; // for self-call to /api/chat in categorize()
  const householdId = await soleHouseholdId();
  const conn: any = await dbGet('simplefin_access', householdId);
  if (!conn?.accessUrl) return j({ synced: 0, message: 'No linked accounts' });
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
    return j({ synced: fresh.length, subscriptions: bills.length });
  } catch (e: any) {
    return j({ error: e?.message || 'sync failed' }, 500);
  }
}
