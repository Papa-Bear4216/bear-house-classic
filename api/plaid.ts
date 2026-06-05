export const config = { runtime: 'edge' };

/**
 * /api/plaid  — unified Plaid handler
 *
 * POST /api/plaid  { action, ...params }
 *
 * action = 'link'        → create Link token              { userId, person }
 * action = 'exchange'    → exchange public token           { publicToken, userId, person, institutionName }
 * action = 'accounts'    → list connected institutions     (no auth — read-only metadata)
 * action = 'sync'        → pull transactions from Plaid
 *   - with token=WEBHOOK_TOKEN  → saves to DB (webhook / HA automation mode)
 *   - without token             → returns transactions to client (browser mode)
 * action = 'disconnect'  → remove a linked account         { itemId, token }
 */

import { dbGet, dbSet } from './_db.js';

const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || '';
const PLAID_SECRET    = process.env.PLAID_SECRET    || '';
const PLAID_ENV       = process.env.PLAID_ENV       || 'sandbox';
const WEBHOOK_TOKEN   = process.env.WEBHOOK_TOKEN   || '';

const PLAID_BASE: Record<string, string> = {
  sandbox:     'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production:  'https://production.plaid.com',
};

async function plaidPost(endpoint: string, body: any) {
  const base = PLAID_BASE[PLAID_ENV] || PLAID_BASE.sandbox;
  const res = await fetch(`${base}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': PLAID_SECRET,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_message || `Plaid ${res.status}`);
  return data;
}

function mapCategory(cats: string[]): string {
  const c = (cats?.[0] || '').toLowerCase();
  if (c.includes('food') || c.includes('restaurant')) return 'Food';
  if (c.includes('travel') || c.includes('transport') || c.includes('gas')) return 'Transportation';
  if (c.includes('shop') || c.includes('cloth') || c.includes('apparel')) return 'Clothing';
  if (c.includes('health') || c.includes('medical') || c.includes('pharmacy')) return 'Healthcare';
  if (c.includes('entertainment') || c.includes('recreation')) return 'Entertainment';
  if (c.includes('utilities') || c.includes('electric') || c.includes('internet')) return 'Utilities';
  if (c.includes('insurance')) return 'Insurance';
  if (c.includes('pet')) return 'Pets';
  if (c.includes('education') || c.includes('school') || c.includes('child')) return 'Kids';
  return 'Other';
}

function detectRecurring(expenses: any[]): { merchant: string; avgAmount: number }[] {
  const byMerchant: Record<string, number[]> = {};
  for (const e of expenses) {
    if (!e.notes || e.amount < 5) continue;
    const m = (e.notes as string).toLowerCase().trim();
    if (!byMerchant[m]) byMerchant[m] = [];
    byMerchant[m].push(e.amount);
  }
  return Object.entries(byMerchant)
    .filter(([, amounts]) => amounts.length >= 2)
    .map(([merchant, amounts]) => ({
      merchant,
      avgAmount: parseFloat((amounts.reduce((s, a) => s + a, 0) / amounts.length).toFixed(2)),
    }))
    .filter(s => s.avgAmount > 5);
}

function makeId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);
  if (!PLAID_CLIENT_ID || !PLAID_SECRET) return j({ error: 'Plaid not configured on this server.' }, 503);

  const body = await req.json().catch(() => ({})) as any;
  const { action, ...params } = body;

  // ── link: create Link token (no auth required — token is useless without completing Link UI) ──
  if (action === 'link') {
    const { userId = 'daddy', person = 'Daddy' } = params;
    try {
      const data = await plaidPost('/link/token/create', {
        user: { client_user_id: userId },
        client_name: 'Bear House',
        products: ['transactions'],
        country_codes: ['US'],
        language: 'en',
      });
      return j({ link_token: data.link_token, expiration: data.expiration });
    } catch (e: any) {
      return j({ error: e?.message }, 500);
    }
  }

  // ── exchange: swap public token → access token (stored server-side in DB) ──
  if (action === 'exchange') {
    const { publicToken, userId = 'daddy', person = 'Daddy', institutionName = 'Bank' } = params;
    if (!publicToken) return j({ error: 'Missing publicToken' }, 400);
    try {
      const exchangeData = await plaidPost('/item/public_token/exchange', { public_token: publicToken });
      const tokens: any[] = ((await dbGet('plaid_tokens')) ?? []) as any[];
      // Replace any existing entry for same user + institution
      const filtered = tokens.filter(
        (t: any) => !(t.userId === userId && t.institutionName === institutionName),
      );
      filtered.push({
        userId, person, institutionName,
        accessToken: exchangeData.access_token,
        itemId: exchangeData.item_id,
        connectedAt: Date.now(),
      });
      await dbSet('plaid_tokens', filtered);
      return j({ success: true, institutionName, itemId: exchangeData.item_id });
    } catch (e: any) {
      return j({ error: e?.message }, 500);
    }
  }

  // ── accounts: list connected institutions (no auth — returns metadata only, no secrets) ──
  if (action === 'accounts') {
    const tokens: any[] = ((await dbGet('plaid_tokens')) ?? []) as any[];
    return j({
      accounts: tokens.map((t: any) => ({
        person: t.person,
        institutionName: t.institutionName,
        connectedAt: t.connectedAt,
        itemId: t.itemId,
      })),
    });
  }

  // ── disconnect: remove a linked account (requires webhook token) ──
  if (action === 'disconnect') {
    const { itemId, token } = params;
    if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) return j({ error: 'Unauthorized' }, 401);
    const tokens: any[] = ((await dbGet('plaid_tokens')) ?? []) as any[];
    await dbSet('plaid_tokens', tokens.filter((t: any) => t.itemId !== itemId));
    return j({ ok: true });
  }

  // ── sync: pull transactions from all linked accounts ─────────────────────────
  if (action === 'sync') {
    const { token, days = 30 } = params;
    const isWebhookCall = WEBHOOK_TOKEN && token === WEBHOOK_TOKEN;

    const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const endDate   = new Date().toISOString().slice(0, 10);

    try {
      const tokens: any[] = ((await dbGet('plaid_tokens')) ?? []) as any[];
      if (tokens.length === 0) return j({ synced: 0, transactions: [], recurringBills: [], message: 'No linked accounts' });

      const newTransactions: any[] = [];

      for (const entry of tokens) {
        try {
          const data = await plaidPost('/transactions/get', {
            access_token: entry.accessToken,
            start_date: startDate,
            end_date: endDate,
            options: { count: 100 },
          });

          for (const txn of (data.transactions || []) as any[]) {
            if (txn.amount <= 0) continue;
            if ((txn.category || []).some((c: string) =>
              c.toLowerCase().includes('transfer') || c.toLowerCase().includes('payment'),
            )) continue;

            newTransactions.push({
              id: makeId(),
              amount: Math.abs(txn.amount),
              category: mapCategory(txn.category || []),
              paidBy: entry.person,
              owner: entry.userId,
              date: txn.date,
              notes: txn.merchant_name || txn.name || '',
              createdAt: Date.now(),
              plaidId: txn.transaction_id,
              source: 'plaid',
              institutionName: entry.institutionName,
            });
          }
        } catch { /* skip this token if it errors */ }
      }

      newTransactions.sort((a: any, b: any) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
      );

      const recurringBills = detectRecurring(newTransactions);

      // Webhook mode: persist to DB (for HA automation / cron triggers)
      if (isWebhookCall) {
        const existing: any[] = ((await dbGet('familyos_expenses')) ?? []) as any[];
        const existingIds = new Set(existing.filter((e: any) => e.plaidId).map((e: any) => e.plaidId));
        const fresh = newTransactions.filter((t: any) => !existingIds.has(t.plaidId));
        const merged = [...fresh, ...existing];
        merged.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        await dbSet('familyos_expenses', merged);

        if (recurringBills.length > 0) {
          const bills: any[] = ((await dbGet('familyos_bills')) ?? []) as any[];
          let added = 0;
          for (const sub of recurringBills) {
            if (!bills.some((b: any) => b.name.toLowerCase() === sub.merchant && b.source === 'plaid')) {
              bills.push({ id: makeId(), name: sub.merchant, amount: sub.avgAmount, dueDate: null, paid: false, recurring: true, createdAt: Date.now(), source: 'plaid' });
              added++;
            }
          }
          if (added > 0) await dbSet('familyos_bills', bills);
        }

        return j({ synced: fresh.length, accounts: tokens.length, subscriptions: recurringBills.length });
      }

      // Browser mode: return transactions directly to client
      return j({
        synced: newTransactions.length,
        transactions: newTransactions,
        recurringBills,
        accounts: tokens.length,
      });
    } catch (e: any) {
      return j({ error: e?.message || 'Sync failed' }, 500);
    }
  }

  return j({ error: 'Unknown action. Use: link, exchange, accounts, sync, disconnect' }, 400);
}
