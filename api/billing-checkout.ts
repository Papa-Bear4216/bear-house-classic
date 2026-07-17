export const config = { runtime: 'edge' };

import { getStripeClient } from './_stripe.js';
import { requireBillingRole } from './_billingAuth.js';

const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const body = (await req.json().catch(() => ({}))) as { householdId?: string };
  const { householdId } = body;
  if (!householdId) return j({ error: 'Missing householdId' }, 400);

  const auth = await requireBillingRole(req, householdId);
  if (auth.ok === false) return j({ error: auth.error }, auth.status);

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
