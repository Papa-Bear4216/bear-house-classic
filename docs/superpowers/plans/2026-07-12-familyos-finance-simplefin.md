# FamilyOS Finance — Plaid→SimpleFIN Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Plaid bank aggregation with SimpleFIN Bridge (read-only, $15/yr), add AI-based transaction categorization, upgrade the subscription finder to real cadence detection, add history-based budget suggestions, and run a daily auto-sync — with Plaid removed entirely.

**Architecture:** A new `api/finance.ts` Edge route claims a SimpleFIN access URL from a setup token (`connect`) and pulls transactions (`sync`) via HTTP Basic Auth. Pure logic (subscription cadence detection, category normalization) lives in underscore-prefixed helper modules so it's isolated and directly runnable. AI categorization calls the existing Claude route pattern and caches merchant→category mappings. A daily cron hits `sync` in webhook mode. The FinanceHub UI swaps its Plaid panel for a SimpleFIN connect panel; the budget/expense UI is otherwise unchanged.

**Tech Stack:** Vercel Edge Functions, TypeScript, Supabase REST (existing `api/_db.ts`), SimpleFIN Bridge protocol (base64 setup token → access URL → Basic Auth GET), Anthropic Claude (existing `api/chat.ts` pattern), React + Tailwind.

## Global Constraints

- All API routes use `export const config = { runtime: 'edge' }`.
- Reuse existing helpers: `dbGet`/`dbSet` (`api/_db.ts`), the Claude call pattern from `api/chat.ts`, the `WEBHOOK_TOKEN` guard pattern from `api/ha-webhook.ts`.
- New env vars: none required for connect (token comes from the user at runtime); `ANTHROPIC_API_KEY` (or whatever `api/chat.ts` already reads) for categorization; `WEBHOOK_TOKEN` for the daily-sync mode (already exists).
- SimpleFIN `/accounts` date range is capped at **90 days per request** — never request more in one call.
- SimpleFIN transaction fields: `id` (string), `posted` (epoch **seconds**), `amount` (string, signed — positive = money in), `description` (string). No category field — that's why AI categorization exists.
- Preserve the existing DB keys the rest of the app reads: `familyos_expenses`, `familyos_bills`. New keys: `simplefin_access`, `merchant_category_cache`.
- Expense object shape must stay compatible with `FinanceHub.tsx`'s `Expense` interface: `{ id, amount, category, paidBy, owner?, date, notes, createdAt, plaidId?, source?, institutionName? }`. Reuse `plaidId` as the dedupe id field (rename semantics to "external txn id"); keep the field name to avoid touching consumer code, OR add `extId` and update the dedupe — the plan uses `extId` and updates both the route and the merge logic. **Chosen: add `extId`, keep `plaidId` optional for old rows.**
- No test framework — verify by running routes (curl) and the app.

---

### Task 1: Remove Plaid entirely

**Files:**
- Delete: `api/plaid.ts`
- Modify: `src/components/familyos/sections/FinanceHub.tsx` (remove `PlaidPanel`, `loadPlaidLink`, Plaid imports/usage)
- Modify: `package.json` (remove `plaid` dependency)

**Interfaces:**
- Produces: a FinanceHub with the Plaid panel removed and a placeholder where the SimpleFIN panel will mount (Task 6). Expenses/budget tabs untouched.

- [ ] **Step 1: Remove the Plaid dependency**

Run:
```bash
npm uninstall plaid
```
Expected: `plaid` removed from `package.json` dependencies.

- [ ] **Step 2: Delete the Plaid route**

Run:
```bash
git rm api/plaid.ts
```

- [ ] **Step 3: Strip Plaid from FinanceHub**

In `src/components/familyos/sections/FinanceHub.tsx`:
- Delete the `loadPlaidLink` function (the `cdn.plaid.com` script loader).
- Delete the entire `PlaidPanel` component and its `PlaidPanelProps` interface.
- In `ExpensesTab`, remove `<PlaidPanel currentUser={currentUser} onSync={handlePlaidSync} />` and leave a comment placeholder: `{/* SimpleFIN connect panel mounts here (Task 6) */}`.
- Keep `handlePlaidSync` for now but rename to `handleBankSync` (Task 6 reuses its merge logic). Update its single call site reference accordingly (it's passed to the panel — the placeholder means it's temporarily unused; that's fine, it's wired in Task 6).
- Remove now-unused imports: `Link2`, `Landmark` stays only if still referenced by the expense-row bank badge (it is — keep `Landmark`), `RefreshCw` stays if used elsewhere (it's used by the panel only — remove if no other use). Let the build tell you.

- [ ] **Step 4: Verify the build compiles without Plaid**

Run: `npm run build`
Expected: build succeeds. If it fails on an unused import, remove that import and rebuild. No reference to `Plaid`, `cdn.plaid.com`, or `/api/plaid` should remain — verify:
```bash
grep -rn "plaid\|Plaid" src/ api/ | grep -v "plaidId"
```
Expected: no matches (other than the optional legacy `plaidId` field on the Expense interface).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(finance): remove Plaid integration entirely"
```

---

### Task 2: SimpleFIN client helper (claim + fetch)

**Files:**
- Create: `api/_simplefin.ts`

**Interfaces:**
- Produces:
  - `async function claimAccessUrl(setupToken: string): Promise<string>` — base64-decodes the token to a claim URL, POSTs to it, returns the access URL (with embedded Basic Auth).
  - `async function fetchAccounts(accessUrl: string, startDate: Date, endDate: Date): Promise<SimpleFinAccount[]>` — GETs `/accounts` with a ≤90-day window; returns parsed accounts.
  - `type SimpleFinAccount = { id: string; org: { name?: string; domain?: string }; name: string; balance: string; currency: string; transactions: SimpleFinTxn[] }`
  - `type SimpleFinTxn = { id: string; posted: number; amount: string; description: string; pending?: boolean }`

- [ ] **Step 1: Write the client**

```ts
// api/_simplefin.ts
// SimpleFIN Bridge client — no SDK, pure fetch, Edge-safe.
// Flow: setup token (base64) → decode → POST → access URL (basic-auth embedded) → GET /accounts.

export type SimpleFinTxn = { id: string; posted: number; amount: string; description: string; pending?: boolean };
export type SimpleFinAccount = {
  id: string;
  org: { name?: string; domain?: string };
  name: string;
  balance: string;
  currency: string;
  transactions: SimpleFinTxn[];
};

export async function claimAccessUrl(setupToken: string): Promise<string> {
  // Setup token is a base64-encoded claim URL.
  const claimUrl = atob(setupToken.trim());
  const res = await fetch(claimUrl, { method: 'POST' });
  if (!res.ok) throw new Error(`SimpleFIN claim failed: ${res.status} (token may already be claimed)`);
  const accessUrl = (await res.text()).trim();
  if (!/^https?:\/\/.+@/.test(accessUrl)) throw new Error('SimpleFIN did not return a valid access URL');
  return accessUrl;
}

function toEpochSeconds(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

export async function fetchAccounts(accessUrl: string, startDate: Date, endDate: Date): Promise<SimpleFinAccount[]> {
  // Split embedded credentials out of the URL for the Authorization header (Edge fetch ignores userinfo in URL).
  const u = new URL(accessUrl);
  const auth = 'Basic ' + btoa(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`);
  u.username = ''; u.password = '';
  const base = u.toString().replace(/\/$/, '');

  const params = new URLSearchParams({
    'start-date': String(toEpochSeconds(startDate)),
    'end-date': String(toEpochSeconds(endDate)),
  });
  const res = await fetch(`${base}/accounts?${params.toString()}`, {
    headers: { Authorization: auth },
  });
  if (!res.ok) throw new Error(`SimpleFIN /accounts failed: ${res.status}`);
  const data = (await res.json()) as any;
  return (data.accounts || []).map((a: any) => ({
    id: a.id,
    org: { name: a.org?.name, domain: a.org?.domain },
    name: a.name,
    balance: a.balance,
    currency: a.currency,
    transactions: (a.transactions || []).map((t: any) => ({
      id: t.id, posted: t.posted, amount: t.amount, description: t.description, pending: t.pending,
    })),
  }));
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.node.json 2>&1 | grep _simplefin || echo "clean"`
Expected: `clean`

- [ ] **Step 3: Verify claim + fetch against a real setup token (requires a SimpleFIN account) — GO/NO-GO GATE**

Get a setup token from https://beta-bridge.simplefin.org (connect a bank, generate token). Verify via the `connect` route (Task 3) once it exists, or a scratch check. Confirm all three:
1. `claimAccessUrl` returns a URL matching `https://<user>:<pass>@<host>/<path>` — **note the path segment** (SimpleFIN Bridge access URLs end in a base path like `/simplefin`, not just the host). The `fetchAccounts` code preserves that path via `u.toString()` before appending `/accounts`, so `${base}/accounts` becomes `https://host/simplefin/accounts`. Eyeball the constructed request URL in a log to confirm it's `.../accounts`, not a doubled or truncated path.
2. `fetchAccounts` returns ≥1 account with a non-empty `transactions` array over a 30-day window.
3. Transaction `amount` is a signed string and `posted` is epoch **seconds** (a 10-digit number, not 13). If `posted` looks like milliseconds (13 digits), drop the `* 1000` in Task 3 — but SimpleFIN spec is seconds.

**This is the go/no-go gate for the whole migration.** If SimpleFIN can't reach your bank, stop. Since Plaid is already removed (Task 1), the documented fallback is manual entry until resolved.

- [ ] **Step 4: Commit**

```bash
git add api/_simplefin.ts
git commit -m "feat(finance): add SimpleFIN client helper"
```

---

### Task 3: `api/finance.ts` — connect + sync route

**Files:**
- Create: `api/finance.ts`

**Interfaces:**
- Consumes: `claimAccessUrl`, `fetchAccounts` (`api/_simplefin.ts`); `dbGet`/`dbSet` (`api/_db.ts`); `detectRecurring` (`api/_subscriptions.ts`, Task 4); `categorize` (`api/_categorize.ts`, Task 5).
- Produces: `POST /api/finance` with `{ action, ...params }`:
  - `connect` `{ setupToken, person? }` → claims + stores access URL at `simplefin_access`. Returns `{ ok: true, institutions: string[] }`.
  - `accounts` → returns stored connection metadata (no secrets).
  - `sync` `{ days?=30, token? }` → pulls transactions, categorizes, dedupes, detects subscriptions. Webhook mode (token===WEBHOOK_TOKEN) persists to `familyos_expenses`/`familyos_bills`; browser mode returns them. Returns `{ synced, transactions, recurringBills, accounts }`.
  - `disconnect` `{ token }` → clears `simplefin_access` (token-guarded).
- Expense objects use `extId` (SimpleFIN txn id) for dedupe; `source: 'simplefin'`.

- [ ] **Step 1: Write the route**

```ts
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
      const accessUrl = await claimAccessUrl(setupToken);
      // Probe once to list institutions (last 1 day is enough for account metadata).
      const now = new Date();
      const accts = await fetchAccounts(accessUrl, new Date(now.getTime() - 86400000), now);
      await dbSet('simplefin_access', {
        accessUrl, person, connectedAt: Date.now(),
        institutions: accts.map((a) => ({ id: a.id, name: a.org.name || a.name })),
      });
      return j({ ok: true, institutions: accts.map((a) => a.org.name || a.name) });
    } catch (e: any) {
      return j({ error: e?.message || 'connect failed' }, 500);
    }
  }

  if (action === 'accounts') {
    const conn: any = await dbGet('simplefin_access');
    if (!conn) return j({ accounts: [] });
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
```

- [ ] **Step 2: Verify `accounts` on an empty connection**

Run:
```bash
curl -s -X POST "$BASE_URL/api/finance" -H "Content-Type: application/json" -d '{"action":"accounts"}'
```
Expected: `{"accounts":[]}` (before connecting).

- [ ] **Step 3: Verify `connect` with a real setup token**

Run:
```bash
curl -s -X POST "$BASE_URL/api/finance" -H "Content-Type: application/json" \
  -d '{"action":"connect","setupToken":"<YOUR_BASE64_SETUP_TOKEN>","person":"Daddy"}'
```
Expected: `{"ok":true,"institutions":["<your bank name>"]}`.

- [ ] **Step 4: Verify `sync` (browser mode) returns categorized transactions**

Run:
```bash
curl -s -X POST "$BASE_URL/api/finance" -H "Content-Type: application/json" -d '{"action":"sync","days":30}'
```
Expected: `{"synced":N,"transactions":[{...,"category":"...","source":"simplefin"}],"recurringBills":[...]}` with non-empty `category` on each transaction.

- [ ] **Step 5: Commit**

```bash
git add api/finance.ts
git commit -m "feat(finance): add SimpleFIN connect+sync route"
```

---

### Task 4: Subscription finder — real cadence detection

**Files:**
- Create: `api/_subscriptions.ts`

**Interfaces:**
- Produces: `function detectRecurring(expenses: Array<{ amount: number; date: string; notes: string }>): RecurringBill[]`
  - `type RecurringBill = { merchant: string; avgAmount: number; cadence: 'weekly' | 'monthly' | 'irregular'; priceIncreased: boolean; occurrences: number }`
- Normalizes merchant names, groups, computes median interval between occurrences, classifies cadence, flags price creep (latest amount > 1.15 × earliest).

- [ ] **Step 1: Write the detector**

```ts
// api/_subscriptions.ts
// Pure logic — detects recurring merchants with cadence + price-creep. No I/O.

export type RecurringBill = {
  merchant: string; avgAmount: number;
  cadence: 'weekly' | 'monthly' | 'irregular';
  priceIncreased: boolean; occurrences: number;
};

// Normalize a raw description into a stable merchant key.
export function normalizeMerchant(desc: string): string {
  return (desc || '')
    .toUpperCase()
    .replace(/\b\d{2,}\b/g, ' ')          // strip long digit runs (store #, txn ids)
    .replace(/[^A-Z ]/g, ' ')             // strip punctuation
    .replace(/\b(INC|LLC|COM|PURCHASE|PAYMENT|POS|DEBIT|AUTOPAY)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function detectRecurring(
  expenses: Array<{ amount: number; date: string; notes: string }>,
): RecurringBill[] {
  const groups: Record<string, Array<{ amount: number; date: string }>> = {};
  for (const e of expenses) {
    if (e.amount < 3) continue;
    const key = normalizeMerchant(e.notes);
    if (!key) continue;
    (groups[key] ||= []).push({ amount: e.amount, date: e.date });
  }

  const bills: RecurringBill[] = [];
  for (const [merchant, items] of Object.entries(groups)) {
    if (items.length < 2) continue;
    items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const intervals: number[] = [];
    for (let i = 1; i < items.length; i++) {
      const days = (new Date(items[i].date).getTime() - new Date(items[i - 1].date).getTime()) / 86400000;
      intervals.push(days);
    }
    const medInterval = median(intervals);

    let cadence: RecurringBill['cadence'] = 'irregular';
    if (medInterval >= 5 && medInterval <= 9) cadence = 'weekly';
    else if (medInterval >= 26 && medInterval <= 35) cadence = 'monthly';

    // Only treat weekly/monthly with consistent-ish amounts as subscriptions.
    if (cadence === 'irregular') continue;

    const amounts = items.map((i) => i.amount);
    const avgAmount = parseFloat((amounts.reduce((s, a) => s + a, 0) / amounts.length).toFixed(2));
    const priceIncreased = amounts[amounts.length - 1] > amounts[0] * 1.15;

    bills.push({ merchant, avgAmount, cadence, priceIncreased, occurrences: items.length });
  }
  return bills;
}
```

- [ ] **Step 2: Sanity-check the logic with a scratch run**

Create a temp file `scratch-sub.mjs` (delete after):
```js
import { detectRecurring, normalizeMerchant } from './api/_subscriptions.ts';
```
Since Edge TS isn't directly node-runnable, instead verify via the `sync` route in Task 3 Step 4: confirm a known monthly subscription (e.g. Netflix appearing ~monthly in your data) shows up in `recurringBills` with `cadence:"monthly"`, and a twice-weekly coffee run does NOT (it's `weekly`-cadence but caught only if ≥2 same-merchant — acceptable; irregular coffee is filtered). No separate runner needed.

Run (reuses Task 3): confirm `recurringBills` in the sync response contains real monthly merchants and excludes one-off purchases.
Expected: monthly streaming services present with `cadence:"monthly"`; random one-time purchases absent.

- [ ] **Step 3: Commit**

```bash
git add api/_subscriptions.ts
git commit -m "feat(finance): add cadence-based subscription detection"
```

---

### Task 5: AI categorization helper

**Files:**
- Create: `api/_categorize.ts`
- Reference: `api/chat.ts` (copy its Claude call + env var + model name exactly)

**Interfaces:**
- Consumes: the Claude call pattern from `api/chat.ts` (same `ANTHROPIC_API_KEY`, same model id, same fallback if any).
- Produces: `async function categorize(txns: Array<{ notes: string } & T>, cache: Record<string,string>): Promise<Array<T & { category: string }>>` — mutates `cache` in place (merchant→category); only uncached merchants are sent to the model in one batched call. Categories constrained to the FinanceHub set.

- [ ] **Step 1: Confirm the existing AI route contract (verified during planning)**

`api/chat.ts` is the canonical AI route. Verified facts (do NOT re-guess):
- Endpoint `https://api.anthropic.com/v1/messages`; headers `x-api-key` + `anthropic-version: 2023-06-01`.
- Env vars: **`ANTHROPIC_API_KEY`** (primary) and **`GEMINI_API_KEY`** (fallback). The route falls back to Gemini (`gemini-2.0-flash`) if Anthropic is missing/errors.
- Model id: **`claude-haiku-4-5-20251001`** for `maxTokens <= 512` (the small/cheap tier — correct for categorization). NOT `claude-3-5-haiku-latest`.
- Response shape: `{ text: string }` (the route wraps `data.content[0].text`).

**Do not re-implement the Anthropic/Gemini call.** Instead, `api/_categorize.ts` calls the existing `/api/chat` route internally (self-call) so it inherits the Gemini fallback for free. Confirm the route responds:
```bash
curl -s -X POST "$BASE_URL/api/chat" -H "Content-Type: application/json" -d '{"prompt":"reply with the word ok","maxTokens":16}'
```
Expected: `{"text":"...ok..."}`.

- [ ] **Step 2: Write the categorizer (delegates to /api/chat for the AI call + fallback)**

```ts
// api/_categorize.ts
// AI transaction categorization with a merchant→category cache.
// Delegates the model call to /api/chat so it inherits the Claude→Gemini fallback.

import { normalizeMerchant } from './_subscriptions.js';

const CATEGORIES = ['Housing','Food','Transportation','Utilities','Insurance','Entertainment','Clothing','Healthcare','Savings','Kids','Pets','Other'];

async function classifyBatch(baseUrl: string, merchants: string[]): Promise<Record<string, string>> {
  if (merchants.length === 0) return {};
  const prompt = `Categorize each merchant into exactly one of: ${CATEGORIES.join(', ')}.
Return ONLY a JSON object mapping the merchant string to its category. Merchants:
${merchants.map((m) => `- ${m}`).join('\n')}`;

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // maxTokens<=512 picks the cheap haiku tier in api/chat.ts; enough for a JSON map.
      body: JSON.stringify({ prompt, maxTokens: 512 }),
    });
    if (!res.ok) throw new Error(`chat ${res.status}`);
    const data = (await res.json()) as any;
    const text = data?.text ?? '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    const out: Record<string, string> = {};
    for (const m of merchants) {
      const c = parsed[m];
      out[m] = CATEGORIES.includes(c) ? c : 'Other';
    }
    return out;
  } catch {
    return Object.fromEntries(merchants.map((m) => [m, 'Other']));
  }
}

export async function categorize<T extends { notes: string }>(
  baseUrl: string,
  txns: T[],
  cache: Record<string, string>,
): Promise<Array<T & { category: string }>> {
  const keyed = txns.map((t) => ({ t, key: normalizeMerchant(t.notes) }));
  const uncached = [...new Set(keyed.map((k) => k.key).filter((k) => k && !(k in cache)))];
  if (uncached.length) {
    const results = await classifyBatch(baseUrl, uncached);
    for (const [m, c] of Object.entries(results)) cache[m] = c;
  }
  return keyed.map(({ t, key }) => ({ ...t, category: cache[key] || 'Other' }));
}
```

`baseUrl` is the deployment origin (e.g. `new URL(req.url).origin` in a route). Callers pass it so the self-call to `/api/chat` resolves in every environment.

- [ ] **Step 3: Verify categorization end-to-end (via sync)**

Reuses Task 3 Step 4. Confirm each returned transaction has a `category` from the allowed set, and that a re-run is faster / makes no new model call for already-seen merchants (check `merchant_category_cache` grew):
```bash
curl -s "https://pbiffzdcythkwtwxtqlu.supabase.co/rest/v1/family_data?key=eq.merchant_category_cache&select=value" -H "apikey: $SUPABASE_ANON_KEY"
```
Expected: a populated merchant→category object.

- [ ] **Step 5: Commit**

```bash
git add api/_categorize.ts
git commit -m "feat(finance): add AI transaction categorization with cache"
```

---

### Task 6: FinanceHub SimpleFIN connect panel

**Files:**
- Modify: `src/components/familyos/sections/FinanceHub.tsx`

**Interfaces:**
- Consumes: `POST /api/finance` (`connect`, `accounts`, `sync`). Reuses the `handleBankSync` merge logic left from Task 1.
- Produces: a `SimpleFinPanel` replacing the old `PlaidPanel` at the placeholder — a setup-token paste field + Connect button + Sync button + connected-institution list.

- [ ] **Step 1: Add the SimpleFIN panel component**

In `src/components/familyos/sections/FinanceHub.tsx`, add this component (near where `PlaidPanel` was):

```tsx
const SimpleFinPanel: React.FC<{ currentUser: any; onSync: (t: Expense[], b: any[]) => void }> = ({ currentUser, onSync }) => {
  const [accounts, setAccounts] = useState<PlaidAccount[]>([]);
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState(''); const [msgType, setMsgType] = useState<'ok'|'err'|''>('');
  const flash = (t: string, ty: 'ok'|'err'='ok') => { setMsg(t); setMsgType(ty); setTimeout(() => setMsg(''), 5000); };

  const loadAccounts = useCallback(async () => {
    try {
      const r = await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accounts' }) });
      const d = await r.json(); if (d.accounts) setAccounts(d.accounts);
    } catch {}
  }, []);
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const connect = async () => {
    if (!token.trim()) { flash('Paste your SimpleFIN setup token first', 'err'); return; }
    setConnecting(true);
    try {
      const r = await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'connect', setupToken: token.trim(), person: currentUser?.name || 'Daddy' }) });
      const d = await r.json();
      if (d.ok) { flash(`✓ Connected: ${(d.institutions||[]).join(', ')}`); setToken(''); loadAccounts(); }
      else flash(d.error || 'Connect failed', 'err');
    } catch (e: any) { flash(e.message, 'err'); } finally { setConnecting(false); }
  };

  const sync = async () => {
    setSyncing(true); flash('Pulling transactions…');
    try {
      const r = await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync', days: 30 }) });
      const d = await r.json(); if (d.error) throw new Error(d.error);
      onSync(d.transactions || [], d.recurringBills || []);
      flash(`✓ ${d.synced ?? 0} imported${d.recurringBills?.length ? `, ${d.recurringBills.length} subscriptions` : ''}`);
    } catch (e: any) { flash(e.message || 'Sync failed', 'err'); } finally { setSyncing(false); }
  };

  return (
    <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Landmark className="w-4 h-4 text-emerald-400" />
        <span className="text-white text-sm font-semibold">Linked Bank Accounts (SimpleFIN)</span>
        {accounts.length > 0 && <span className="bg-emerald-900/50 border border-emerald-600/30 text-emerald-300 text-xs px-1.5 py-0.5 rounded-full">{accounts.length}</span>}
      </div>
      {msg && <div className={`text-xs px-3 py-2 rounded-lg ${msgType === 'err' ? 'bg-rose-950/40 text-rose-300' : 'bg-emerald-950/40 text-emerald-300'}`}>{msg}</div>}
      {accounts.length > 0 ? (
        <div className="space-y-2">{accounts.map(a => (
          <div key={a.itemId} className="flex items-center gap-3 bg-slate-900/50 border border-slate-700/50 rounded-xl px-3 py-2.5">
            <Building2 className="w-4 h-4 text-slate-400" />
            <div className="flex-1 min-w-0"><div className="text-white text-sm truncate">{a.institutionName}</div>
            <div className="text-slate-500 text-xs">{a.person} · {new Date(a.connectedAt).toLocaleDateString()}</div></div>
            <span className="text-emerald-400 text-xs">Active</span>
          </div>))}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-slate-500 text-xs">Get a setup token at beta-bridge.simplefin.org, then paste it here.</p>
          <input value={token} onChange={e => setToken(e.target.value)} placeholder="SimpleFIN setup token"
            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none" />
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={connect} disabled={connecting} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs px-3 py-2 rounded-lg">
          {connecting ? 'Connecting…' : 'Connect'}
        </button>
        {accounts.length > 0 && (
          <button onClick={sync} disabled={syncing} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs px-3 py-2 rounded-lg">
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing…' : 'Sync 30 days'}
          </button>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Mount it at the placeholder**

Replace the `{/* SimpleFIN connect panel mounts here (Task 6) */}` placeholder in `ExpensesTab` with:
```tsx
<SimpleFinPanel currentUser={currentUser} onSync={handleBankSync} />
```
Ensure `RefreshCw`, `Landmark`, `Building2` are imported (add any missing to the lucide-react import). Ensure `handleBankSync` still merges by `extId` (update the dedupe key from `plaidId` to `extId` inside it):
```tsx
const existingIds = new Set(prev.filter(e => e.extId).map(e => e.extId));
const fresh = transactions.filter(t => !existingIds.has(t.extId));
```
And add `extId?: string` to the `Expense` interface.

- [ ] **Step 3: Verify build + render**

Run: `npm run build` → expected: clean.
Then `npm run dev`, log in as adult, open Finance Hub → expected: a "Linked Bank Accounts (SimpleFIN)" panel with a token field and Connect button. Paste a real token → Connect → institution appears → Sync → categorized expenses populate the list.

- [ ] **Step 4: Commit**

```bash
git add src/components/familyos/sections/FinanceHub.tsx
git commit -m "feat(finance): add SimpleFIN connect panel to FinanceHub"
```

---

### Task 7: History-based budget suggestions

**Files:**
- Modify: `src/components/familyos/sections/FinanceHub.tsx` (`BudgetTab`)

**Interfaces:**
- Consumes: existing `familyos_expenses` (via `loadJSON`).
- Produces: a "Suggest" affordance in `BudgetTab` that prefills a category's budget with the average of the last 3 months' actual spend in that category.

- [ ] **Step 1: Add the suggestion helper inside BudgetTab**

In `BudgetTab`, add:
```tsx
const suggestBudget = (catName: string): number => {
  const now = new Date();
  const months = [0, 1, 2].map(i => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return d.toISOString().slice(0, 7);
  });
  const totals = months.map(m =>
    expenses.filter(e => !e.deletedAt && e.category === catName && e.date.startsWith(m))
      .reduce((s, e) => s + e.amount, 0)
  ).filter(t => t > 0);
  if (!totals.length) return 0;
  return Math.round(totals.reduce((s, t) => s + t, 0) / totals.length);
};
```

- [ ] **Step 2: Wire a "Suggest" button into the set-budget form**

In the budget form (where `budgeted` is entered), add next to the input:
```tsx
<button type="button" onClick={() => setBudgeted(String(suggestBudget(name)))}
  className="text-xs text-emerald-400 hover:text-emerald-300 whitespace-nowrap">
  Suggest ({`$${suggestBudget(name)}`})
</button>
```

- [ ] **Step 3: Verify**

Run `npm run dev`, Finance Hub → Budget → Set Budget. Pick a category you have past spend in.
Expected: the "Suggest ($X)" button shows a non-zero amount; clicking it fills the budget field with the 3-month average.

- [ ] **Step 4: Commit**

```bash
git add src/components/familyos/sections/FinanceHub.tsx
git commit -m "feat(finance): add history-based budget suggestions"
```

---

### Task 8: Daily auto-sync cron

**Files:**
- Modify: `vercel.json` (add finance cron)
- Create: `api/finance-sync.ts` (thin cron wrapper that calls sync in webhook mode)

**Interfaces:**
- Produces: `GET /api/finance-sync` — invokes the `sync` action in webhook mode server-side (so it persists to Supabase without exposing `WEBHOOK_TOKEN` in a cron URL). Returns the sync summary.

- [ ] **Step 1: Write the cron wrapper**

```ts
// api/finance-sync.ts
export const config = { runtime: 'edge' };

import { dbGet, dbSet } from './_db.js';
import { fetchAccounts } from './_simplefin.js';
import { detectRecurring } from './_subscriptions.js';
import { categorize } from './_categorize.js';

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
function makeId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

// Server-side daily sync — same logic as finance.ts sync/webhook branch, no token needed (cron is trusted).
export default async function handler(req: Request): Promise<Response> {
  const baseUrl = new URL(req.url).origin; // for self-call to /api/chat in categorize()
  const conn: any = await dbGet('simplefin_access');
  if (!conn?.accessUrl) return j({ synced: 0, message: 'No linked accounts' });
  try {
    const end = new Date();
    const start = new Date(Date.now() - 30 * 86400000);
    const accounts = await fetchAccounts(conn.accessUrl, start, end);
    const cache: Record<string, string> = (await dbGet('merchant_category_cache')) ?? {};

    const raw: any[] = [];
    for (const acct of accounts) for (const t of acct.transactions) {
      const amt = parseFloat(t.amount);
      if (amt >= 0 || t.pending) continue;
      raw.push({ extId: t.id, amount: Math.abs(amt), date: new Date(t.posted * 1000).toISOString().slice(0, 10), notes: t.description, institutionName: acct.org.name || acct.name });
    }
    const categorized = await categorize(baseUrl, raw, cache);
    await dbSet('merchant_category_cache', cache);

    const txns = categorized.map((t) => ({ id: makeId(), amount: t.amount, category: t.category, paidBy: conn.person, date: t.date, notes: t.notes, createdAt: Date.now(), extId: t.extId, source: 'simplefin', institutionName: t.institutionName }));

    const existing: any[] = (await dbGet('familyos_expenses')) ?? [];
    const seen = new Set(existing.filter((e: any) => e.extId).map((e: any) => e.extId));
    const fresh = txns.filter((t) => !seen.has(t.extId));
    const merged = [...fresh, ...existing].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    await dbSet('familyos_expenses', merged);

    const bills = detectRecurring(txns);
    if (bills.length) {
      const existingBills: any[] = (await dbGet('familyos_bills')) ?? [];
      let added = 0;
      for (const s of bills) {
        if (!existingBills.some((b: any) => b.name.toLowerCase() === s.merchant.toLowerCase() && b.source === 'simplefin')) {
          existingBills.push({ id: makeId(), name: s.merchant, amount: s.avgAmount, dueDate: null, paid: false, recurring: true, cadence: s.cadence, priceIncreased: s.priceIncreased, createdAt: Date.now(), source: 'simplefin' });
          added++;
        }
      }
      if (added) await dbSet('familyos_bills', existingBills);
    }
    return j({ synced: fresh.length, subscriptions: bills.length });
  } catch (e: any) {
    return j({ error: e?.message || 'sync failed' }, 500);
  }
}
```

- [ ] **Step 2: Add the daily cron**

Add to the `crons` array in `vercel.json` (alongside the reliability crons if that plan ran first):
```json
    { "path": "/api/finance-sync", "schedule": "0 6 * * *" }
```
(Runs daily at 06:00.)

- [ ] **Step 3: Verify**

Run:
```bash
curl -s "$BASE_URL/api/finance-sync"
```
Expected: `{"synced":N,"subscriptions":M}` (or `{"synced":0,"message":"No linked accounts"}` if not yet connected). Re-run → `synced` drops toward 0 as dedupe kicks in.

- [ ] **Step 4: Commit**

```bash
git add api/finance-sync.ts vercel.json
git commit -m "feat(finance): add daily SimpleFIN auto-sync cron"
```

---

## Self-Review Notes

- **Spec coverage:** §5 SimpleFIN connect+sync → Tasks 2,3; Plaid removal → Task 1; AI categorization → Task 5 (+ cache); upgraded subscription finder → Task 4; budget suggestions → Task 7; daily cron → Task 8; connect UI → Task 6. All covered.
- **Type consistency:** `extId` is the dedupe key everywhere (route Task 3, merge Task 6, cron Task 8) — replaces `plaidId`; `plaidId?` kept optional on the interface for legacy rows only. `RecurringBill` shape (`merchant/avgAmount/cadence/priceIncreased/occurrences`) is consistent between Task 4 (producer) and Tasks 3/8 (consumers writing `familyos_bills`). `categorize(txns, cache)` mutates `cache` in place — both callers `dbSet` it after.
- **Duplication flagged:** Task 3's `sync` webhook branch and Task 8's cron share ~90% logic. This is intentional to keep the cron token-free and self-contained; if it drifts, extract a shared `_financeSync.ts`. Noted, not prematurely abstracted (YAGNI until it bites).
- **Go/no-go gate:** Task 2 Step 3 is the explicit checkpoint that SimpleFIN reaches the real bank. Since Plaid is deleted up front (user's choice), the documented fallback if it fails is manual entry until resolved.
- **Assumptions surfaced:** exact Claude model id + env var name (Task 5 Step 1 verifies against `api/chat.ts` before use); SimpleFIN transaction sign convention (money-out negative — validated at Task 3 Step 4).

## Opus 4.8 Verification (2026-07-12)

Reviewed against the live codebase. Defects found and **fixed inline**:
- **Categorizer used a stale model id and no fallback.** `api/chat.ts` actually uses `claude-haiku-4-5-20251001` (≤512 tokens) with a Gemini fallback. Fixed: `_categorize.ts` now delegates to `/api/chat` (self-call), inheriting the fallback; `categorize()` gained a `baseUrl` param, threaded through both callers (Tasks 3 + 8).
- **SimpleFIN access-URL path handling** hardened with an explicit path/epoch-seconds verify (Task 2 Step 3).

Confirmed-good: `dbGet`/`dbSet` reuse, `WEBHOOK_TOKEN` guard pattern, `extId` dedupe consistency, FinanceHub `Expense` shape compatibility.
