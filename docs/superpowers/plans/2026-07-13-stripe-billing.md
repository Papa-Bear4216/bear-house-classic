# Stripe Billing (Per-Seat Subscriptions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new household must have an active Stripe subscription before it can add members or use the dashboard. Base plan covers up to 3 authenticating members (`superadmin`/`admin`/`child`); each additional authenticating member is a per-seat add-on. Pets never count toward seats or billing.

**Architecture:** Stripe Checkout for initial subscription creation, a Stripe webhook endpoint to keep `households.subscription_status` in sync, and a seat-count reconciliation step that updates the Stripe subscription's quantity whenever an authenticating `household_members` row is added or removed. Billing UI surfaces inside the existing Settings modal, gated to `superadmin`/`admin` only.

**Tech Stack:** Stripe (`stripe` npm package for server-side, no client-side Stripe.js needed since Checkout is a redirect flow), Vercel serverless functions (`api/*.ts`), Supabase (existing).

## Global Constraints

- **Depends on** `docs/superpowers/plans/2026-07-13-multi-tenant-foundation.md` Task 1 (the `households` table with `stripe_customer_id`/`stripe_subscription_id`/`subscription_status` columns) and Task 4 (Supabase Auth, so billing actions can be attributed to an authenticated household member). Do not start this plan before that plan's Task 1 and Task 4 have shipped.
- The existing backfilled family (household #1, per the foundation plan's Task 2) already has `subscription_status = 'active'` set directly in SQL — it is grandfathered in and must never be redirected into a checkout flow by this plan's guard logic. Every guard check in this plan must treat `subscription_status = 'active'` as sufficient regardless of how it got set.
- No free tier: any household with `subscription_status` not in `('active')` is blocked from the dashboard, full stop — there is no trial period or grace-access mode in this plan.
- Pricing values in this plan are placeholders (`$9.99` base, `$2.99`/seat) — the actual Stripe Price IDs must be created in the Stripe Dashboard (or via Stripe CLI) before Task 1 can be completed; this plan does not invent real price amounts, it wires the integration around whatever two Price IDs exist.
- Only `superadmin` and `admin` roles may access billing UI or call billing-mutating endpoints — every billing endpoint must check the caller's role server-side, not just hide the UI client-side.
- This app has no test runner configured. Verification is via `npm run build` plus the Stripe CLI's `stripe trigger`/test-mode webhook forwarding described in each task — do not skip webhook verification.

---

### Task 1: Stripe product/price setup + environment wiring

**Files:**
- Modify: `.env.local` (add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_BASE_PRICE_ID`, `STRIPE_SEAT_PRICE_ID`)
- Modify: `package.json` (add `stripe` dependency)

**Interfaces:**
- Produces: four env vars available to `api/*.ts` functions: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_BASE_PRICE_ID`, `STRIPE_SEAT_PRICE_ID`.

- [ ] **Step 1: Install the Stripe SDK**

```bash
npm install stripe
```

- [ ] **Step 2: Create the two Stripe Products/Prices (test mode)**

In the Stripe Dashboard (test mode) or via CLI:
```bash
stripe products create --name="FamilyOS Base Plan"
stripe prices create --product=<product_id_from_above> --unit-amount=999 --currency=usd --recurring[interval]=month
stripe products create --name="FamilyOS Additional Seat"
stripe prices create --product=<second_product_id> --unit-amount=299 --currency=usd --recurring[interval]=month
```
Note the two resulting Price IDs (`price_...`) — these are placeholders for the actual dollar amounts (`$9.99`/`$2.99`); adjust `--unit-amount` if the user specifies different final pricing before this task ships to production.

- [ ] **Step 3: Get the Stripe secret key and add all four env vars**

From the Stripe Dashboard (Developers → API keys, test mode), copy the secret key. Add to `.env.local`:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_BASE_PRICE_ID=price_...
STRIPE_SEAT_PRICE_ID=price_...
```
(`STRIPE_WEBHOOK_SECRET` is obtained in Task 3 once the webhook endpoint is registered — leave it blank or with a placeholder value here and fill it in during Task 3.)

- [ ] **Step 4: Add the same vars to Vercel**

```bash
printf '%s' "sk_test_..." | vercel env add STRIPE_SECRET_KEY production
printf '%s' "sk_test_..." | vercel env add STRIPE_SECRET_KEY preview
printf '%s' "price_..." | vercel env add STRIPE_BASE_PRICE_ID production
printf '%s' "price_..." | vercel env add STRIPE_BASE_PRICE_ID preview
printf '%s' "price_..." | vercel env add STRIPE_SEAT_PRICE_ID production
printf '%s' "price_..." | vercel env add STRIPE_SEAT_PRICE_ID preview
```
(`STRIPE_WEBHOOK_SECRET` added in Task 3 after the production webhook endpoint is registered with Stripe, since the secret differs per registered endpoint.)

- [ ] **Step 5: Verify the build still passes**

Run: `npm run build` — expect success (this task only adds config/deps, no code changes yet).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .env.local
git commit -m "chore(billing): add Stripe SDK and price/key env vars

Two Stripe Prices created in test mode: base plan (3 seats included)
and per-seat add-on. STRIPE_WEBHOOK_SECRET filled in during Task 3."
```

---

### Task 2: Checkout endpoint — create subscription for a new household

**Files:**
- Create: `api/_stripe.ts`
- Create: `api/billing-checkout.ts`

**Interfaces:**
- Produces: `getStripeClient(): Stripe` in `api/_stripe.ts`.
- Produces: `POST /api/billing-checkout` accepting `{ householdId: string }`, returning `{ url: string }` (the Stripe Checkout session URL to redirect the browser to).

- [ ] **Step 1: Write `api/_stripe.ts`**

```typescript
import Stripe from 'stripe';

let client: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
    client = new Stripe(key, { apiVersion: '2024-06-20' });
  }
  return client;
}
```

- [ ] **Step 2: Write `api/billing-checkout.ts`**

```typescript
export const config = { runtime: 'edge' };

import { getStripeClient } from './_stripe.js';
import { dbGet } from './_db.js';

const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const body = (await req.json().catch(() => ({}))) as { householdId?: string };
  const { householdId } = body;
  if (!householdId) return j({ error: 'Missing householdId' }, 400);

  const baseUrl = new URL(req.url).origin;
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [
      { price: process.env.STRIPE_BASE_PRICE_ID!, quantity: 1 },
    ],
    success_url: `${baseUrl}/setup?billing=success`,
    cancel_url: `${baseUrl}/setup?billing=cancelled`,
    metadata: { householdId },
    subscription_data: { metadata: { householdId } },
  });

  return j({ url: session.url });
}
```

Note: this endpoint does not verify the caller's Supabase Auth session server-side yet — that hardening is deferred to Task 5 alongside the seat-update endpoint, since both need the same auth-check helper and it's cleaner to write that helper once.

- [ ] **Step 3: Manual verification via curl**

Run (substitute a real backfilled or test household id):
```bash
curl -X POST http://localhost:5173/api/billing-checkout -H "Content-Type: application/json" -d '{"householdId":"<test-household-uuid>"}'
```
(Requires `vercel dev` or the Vite dev server with API routes proxied — use whichever this repo's existing local dev workflow already supports for `api/*.ts` functions; check `vite.config.ts` for an existing proxy setup before assuming.)

Expected: `{"url":"https://checkout.stripe.com/..."}`. Open that URL in a browser, complete checkout with Stripe's test card `4242 4242 4242 4242`, any future expiry, any CVC.

- [ ] **Step 4: Commit**

```bash
git add api/_stripe.ts api/billing-checkout.ts
git commit -m "feat(billing): add Stripe Checkout session creation endpoint

Manually verified: creates a real test-mode checkout session, completes
with Stripe's test card."
```

---

### Task 3: Webhook endpoint — sync subscription status back to `households`

**Files:**
- Create: `api/stripe-webhook.ts`

**Interfaces:**
- Produces: `POST /api/stripe-webhook` — Stripe-signed webhook receiver, updates `households.subscription_status`/`stripe_customer_id`/`stripe_subscription_id` based on `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted` events.

- [ ] **Step 1: Write `api/stripe-webhook.ts`**

Note: this must run on the Node runtime (not edge) because Stripe's webhook signature verification needs the raw request body, and must use the `service_role` Supabase key directly (bypassing `_db.ts`'s household-scoped helpers, since this endpoint writes to `households` by Stripe customer/subscription id, not by an already-known `household_id` from a session).

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStripeClient } from './_stripe.js';

export const config = { api: { bodyParser: false } };

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

async function updateHousehold(householdId: string, fields: Record<string, string>) {
  const url = (process.env.SUPABASE_URL || 'https://zjialvdolbkccduuwsck.supabase.co') + `/rest/v1/households?id=eq.${householdId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY!,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Failed to update household ${householdId}: ${res.status} ${detail}`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = getStripeClient();
  const sig = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig as string, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const householdId = session.metadata?.householdId;
      if (householdId) {
        await updateHousehold(householdId, {
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          subscription_status: 'active',
        });
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as any;
      const householdId = subscription.metadata?.householdId;
      if (householdId) {
        const status = event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status;
        await updateHousehold(householdId, { subscription_status: status });
      }
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
```

- [ ] **Step 2: Register the webhook endpoint with Stripe and get the signing secret**

After this code is deployed (or using `stripe listen` for local testing):
```bash
stripe listen --forward-to localhost:5173/api/stripe-webhook
```
Copy the `whsec_...` secret printed by this command into `.env.local`'s `STRIPE_WEBHOOK_SECRET` for local testing. For production, register the endpoint in the Stripe Dashboard (Developers → Webhooks → Add endpoint, URL `https://www.hotmessexpress.lol/api/stripe-webhook`, events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`), then add that endpoint's signing secret to Vercel:
```bash
printf '%s' "whsec_..." | vercel env add STRIPE_WEBHOOK_SECRET production
```

- [ ] **Step 3: Manual verification with Stripe CLI test events**

With `stripe listen` running and the dev server up, run:
```bash
stripe trigger checkout.session.completed
```
Expected: webhook handler logs/returns `{"received":true}`, no 400/500. (This test event won't have real `metadata.householdId`, so the household update branch will simply no-op — that's fine for this smoke test; full verification happens in Task 2's Step 3 real checkout flow, which does carry real metadata.)

Then complete a real test checkout (from Task 2 Step 3) and confirm in Supabase:
```sql
select subscription_status, stripe_customer_id, stripe_subscription_id from households where id = '<test-household-uuid>';
```
Expected: `subscription_status = 'active'`, both Stripe ids populated.

- [ ] **Step 4: Commit**

```bash
git add api/stripe-webhook.ts
git commit -m "feat(billing): add Stripe webhook to sync subscription_status

Verified end-to-end: real test-mode checkout completion updates
households.subscription_status to 'active' via webhook."
```

---

### Task 4: Seat count sync — update Stripe quantity when members are added/removed

**Files:**
- Create: `api/billing-seats.ts`

**Interfaces:**
- Produces: `POST /api/billing-seats` accepting `{ householdId: string }`, recalculates the household's authenticating-member count and updates the Stripe subscription's seat-based line item quantity accordingly. Returns `{ seats: number, extraSeats: number }`.

- [ ] **Step 1: Write `api/billing-seats.ts`**

```typescript
export const config = { runtime: 'edge' };

import { getStripeClient } from './_stripe.js';

const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zjialvdolbkccduuwsck.supabase.co';

async function countAuthenticatingMembers(householdId: string): Promise<number> {
  const anonKey = process.env.SUPABASE_ANON_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?household_id=eq.${householdId}&role=in.(superadmin,admin,child)&select=id`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }
  );
  const rows = await res.json() as any[];
  return rows.length;
}

async function getHousehold(householdId: string): Promise<{ stripe_subscription_id: string | null }> {
  const anonKey = process.env.SUPABASE_ANON_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/households?id=eq.${householdId}&select=stripe_subscription_id`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }
  );
  const rows = await res.json() as any[];
  return rows[0] ?? { stripe_subscription_id: null };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const body = (await req.json().catch(() => ({}))) as { householdId?: string };
  const { householdId } = body;
  if (!householdId) return j({ error: 'Missing householdId' }, 400);

  const seats = await countAuthenticatingMembers(householdId);
  const extraSeats = Math.max(0, seats - 3);

  const { stripe_subscription_id } = await getHousehold(householdId);
  if (!stripe_subscription_id) return j({ error: 'Household has no active subscription' }, 400);

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(stripe_subscription_id);
  const seatItem = subscription.items.data.find((i) => i.price.id === process.env.STRIPE_SEAT_PRICE_ID);

  if (extraSeats === 0) {
    if (seatItem) {
      await stripe.subscriptionItems.del(seatItem.id);
    }
  } else if (seatItem) {
    await stripe.subscriptionItems.update(seatItem.id, { quantity: extraSeats });
  } else {
    await stripe.subscriptionItems.create({
      subscription: stripe_subscription_id,
      price: process.env.STRIPE_SEAT_PRICE_ID!,
      quantity: extraSeats,
    });
  }

  return j({ seats, extraSeats });
}
```

- [ ] **Step 2: Manual verification**

Using the test household from Task 2/3 (already has an active subscription), add 4 test rows to `household_members` with `role = 'child'` via SQL (total including the checkout-owner row should exceed 3), then:
```bash
curl -X POST http://localhost:5173/api/billing-seats -H "Content-Type: application/json" -d '{"householdId":"<test-household-uuid>"}'
```
Expected: `{"seats":4,"extraSeats":1}` (adjust numbers to match how many test rows were actually added). Confirm in the Stripe Dashboard test mode that the subscription now shows a seat-price line item with quantity `1`.

Remove one test member row, re-run the curl command, expected: `extraSeats` decreases and the Stripe line item quantity updates (or is removed entirely if `extraSeats` returns to `0`).

- [ ] **Step 3: Commit**

```bash
git add api/billing-seats.ts
git commit -m "feat(billing): sync household seat count to Stripe subscription quantity

Verified: adding/removing authenticating members updates the Stripe
seat line item quantity correctly, including removal when extraSeats
returns to 0."
```

---

### Task 5: Auth guard on billing endpoints (superadmin/admin only)

**Files:**
- Create: `api/_billingAuth.ts`
- Modify: `api/billing-checkout.ts`
- Modify: `api/billing-seats.ts`

**Interfaces:**
- Produces: `requireBillingRole(req: Request, householdId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }>` in `api/_billingAuth.ts` — verifies the request carries a valid Supabase session (via the `Authorization: Bearer <access_token>` header the client must send) belonging to a `household_members` row in the given household with role `superadmin` or `admin`.

- [ ] **Step 1: Write `api/_billingAuth.ts`**

```typescript
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zjialvdolbkccduuwsck.supabase.co';

export async function requireBillingRole(
  req: Request,
  householdId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing bearer token' };
  }
  const accessToken = authHeader.slice('Bearer '.length);
  const anonKey = process.env.SUPABASE_ANON_KEY!;

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) return { ok: false, status: 401, error: 'Invalid session' };
  const user = await userRes.json();

  const memberRes = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?auth_user_id=eq.${user.id}&household_id=eq.${householdId}&select=role`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }
  );
  const rows = await memberRes.json() as any[];
  const role = rows[0]?.role;

  if (role !== 'superadmin' && role !== 'admin') {
    return { ok: false, status: 403, error: 'Only superadmin/admin can manage billing' };
  }
  return { ok: true };
}
```

- [ ] **Step 2: Wire the guard into `api/billing-checkout.ts`**

Add near the top of the handler, after parsing `householdId`:
```typescript
import { requireBillingRole } from './_billingAuth.js';
// ... inside handler, after: if (!householdId) return j({ error: 'Missing householdId' }, 400);
const auth = await requireBillingRole(req, householdId);
if (!auth.ok) return j({ error: auth.error }, auth.status);
```

- [ ] **Step 3: Wire the same guard into `api/billing-seats.ts`**

Same pattern — add the import and the check after `householdId` is validated, before `countAuthenticatingMembers` is called.

Note: for the *first-ever* checkout during initial household setup, the caller is the freshly-created `superadmin` — their `household_members` row must already exist (created in the same setup step, before this checkout call) for `requireBillingRole` to find it. Confirm the setup-flow implementation (separate, not part of this plan) creates the `household_members` row before calling `/api/billing-checkout`.

- [ ] **Step 4: Update the client-side caller to send the bearer token**

Wherever `/api/billing-checkout` and `/api/billing-seats` are called from the frontend (Task 6 below writes this UI), the fetch call must include:
```typescript
const { data: { session } } = await supabase.auth.getSession();
fetch('/api/billing-checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
  body: JSON.stringify({ householdId }),
});
```

- [ ] **Step 5: Manual verification**

Repeat Task 2 Step 3 and Task 4 Step 2's curl commands but this time **without** an `Authorization` header — expected: `401 Missing bearer token` for both endpoints. Then repeat with a valid `child`-role member's access token — expected: `403 Only superadmin/admin can manage billing`. Then repeat with a valid `admin`/`superadmin` token — expected: original success responses from Tasks 2/4.

- [ ] **Step 6: Commit**

```bash
git add api/_billingAuth.ts api/billing-checkout.ts api/billing-seats.ts
git commit -m "feat(billing): restrict billing endpoints to superadmin/admin roles

Verified: missing token -> 401, child-role token -> 403,
admin/superadmin token -> success."
```

---

### Task 6: Billing UI in Settings + dashboard lockout on non-active subscription

**Files:**
- Create: `src/components/familyos/BillingPanel.tsx`
- Modify: `src/components/familyos/SettingsModal.tsx`
- Modify: `src/App.tsx`
- Create: `src/pages/BillingLocked.tsx`

**Interfaces:**
- Consumes: `useAppContext()`'s `currentRole`, `householdId` (from the foundation plan's Task 4 `AppContext` changes).
- Produces: `<BillingPanel />` component rendering current seat count/cost and a "Manage Billing" flow, rendered only when `currentRole` is `superadmin` or `admin`.

- [ ] **Step 1: Write `src/components/familyos/BillingPanel.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { CreditCard } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/sync';

export function BillingPanel() {
  const { currentRole, householdId } = useAppContext();
  const [seats, setSeats] = useState<number | null>(null);
  const [extraSeats, setExtraSeats] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  if (currentRole !== 'superadmin' && currentRole !== 'admin') return null;

  const refreshSeats = async () => {
    if (!householdId) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/billing-seats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ householdId }),
    });
    if (res.ok) {
      const data = await res.json();
      setSeats(data.seats);
      setExtraSeats(data.extraSeats);
    }
  };

  useEffect(() => { refreshSeats(); }, [householdId]);

  const openBillingPortal = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/billing-portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ householdId }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.url) window.location.href = data.url;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-white">
        <CreditCard className="w-4 h-4" /> Billing
      </div>
      <div className="text-xs text-slate-400">
        {seats === null ? 'Loading…' : `${seats} member${seats === 1 ? '' : 's'} (${extraSeats} extra seat${extraSeats === 1 ? '' : 's'} beyond the included 3)`}
      </div>
      <button
        onClick={openBillingPortal}
        disabled={loading}
        className="text-xs bg-slate-800 hover:bg-slate-700 text-white rounded px-3 py-1.5 disabled:opacity-50"
      >
        {loading ? 'Opening…' : 'Manage Billing'}
      </button>
    </div>
  );
}
```

Note: this component calls `/api/billing-portal`, which does not exist yet in this plan's earlier tasks — add it now as part of this task's scope (it's a small addition to `api/_stripe.ts`'s pattern, needed for the "Manage Billing" button to let superadmin/admin update payment method / view invoices via Stripe's hosted portal).

- [ ] **Step 2: Add the billing portal endpoint**

Create `api/billing-portal.ts`:
```typescript
export const config = { runtime: 'edge' };

import { getStripeClient } from './_stripe.js';
import { requireBillingRole } from './_billingAuth.js';

const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zjialvdolbkccduuwsck.supabase.co';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const body = (await req.json().catch(() => ({}))) as { householdId?: string };
  const { householdId } = body;
  if (!householdId) return j({ error: 'Missing householdId' }, 400);

  const auth = await requireBillingRole(req, householdId);
  if (!auth.ok) return j({ error: auth.error }, auth.status);

  const anonKey = process.env.SUPABASE_ANON_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/households?id=eq.${householdId}&select=stripe_customer_id`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }
  );
  const rows = await res.json() as any[];
  const customerId = rows[0]?.stripe_customer_id;
  if (!customerId) return j({ error: 'No Stripe customer on file' }, 400);

  const baseUrl = new URL(req.url).origin;
  const stripe = getStripeClient();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl}/`,
  });

  return j({ url: portalSession.url });
}
```

- [ ] **Step 3: Mount `BillingPanel` inside `SettingsModal.tsx`**

Read the existing `SettingsModal.tsx` structure first (it renders collapsible sections keyed by feature — SimpleFIN, Camera Access, Weather, etc., per the earlier research). Add `<BillingPanel />` as one more section, following the same collapsible-section pattern already used for e.g. the SimpleFIN panel (`SettingsModal.tsx:301-314` per prior research) — import it at the top (`import { BillingPanel } from './BillingPanel';`) and render it in the same list of sections, gated implicitly since `BillingPanel` itself returns `null` for non-admin roles.

- [ ] **Step 4: Write `src/pages/BillingLocked.tsx`**

```tsx
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/sync';

export default function BillingLockedPage() {
  const { currentRole, householdId } = useAppContext();
  const isPayer = currentRole === 'superadmin' || currentRole === 'admin';

  const resumeBilling = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/billing-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ householdId }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="text-2xl font-bold text-white">Subscription needed</div>
      {isPayer ? (
        <>
          <p className="text-slate-400 text-sm max-w-sm">
            Your household's subscription is inactive. Update billing to keep using FamilyOS.
          </p>
          <Button onClick={resumeBilling}>Update Billing</Button>
        </>
      ) : (
        <p className="text-slate-400 text-sm max-w-sm">
          Ask a household admin to update the family's billing to keep using FamilyOS.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Gate `src/App.tsx` on `subscription_status`**

This requires `AppContext` to also expose `subscriptionStatus` — read `households.subscription_status` alongside the `household_members` lookup in `getHouseholdSession()` (foundation plan's `src/lib/householdAuth.ts`). Extend that function's return type to include `subscriptionStatus: string`, and extend `AppContext` to expose it, following the exact same pattern already used for `currentUser`/`householdId` there.

In `src/App.tsx`, after the existing `authed`/`syncReady` checks, add:
```tsx
if (subscriptionStatus !== 'active') {
  return (
    <ThemeProvider defaultTheme="dark">
      <BillingLockedPage />
    </ThemeProvider>
  );
}
```
(Read `subscriptionStatus` from `useAppContext()` inside a component under `AppProvider` — restructure `App.tsx` so this check happens in a child component wrapped by `AppProvider`, not in `App` itself, since `App` currently renders `AppProvider` only after this check would need to run. Introduce a small wrapper component, e.g. `AuthedApp`, that is rendered inside `<AppProvider>` and performs this check before rendering `<Index />`.)

- [ ] **Step 6: Manual verification**

1. Using the test household from earlier tasks with an active subscription, sign in — confirm the dashboard loads normally (not the locked screen).
2. In Stripe test mode, cancel that test subscription (`stripe.subscriptions.cancel(...)` via CLI or dashboard) — confirm the webhook (Task 3) fires and `households.subscription_status` becomes `canceled`.
3. Refresh the app — confirm the locked screen now appears instead of the dashboard.
4. Confirm the "Update Billing" button (visible only for superadmin/admin) successfully starts a new checkout session.

- [ ] **Step 7: Commit**

```bash
git add src/components/familyos/BillingPanel.tsx src/pages/BillingLocked.tsx src/components/familyos/SettingsModal.tsx src/App.tsx src/lib/householdAuth.ts api/billing-portal.ts
git commit -m "feat(billing): add billing UI and lock dashboard on inactive subscription

Verified: canceling a test subscription (via webhook) locks the
dashboard behind BillingLockedPage; admin/superadmin can resume
via a new checkout; Settings now surfaces seat count + billing portal
link for admin/superadmin only."
```

---

## Self-Review Notes

- **Spec coverage:** Stripe provider (Task 1), checkout (Task 2), webhook sync (Task 3), seat-count reconciliation (Task 4), superadmin+admin-only access enforced server-side (Task 5), UI + dashboard lockout on payment failure (Task 6). Pets excluded from seat counting throughout (Task 4's `role=in.(superadmin,admin,child)` filter never includes `pet`).
- **No free tier enforced:** Task 6's dashboard gate blocks on anything other than `subscription_status = 'active'` — there is no bypass path in this plan.
- **Dependency on foundation plan made explicit** in Global Constraints — this plan cannot be executed before that plan's Task 1 (schema) and Task 4 (auth) ship.
- **Type/name consistency:** `householdId` parameter name and `household_members.role in ('superadmin','admin','child','pet')` values are used identically to the foundation plan throughout every task here.
