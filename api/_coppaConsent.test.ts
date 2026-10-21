import { describe, it, expect, vi, beforeEach } from 'vitest';

const stripe = {
  checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
  paymentIntents: { cancel: vi.fn(), update: vi.fn() },
};
vi.mock('./_stripe.js', () => ({ getStripeClient: () => stripe }));

import { startConsent, consumeConsent } from './_coppaConsent.js';

const good = () => ({
  status: 'complete',
  created: Math.floor(Date.now() / 1000) - 60,
  metadata: { purpose: 'coppa_vpc', authUserId: 'u1', householdId: 'h1', childName: 'Leo' },
  payment_intent: { id: 'pi_1', status: 'requires_capture' },
});
const args = { sessionId: 'cs_1', authUserId: 'u1', householdId: 'h1', childName: ' leo ' };

beforeEach(() => {
  vi.clearAllMocks();
  stripe.paymentIntents.cancel.mockResolvedValue({});
  stripe.paymentIntents.update.mockResolvedValue({});
});

describe('startConsent', () => {
  it('creates a manual-capture $0.50 card hold bound to guardian, household and child', async () => {
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://stripe.test/x' });
    const url = await startConsent({ authUserId: 'u1', householdId: 'h1', childName: 'Leo', origin: 'https://a.test' });
    expect(url).toBe('https://stripe.test/x');
    const arg = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(arg.payment_intent_data.capture_method).toBe('manual');
    expect(arg.line_items[0].price_data.unit_amount).toBe(50);
    expect(arg.metadata).toMatchObject({ authUserId: 'u1', householdId: 'h1', childName: 'Leo' });
  });
});

describe('consumeConsent', () => {
  it('accepts a valid session once and cancels the hold', async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue(good());
    expect(await consumeConsent(args)).toEqual({ ok: true });
    expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith('pi_1');
  });
  it('rejects a session started by a different guardian', async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue(good());
    expect((await consumeConsent({ ...args, authUserId: 'u2' })).ok).toBe(false);
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
  });
  it('rejects a different household or child name', async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue(good());
    expect((await consumeConsent({ ...args, householdId: 'h2' })).ok).toBe(false);
    expect((await consumeConsent({ ...args, childName: 'Max' })).ok).toBe(false);
  });
  it('rejects an unfinished checkout, an expired one, and an already-used one', async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue({ ...good(), status: 'open' });
    expect((await consumeConsent(args)).ok).toBe(false);
    stripe.checkout.sessions.retrieve.mockResolvedValue({ ...good(), created: 1 });
    expect((await consumeConsent(args)).ok).toBe(false);
    stripe.checkout.sessions.retrieve.mockResolvedValue({ ...good(), payment_intent: { id: 'pi_1', status: 'canceled' } });
    expect((await consumeConsent(args)).ok).toBe(false);
  });
  it('rejects non-consent sessions (e.g. a subscription checkout)', async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue({ ...good(), metadata: { householdId: 'h1', authUserId: 'u1' } });
    expect((await consumeConsent(args)).ok).toBe(false);
  });
  it('fails closed if the cancel race is lost', async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue(good());
    stripe.paymentIntents.cancel.mockRejectedValue(new Error('already canceled'));
    expect((await consumeConsent(args)).ok).toBe(false);
  });
});
