import Stripe from 'stripe';

let client: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
    client = new Stripe(key, {
      apiVersion: '2026-07-29.preview' as Stripe.LatestApiVersion,
      httpClient: Stripe.createFetchHttpClient(),
    });
  }
  return client;
}
