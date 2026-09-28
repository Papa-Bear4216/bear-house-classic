import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  resolveCallerMember: vi.fn(),
  dbUpsertPushToken: vi.fn(),
}));

import handler from './register-push-token';
import { resolveCallerMember, dbUpsertPushToken } from './_db.js';

function req(body: unknown, auth = 'Bearer valid-token') {
  return new Request('https://example.com/api/register-push-token', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const caller = { householdId: 'h1', memberId: 'm1', role: 'child', canControlDevices: false };

beforeEach(() => {
  vi.resetAllMocks();
});

describe('POST /api/register-push-token', () => {
  it('rejects with 401 when there is no bearer token', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(null);
    const res = await handler(req({ token: 'fcm-token' }, ''));
    expect(res.status).toBe(401);
  });

  it('rejects with 400 when token is missing', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(caller as any);
    const res = await handler(req({}));
    expect(res.status).toBe(400);
  });

  it('registers the token under the caller\'s own personId when omitted', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(caller as any);
    const res = await handler(req({ token: 'fcm-token' }));
    expect(res.status).toBe(200);
    expect(dbUpsertPushToken).toHaveBeenCalledWith('h1', 'fcm-token', 'android', undefined);
  });

  it('registers the token when personId explicitly matches the caller', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(caller as any);
    const res = await handler(req({ token: 'fcm-token', personId: 'm1' }));
    expect(res.status).toBe(200);
    expect(dbUpsertPushToken).toHaveBeenCalledWith('h1', 'fcm-token', 'android', 'm1');
  });

  it('rejects with 403 when personId does not match the caller\'s own id', async () => {
    // Regression guard: without this check, any authenticated household
    // member could register a push token under a DIFFERENT member's id and
    // receive notifications meant for that person.
    vi.mocked(resolveCallerMember).mockResolvedValue(caller as any);
    const res = await handler(req({ token: 'fcm-token', personId: 'someone-elses-id' }));
    expect(res.status).toBe(403);
    expect(dbUpsertPushToken).not.toHaveBeenCalled();
  });
});
