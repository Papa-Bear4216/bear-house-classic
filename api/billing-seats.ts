export const config = { runtime: 'edge' };

import { getStripeClient } from './_stripe.js';
import { requireBillingRole } from './_billingAuth.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, BillingActionBodySchema } from './_schemas.js';
import { json as j } from './_responseHelpers.js';
import { resolveFamilyId } from './_familyAuth.js';

import { handleCorsPreflight } from './_cors.js';
const SUPABASE_URL = 'https://zjialvdolbkccduuwsck.supabase.co';

// Counts distinct billable members across every household in the family, not
// just the ones the calling user happens to belong to — resolveFamilyId's
// household list is scoped to the caller's own memberships (see _familyAuth.ts),
// which undercounts a family where the caller only has a row in one home.
// Dedupes by auth_user_id/email so a parent or child with a row in both homes
// (e.g. via a merge-in-progress) isn't billed as two seats.
async function countAuthenticatingMembers(familyId: string): Promise<number> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  const linkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/household_family_link?family_id=eq.${encodeURIComponent(familyId)}&select=household_id`,
    { headers }
  );
  const linkRows = linkRes.ok ? (await linkRes.json() as any[]) : [];
  const householdIds = linkRows.map((r) => r.household_id);
  if (householdIds.length === 0) return 0;

  const inClause = householdIds.map(encodeURIComponent).join(',');
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?household_id=in.(${inClause})&role=in.(superadmin,admin,child)&select=id,auth_user_id,email`,
    { headers }
  );
  const rows = res.ok ? (await res.json() as any[]) : [];

  const seen = new Set<string>();
  for (const row of rows) {
    seen.add(row.auth_user_id ?? row.email ?? row.id);
  }
  return seen.size;
}

async function getHousehold(householdId: string): Promise<{ stripe_subscription_id: string | null }> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/households?id=eq.${encodeURIComponent(householdId)}&select=stripe_subscription_id`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const rows = await res.json() as any[];
  return rows[0] ?? { stripe_subscription_id: null };
}

async function getFamily(familyId: string): Promise<{ stripe_subscription_id: string | null; stripe_customer_id: string | null } | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/families?id=eq.${encodeURIComponent(familyId)}&select=stripe_subscription_id,stripe_customer_id`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json() as any[];
  return rows[0] ?? null;
}

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(BillingActionBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { householdId } = parsed.data;

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return j({ error: 'Missing bearer token' }, 401);
  const accessToken = authHeader.slice('Bearer '.length);

  const auth = await requireBillingRole(req, householdId);
  if (auth.ok === false) return j({ error: auth.error }, auth.status);

  const rl = await checkRateLimit(householdId, 'billing-seats', 15);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  // Family-aware: in co-parent mode the family owns the subscription.
  const family = await resolveFamilyId(accessToken, householdId);
  if (!family) return j({ error: 'Unable to resolve family' }, 401);

  // Seat count across every household in the family, deduped by member —
  // family.households only lists the CALLER's own memberships (see
  // _familyAuth.ts), which would undercount a family where the caller
  // doesn't have a row in every linked household. Query the link table
  // directly by family id instead.
  const seats = await countAuthenticatingMembers(family.familyId);
  const extraSeats = Math.max(0, seats - 3);

  const billingRow = family.mode === 'coparent'
    ? (await getFamily(family.familyId)) ?? { stripe_subscription_id: null }
    : await getHousehold(householdId);

  if (!billingRow?.stripe_subscription_id) {
    const scope = family.mode === 'coparent' ? 'family' : 'household';
    return j({ error: `${scope} has no active subscription` }, 400);
  }

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(billingRow.stripe_subscription_id);
  const seatItem = subscription.items.data.find((i) => i.price.id === process.env.STRIPE_SEAT_PRICE_ID);

  if (extraSeats === 0) {
    if (seatItem) {
      await stripe.subscriptionItems.del(seatItem.id);
    }
  } else if (seatItem) {
    await stripe.subscriptionItems.update(seatItem.id, { quantity: extraSeats });
  } else {
    await stripe.subscriptionItems.create({
      subscription: billingRow.stripe_subscription_id,
      price: process.env.STRIPE_SEAT_PRICE_ID!,
      quantity: extraSeats,
    });
  }

  return j({ seats, extraSeats });
}
