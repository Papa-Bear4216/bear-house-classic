// api/stripe-webhook.ts — Stripe-signed webhook receiver. Syncs
// households.subscription_status/stripe_customer_id/stripe_subscription_id.
// Edge runtime (consistent with every other api/*.ts route in this repo);
// uses constructEventAsync since Stripe's sync constructEvent needs Node's
// Buffer APIs, not available on edge.
export const config = { runtime: 'edge' };

import { getStripeClient } from './_stripe.js';

const SUPABASE_URL = 'https://zjialvdolbkccduuwsck.supabase.co';

const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

async function updateHousehold(householdId: string, fields: Record<string, string | null>) {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/households?id=eq.${encodeURIComponent(householdId)}`, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Failed to update household ${householdId}: ${res.status} ${detail}`);
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const stripe = getStripeClient();
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  if (!signature || !webhookSecret) return j({ error: 'Missing signature' }, 400);

  const rawBody = await req.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err: any) {
    return j({ error: `Webhook signature verification failed: ${err.message}` }, 400);
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

    return j({ received: true });
  } catch (err: any) {
    return j({ error: err.message }, 500);
  }
}
