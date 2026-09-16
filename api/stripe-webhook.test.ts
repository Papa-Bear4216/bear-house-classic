import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_stripe.js', () => ({ getStripeClient: vi.fn() }));

import handler from './stripe-webhook';
import { getStripeClient } from './_stripe.js';

function req(body = '{}', signature: string | null = 'sig_test') {
  return new Request('https://example.com/api/stripe-webhook', {
    method: 'POST',
    headers: signature ? { 'stripe-signature': signature } : {},
    body,
  });
}

function mockStripe(constructEventAsync: (...args: unknown[]) => unknown) {
  vi.mocked(getStripeClient).mockReturnValue({
    webhooks: { constructEventAsync },
  } as any);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
});

describe('POST /api/stripe-webhook', () => {
  it('rejects with 500 when STRIPE_WEBHOOK_SECRET is not configured — a deploy misconfiguration must not crash the function', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    mockStripe(() => { throw new Error('should not be called'); });
    const res = await handler(req());
    expect(res.status).toBe(500);
  });

  it('rejects with 400 when the stripe-signature header is missing', async () => {
    mockStripe(() => { throw new Error('should not be called'); });
    const res = await handler(req('{}', null));
    expect(res.status).toBe(400);
  });

  it('rejects with 400 when signature verification fails', async () => {
    mockStripe(() => { throw new Error('invalid signature'); });
    const res = await handler(req());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/signature verification failed/i);
  });

  it('updates the household on checkout.session.completed and returns 200', async () => {
    mockStripe(() => ({
      type: 'checkout.session.completed',
      data: { object: { metadata: { householdId: 'household-1' }, customer: 'cus_1', subscription: 'sub_1' } },
    }));
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => '' } as Response);

    const res = await handler(req());

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('households?id=eq.household-1'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          stripe_customer_id: 'cus_1',
          stripe_subscription_id: 'sub_1',
          subscription_status: 'active',
        }),
      })
    );
  });

  it('ignores events with no householdId in metadata rather than erroring', async () => {
    mockStripe(() => ({
      type: 'checkout.session.completed',
      data: { object: { metadata: {}, customer: 'cus_1', subscription: 'sub_1' } },
    }));
    const fetchMock = vi.mocked(fetch);

    const res = await handler(req());

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks the household canceled on customer.subscription.deleted', async () => {
    mockStripe(() => ({
      type: 'customer.subscription.deleted',
      data: { object: { metadata: { householdId: 'household-1' }, status: 'active' } },
    }));
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => '' } as Response);

    const res = await handler(req());

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('households?id=eq.household-1'),
      expect.objectContaining({ body: JSON.stringify({ subscription_status: 'canceled' }) })
    );
  });

  it('returns 500 when the household update fails downstream', async () => {
    mockStripe(() => ({
      type: 'checkout.session.completed',
      data: { object: { metadata: { householdId: 'household-1' }, customer: 'cus_1', subscription: 'sub_1' } },
    }));
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'db error' } as Response);

    const res = await handler(req());
    expect(res.status).toBe(500);
  });
});
