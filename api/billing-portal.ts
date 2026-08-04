export const config = { runtime: 'edge' };

import { getStripeClient } from './_stripe.js';
import { requireBillingRole } from './_billingAuth.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, BillingActionBodySchema } from './_schemas.js';
import { json as j } from './_responseHelpers.js';

import { handleCorsPreflight } from './_cors.js';
const SUPABASE_URL = 'https://zjialvdolbkccduuwsck.supabase.co';

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(BillingActionBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { householdId } = parsed.data;

  const auth = await requireBillingRole(req, householdId);
  if (auth.ok === false) return j({ error: auth.error }, auth.status);

  const rl = await checkRateLimit(householdId, 'billing-portal', 15);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/households?id=eq.${encodeURIComponent(householdId)}&select=stripe_customer_id`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
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
