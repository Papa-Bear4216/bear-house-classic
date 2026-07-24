export const config = { runtime: 'edge' };

import { getStripeClient } from './_stripe.js';
import { requireBillingRole } from './_billingAuth.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, BillingActionBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(BillingActionBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { householdId } = parsed.data;

  const auth = await requireBillingRole(req, householdId);
  if (auth.ok === false) return j({ error: auth.error }, auth.status);

  const rl = await checkRateLimit(householdId, 'billing-checkout', 10);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const basePriceId = process.env.STRIPE_BASE_PRICE_ID;
  if (!basePriceId) return serverError('Billing is not configured (missing STRIPE_BASE_PRICE_ID)', 'billing-checkout');

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
    return serverError(err.message || 'Failed to start checkout', 'billing-checkout', err);
  }
}
