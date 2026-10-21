// Verifiable parental consent (COPPA "monetary transaction" method).
// A parent authorizes a small card hold via Stripe Checkout; we verify it, cancel the hold
// (the parent is never charged), and keep the record on the Stripe PaymentIntent.
import { getStripeClient } from './_stripe.js';

export const COPPA_NOTICE_VERSION = '2026-10-v1';
export const VPC_AMOUNT_CENTS = 50; // Stripe's minimum card amount
const MAX_AGE_SECONDS = 24 * 60 * 60;
const norm = (s: string) => s.trim().toLowerCase();

export async function startConsent(args: {
  authUserId: string; householdId: string; childName: string; origin: string;
}): Promise<string> {
  const session = await getStripeClient().checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: VPC_AMOUNT_CENTS,
        product_data: { name: 'Parental consent verification (temporary hold, never charged)' },
      },
    }],
    payment_intent_data: {
      capture_method: 'manual',
      description: 'HotMessExpress COPPA parental consent verification',
      metadata: { purpose: 'coppa_vpc' },
    },
    metadata: {
      purpose: 'coppa_vpc',
      authUserId: args.authUserId,
      householdId: args.householdId,
      childName: args.childName,
      noticeVersion: COPPA_NOTICE_VERSION,
    },
    success_url: `${args.origin}/?coppa_session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${args.origin}/?coppa_cancelled=1`,
  });
  if (!session.url) throw new Error('Stripe returned no checkout URL');
  return session.url;
}

export type ConsumeResult = { ok: true } | { ok: false; error: string };

/** Verifies and burns a consent session. Single-use: the hold is canceled on success. */
export async function consumeConsent(args: {
  sessionId: string; authUserId: string; householdId: string; childName: string;
}): Promise<ConsumeResult> {
  const stripe = getStripeClient();
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(args.sessionId, { expand: ['payment_intent'] });
  } catch {
    return { ok: false, error: 'Parental consent verification not found.' };
  }
  const md = session.metadata ?? {};
  if (
    md.purpose !== 'coppa_vpc' ||
    md.authUserId !== args.authUserId ||
    md.householdId !== args.householdId ||
    norm(md.childName ?? '') !== norm(args.childName)
  ) {
    return { ok: false, error: 'Parental consent verification does not match this invite.' };
  }
  if (session.status !== 'complete') return { ok: false, error: 'Card verification was not completed.' };
  if (Date.now() / 1000 - session.created > MAX_AGE_SECONDS) {
    return { ok: false, error: 'Parental consent verification expired. Please verify again.' };
  }
  const pi = session.payment_intent;
  if (!pi || typeof pi === 'string' || pi.status !== 'requires_capture') {
    return { ok: false, error: 'Parental consent verification was already used or is not valid.' };
  }
  try {
    await stripe.paymentIntents.cancel(pi.id); // burns the token; also releases the hold
  } catch {
    return { ok: false, error: 'Parental consent verification was already used.' };
  }
  try {
    await stripe.paymentIntents.update(pi.id, {
      metadata: { purpose: 'coppa_vpc', childName: args.childName, householdId: args.householdId,
        guardianAuthUserId: args.authUserId, consentedAt: new Date().toISOString(), noticeVersion: COPPA_NOTICE_VERSION },
    });
  } catch { /* audit metadata is best-effort; consent already verified and burned */ }
  return { ok: true };
}
