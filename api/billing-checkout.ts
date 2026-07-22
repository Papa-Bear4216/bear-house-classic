export const config = { runtime: 'edge' };

import { getStripeClient } from './_stripe.js';
import { requireBillingRole } from './_billingAuth.js';
import { parseBody, BillingActionBodySchema } from './_schemas.js';

const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(BillingActionBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { householdId } = parsed.data;

  const auth = await requireBillingRole(req, householdId);
  if (auth.ok === false) return j({ error: auth.error }, auth.status);

  const basePriceId = process.env.STRIPE_BASE_PRICE_ID;
  if (!basePriceId) return j({ error: 'Billing is not configured (missing STRIPE_BASE_PRICE_ID)' }, 500);

  const baseUrl = new URL(req.url).origin;

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        { price: basePriceId, quantity: 1 },
      ],
      success_url: `${baseUrl}/setup?billing=success`,
      cancel_url: `${baseUrl}/setup?billing=cancelled`,
      metadata: { householdId },
      subscription_data: { metadata: { householdId } },
    });

    return j({ url: session.url });
  } catch (err: any) {
    return j({ error: err.message || 'Failed to start checkout' }, 500);
  }
}
