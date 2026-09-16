import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  resolveHouseholdIdByWebhookToken: vi.fn(),
  dbGet: vi.fn(),
  dbSet: vi.fn(),
}));
vi.mock('./_notify.js', () => ({ notifyIFTTT: vi.fn(), notifyPush: vi.fn() }));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler from './ha-webhook';
import { resolveHouseholdIdByWebhookToken, dbGet, dbSet } from './_db.js';
import { notifyIFTTT, notifyPush } from './_notify.js';
import { checkRateLimit } from './_rateLimit.js';

function req(body: unknown, token: string | null = 'webhook-token-123') {
  return new Request('https://example.com/api/ha-webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-webhook-token': token } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(dbGet).mockResolvedValue([]);
  vi.mocked(dbSet).mockResolvedValue(undefined);
});

describe('POST /api/ha-webhook', () => {
  it('rejects with 401 when no webhook token is provided (header or body)', async () => {
    vi.mocked(resolveHouseholdIdByWebhookToken).mockResolvedValue(null);
    const res = await handler(req({ event: 'person_arrived', person: 'Alex' }, null));
    expect(res.status).toBe(401);
  });

  it('rejects with 401 when the webhook token does not resolve to a household', async () => {
    vi.mocked(resolveHouseholdIdByWebhookToken).mockResolvedValue(null);
    const res = await handler(req({ event: 'person_arrived', person: 'Alex' }));
    expect(res.status).toBe(401);
  });

  it('accepts the token from the request body when the header is absent', async () => {
    vi.mocked(resolveHouseholdIdByWebhookToken).mockResolvedValue('household-1');
    const res = await handler(new Request('https://example.com/api/ha-webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'person_arrived', person: 'Alex', token: 'webhook-token-123' }),
    }));
    expect(res.status).toBe(200);
    expect(resolveHouseholdIdByWebhookToken).toHaveBeenCalledWith('webhook-token-123');
  });

  it('rejects with 429 when the household is rate-limited', async () => {
    vi.mocked(resolveHouseholdIdByWebhookToken).mockResolvedValue('household-1');
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 8 });
    const res = await handler(req({ event: 'person_arrived', person: 'Alex' }));
    expect(res.status).toBe(429);
  });

  it('rejects with 400 for an unrecognized event type', async () => {
    vi.mocked(resolveHouseholdIdByWebhookToken).mockResolvedValue('household-1');
    const res = await handler(req({ event: 'not_a_real_event' }));
    expect(res.status).toBe(400);
  });

  it('creates a task and notifies on package_delivered', async () => {
    vi.mocked(resolveHouseholdIdByWebhookToken).mockResolvedValue('household-1');
    const res = await handler(req({ event: 'package_delivered' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe('task_created');
    expect(notifyIFTTT).toHaveBeenCalled();
    expect(notifyPush).toHaveBeenCalledWith('household-1', expect.any(String), expect.any(String));
  });

  it('skips duplicate task creation and does not re-notify when an identical open task already exists', async () => {
    vi.mocked(resolveHouseholdIdByWebhookToken).mockResolvedValue('household-1');
    vi.mocked(dbGet).mockResolvedValue([
      { text: 'Bring in package from front door', completed: false },
    ]);

    const res = await handler(req({ event: 'package_delivered' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe('duplicate_skipped');
    expect(notifyIFTTT).not.toHaveBeenCalled();
    expect(notifyPush).not.toHaveBeenCalled();
  });

  it('logs presence without creating a task on person_arrived', async () => {
    vi.mocked(resolveHouseholdIdByWebhookToken).mockResolvedValue('household-1');
    const res = await handler(req({ event: 'person_arrived', person: 'Alex', area: 'kitchen' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe('presence_logged');
  });
});
