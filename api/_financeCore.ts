// api/_financeCore.ts
// Shared per-member SimpleFIN sync logic, used by both the user-triggered
// sync in finance.ts and the daily cron in finance-sync.ts. Centralized so
// the two paths can't drift on how a member's bank data gets categorized,
// stored, and scoped.
//
// Every read/write here is keyed by `${key}_${memberId}` and written with
// ownerMemberId set — this is what keeps one household member's linked bank
// data (accounts, transactions, detected subscriptions) out of another
// member's reach at the database RLS layer, not just hidden in the UI. See
// supabase/migrations/*_scope_family_data_by_owner.sql.

import { dbGet, dbSet } from './_db.js';
import { fetchAccounts } from './_simplefin.js';
import { detectRecurring } from './_subscriptions.js';
import { categorize } from './_categorize.js';

function makeId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

export type MemberSyncResult = {
  synced: number;
  accounts: number;
  subscriptions: number;
  transactions?: any[];
  recurringBills?: any[];
  message?: string;
};

export async function syncMemberFinance(
  baseUrl: string,
  householdId: string,
  memberId: string,
  days: number,
): Promise<MemberSyncResult> {
  const connKey = `simplefin_access_${memberId}`;
  const conn: any = await dbGet(connKey, householdId);
  if (!conn?.accessUrl) return { synced: 0, accounts: 0, subscriptions: 0, message: 'No linked accounts' };

  const end = new Date();
  const start = new Date(Date.now() - Math.min(days, 90) * 86400000); // cap 90d
  const accounts = await fetchAccounts(conn.accessUrl, start, end);

  const cacheKey = `merchant_category_cache_${memberId}`;
  const cache: Record<string, string> = (await dbGet(cacheKey, householdId)) ?? {};
  const raw: any[] = [];
  for (const acct of accounts) {
    for (const t of acct.transactions) {
      const amt = parseFloat(t.amount);
      if (amt >= 0) continue;            // only spending (money out is negative)
      if (t.pending) continue;
      raw.push({
        extId: t.id,
        amount: Math.abs(amt),
        date: new Date(t.posted * 1000).toISOString().slice(0, 10),
        notes: t.description,
        institutionName: acct.org.name || acct.name,
      });
    }
  }

  // Categorize (uses cache; only new merchants hit the model via /api/chat).
  const categorized = await categorize(baseUrl, raw, cache);
  await dbSet(cacheKey, householdId, cache, memberId); // categorize mutates cache in place

  const transactions = categorized.map((t) => ({
    id: makeId(),
    amount: t.amount,
    category: t.category,
    paidBy: conn.person,
    ownerId: memberId,
    date: t.date,
    notes: t.notes,
    createdAt: Date.now(),
    extId: t.extId,
    source: 'simplefin',
    institutionName: t.institutionName,
  }));
  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const expKey = `familyos_expenses_${memberId}`;
  const existing: any[] = (await dbGet(expKey, householdId)) ?? [];
  const seen = new Set(existing.filter((e: any) => e.extId).map((e: any) => e.extId));
  const fresh = transactions.filter((t) => !seen.has(t.extId));
  const merged = [...fresh, ...existing].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  await dbSet(expKey, householdId, merged, memberId);

  const recurringBills = detectRecurring(transactions);
  if (recurringBills.length) {
    const billsKey = `familyos_bills_${memberId}`;
    const bills: any[] = (await dbGet(billsKey, householdId)) ?? [];
    let added = 0;
    for (const sub of recurringBills) {
      if (!bills.some((b: any) => b.name.toLowerCase() === sub.merchant.toLowerCase() && b.source === 'simplefin')) {
        bills.push({ id: makeId(), name: sub.merchant, amount: sub.avgAmount, dueDate: null, paid: false, recurring: true, cadence: sub.cadence, priceIncreased: sub.priceIncreased, createdAt: Date.now(), source: 'simplefin' });
        added++;
      }
    }
    if (added) await dbSet(billsKey, householdId, bills, memberId);
  }

  return { synced: fresh.length, accounts: accounts.length, subscriptions: recurringBills.length, transactions, recurringBills };
}
