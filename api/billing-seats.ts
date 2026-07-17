export const config = { runtime: 'edge' };

import { getStripeClient } from './_stripe.js';
import { requireBillingRole } from './_billingAuth.js';

const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

const SUPABASE_URL = 'https://zjialvdolbkccduuwsck.supabase.co';

async function countAuthenticatingMembers(householdId: string): Promise<number> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?household_id=eq.${encodeURIComponent(householdId)}&role=in.(superadmin,admin,child)&select=id`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const rows = await res.json() as any[];
  return rows.length;
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

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const body = (await req.json().catch(() => ({}))) as { householdId?: string };
  const { householdId } = body;
  if (!householdId) return j({ error: 'Missing householdId' }, 400);

  const auth = await requireBillingRole(req, householdId);
  if (auth.ok === false) return j({ error: auth.error }, auth.status);

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
