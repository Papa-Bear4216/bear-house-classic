import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  resolveHouseholdId: vi.fn(),
  dbGetPushTokensByHouseholdId: vi.fn(),
}));

vi.mock('./_notify.js', () => ({
  sendPushToTokens: vi.fn(),
  notifyIFTTT: vi.fn(),
}));

import handler from './triad-notify';
import { resolveHouseholdId, dbGetPushTokensByHouseholdId } from './_db.js';
import { sendPushToTokens, notifyIFTTT } from './_notify.js';

function req(body: unknown, auth = 'Bearer valid-token', host = 'example.com') {
  return new Request('https://example.com/api/triad-notify', {
    method: 'POST',
    headers: {
      authorization: auth,
      host,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/triad-notify', () => {
  it('handles CORS OPTIONS preflight with 204', async () => {
    const res = await handler(new Request('https://example.com/api/triad-notify', { method: 'OPTIONS' }));
    expect(res.status).toBe(204);
  });

  it('rejects with 401 when no auth provided', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req({ title: 'Alert' }, '', 'remote-client.com'));
    expect(res.status).toBe(401);
  });

  it('dispatches FCM push to registered household tokens', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(dbGetPushTokensByHouseholdId).mockResolvedValue(['token-fcm-galaxy-s26']);
    vi.mocked(sendPushToTokens).mockResolvedValue(1);

    const res = await handler(req({ title: 'Self-Healing Patch Applied', body: 'Merged cleanly', status: 'success' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.fcmCount).toBe(1);
    expect(sendPushToTokens).toHaveBeenCalledWith(['token-fcm-galaxy-s26'], 'Self-Healing Patch Applied', 'Merged cleanly');
  });
});
