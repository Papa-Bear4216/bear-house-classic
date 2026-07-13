// api/finance.ts
export const config = { runtime: 'edge' };

import { dbGet, dbSet } from './_db.js';
import { claimAccessUrl, fetchAccounts } from './_simplefin.js';
import { detectRecurring } from './_subscriptions.js';
import { categorize } from './_categorize.js';

const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

function makeId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);
  const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || '';
  const baseUrl = new URL(req.url).origin; // for self-call to /api/chat in categorize()
  const body = (await req.json().catch(() => ({}))) as any;
  const { action, ...params } = body;

  if (action === 'connect') {
    const { setupToken, person = 'Daddy' } = params;
    if (!setupToken) return j({ error: 'Missing setupToken' }, 400);
    try {
      // Claim only — the account probe below can be slow (bank-dependent) and risks
      // exceeding Edge's 25s cap, so institutions are resolved lazily on next 'accounts' call.
      const accessUrl = await claimAccessUrl(setupToken);
      await dbSet('simplefin_access', {
        accessUrl, person, connectedAt: Date.now(),
        institutions: [] as { id: string; name: string }[],
      });
      return j({ ok: true, institutions: [] });
    } catch (e: any) {
      return j({ error: e?.message || 'connect failed' }, 500);
    }
  }

  if (action === 'accounts') {
    const conn: any = await dbGet('simplefin_access');
    if (!conn) return j({ accounts: [] });
    if (!conn.institutions?.length) {
      // First load after connect: probe institutions now (last 1 day is enough for metadata).
      try {
        const now = new Date();
        const accts = await fetchAccounts(conn.accessUrl, new Date(now.getTime() - 86400000), now);
        conn.institutions = accts.map((a) => ({ id: a.id, name: a.org.name || a.name }));
        await dbSet('simplefin_access', conn);
      } catch {
        // Bank may still be provisioning; leave institutions empty and let the UI retry later.
      }
    }
    return j({ accounts: (conn.institutions || []).map((i: any) => ({
      person: conn.person, institutionName: i.name, connectedAt: conn.connectedAt, itemId: i.id,
    })) });
  }

  if (action === 'disconnect') {
    const { token } = params;
    if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) return j({ error: 'Unauthorized' }, 401);
    await dbSet('simplefin_access', null);
    return j({ ok: true });
  }

  if (action === 'sync') {
    const { days = 30, token } = params;
    const isWebhook = WEBHOOK_TOKEN && token === WEBHOOK_TOKEN;
    const conn: any = await dbGet('simplefin_access');
    if (!conn?.accessUrl) return j({ synced: 0, transactions: [], recurringBills: [], message: 'No linked accounts' });

    try {
      const end = new Date();
      const start = new Date(Date.now() - Math.min(days, 90) * 86400000); // cap 90d
      const accounts = await fetchAccounts(conn.accessUrl, start, end);

      const cache: Record<string, string> = (await dbGet('merchant_category_cache')) ?? {};
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
      await dbSet('merchant_category_cache', cache); // categorize mutates cache in place

      const transactions = categorized.map((t) => ({
        id: makeId(),
        amount: t.amount,
        category: t.category,
        paidBy: conn.person,
        date: t.date,
        notes: t.notes,
        createdAt: Date.now(),
        extId: t.extId,
        source: 'simplefin',
        institutionName: t.institutionName,
      }));
      transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const recurringBills = detectRecurring(transactions);

      if (isWebhook) {
        const existing: any[] = (await dbGet('familyos_expenses')) ?? [];
        const seen = new Set(existing.filter((e: any) => e.extId).map((e: any) => e.extId));
        const fresh = transactions.filter((t) => !seen.has(t.extId));
        const merged = [...fresh, ...existing].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        await dbSet('familyos_expenses', merged);

        if (recurringBills.length) {
          const bills: any[] = (await dbGet('familyos_bills')) ?? [];
          let added = 0;
          for (const sub of recurringBills) {
            if (!bills.some((b: any) => b.name.toLowerCase() === sub.merchant.toLowerCase() && b.source === 'simplefin')) {
              bills.push({ id: makeId(), name: sub.merchant, amount: sub.avgAmount, dueDate: null, paid: false, recurring: true, cadence: sub.cadence, priceIncreased: sub.priceIncreased, createdAt: Date.now(), source: 'simplefin' });
              added++;
            }
          }
          if (added) await dbSet('familyos_bills', bills);
        }
        return j({ synced: fresh.length, accounts: accounts.length, subscriptions: recurringBills.length });
      }

      return j({ synced: transactions.length, transactions, recurringBills, accounts: accounts.length });
    } catch (e: any) {
      return j({ error: e?.message || 'sync failed' }, 500);
    }
  }

  return j({ error: 'Unknown action. Use: connect, accounts, sync, disconnect' }, 400);
}
