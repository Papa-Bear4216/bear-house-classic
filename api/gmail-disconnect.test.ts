import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  resolveCallerMember: vi.fn(),
  dbGetHouseholdMembersByHouseholdId: vi.fn(),
  dbClearMemberGmailToken: vi.fn(),
}));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler from './gmail-disconnect';
import { resolveCallerMember, dbGetHouseholdMembersByHouseholdId, dbClearMemberGmailToken } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';

function req(body: unknown, auth = 'Bearer valid-token') {
  return new Request('https://example.com/api/gmail-disconnect', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe('POST /api/gmail-disconnect', () => {
  it('rejects with 401 when there is no bearer token', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(null);
    const res = await handler(req({ memberId: 'm1' }, ''));
    expect(res.status).toBe(401);
  });

  it('allows self-disconnect for any role', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue({ memberId: 'm1', householdId: 'h1', role: 'child' });
    vi.mocked(dbGetHouseholdMembersByHouseholdId).mockResolvedValue([{ id: 'm1', role: 'child' } as any]);

    const res = await handler(req({ memberId: 'm1' }));
    expect(res.status).toBe(200);
    expect(dbClearMemberGmailToken).toHaveBeenCalledWith('m1');
  });

  it('rejects with 403 when a non-admin tries to disconnect a different member', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue({ memberId: 'm1', householdId: 'h1', role: 'child' });
    const res = await handler(req({ memberId: 'm2' }));
    expect(res.status).toBe(403);
    expect(dbGetHouseholdMembersByHouseholdId).not.toHaveBeenCalled();
  });

  it('allows an admin to disconnect a different (non-superadmin) member', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue({ memberId: 'admin1', householdId: 'h1', role: 'admin' });
    vi.mocked(dbGetHouseholdMembersByHouseholdId).mockResolvedValue([
      { id: 'admin1', role: 'admin' } as any,
      { id: 'kid1', role: 'child' } as any,
    ]);

    const res = await handler(req({ memberId: 'kid1' }));
    expect(res.status).toBe(200);
  });

  it('rejects with 403 when an admin tries to disconnect a superadmin', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue({ memberId: 'admin1', householdId: 'h1', role: 'admin' });
    vi.mocked(dbGetHouseholdMembersByHouseholdId).mockResolvedValue([
      { id: 'admin1', role: 'admin' } as any,
      { id: 'super1', role: 'superadmin' } as any,
    ]);

    const res = await handler(req({ memberId: 'super1' }));
    expect(res.status).toBe(403);
    expect(dbClearMemberGmailToken).not.toHaveBeenCalled();
  });

  it('rejects with 404 when the target member is not in this household', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue({ memberId: 'admin1', householdId: 'h1', role: 'admin' });
    vi.mocked(dbGetHouseholdMembersByHouseholdId).mockResolvedValue([{ id: 'admin1', role: 'admin' } as any]);

    const res = await handler(req({ memberId: 'ghost' }));
    expect(res.status).toBe(404);
  });

  it('rejects with 429 when the household is rate-limited', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue({ memberId: 'm1', householdId: 'h1', role: 'child' });
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 10 });
    const res = await handler(req({ memberId: 'm1' }));
    expect(res.status).toBe(429);
  });
});
