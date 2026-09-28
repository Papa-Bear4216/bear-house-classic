import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  resolveCallerMember: vi.fn(),
  dbGetHouseholdMemberById: vi.fn(),
  dbGetHouseholdActivity: vi.fn(),
  dbAddHouseholdActivity: vi.fn(),
}));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler from './activity';
import { resolveCallerMember, dbGetHouseholdMemberById, dbAddHouseholdActivity } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveCallerMember).mockResolvedValue({
    householdId: 'h1', memberId: 'member-1', role: 'child', canControlDevices: false,
  });
  vi.mocked(dbGetHouseholdMemberById).mockResolvedValue({
    id: 'member-1', name: 'Avery', email: null, role: 'child', color: 'blue', pin_hash: null, household_id: 'h1',
  });
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe('POST /api/activity', () => {
  it('rejects an authenticated token that does not resolve to a member', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(null);
    const req = new Request('https://example.test/api/activity', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Finished the dishes' }),
    });
    const res = await handler(req);
    expect(res.status).toBe(401);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(dbAddHouseholdActivity).not.toHaveBeenCalled();
  });

  it('uses the authenticated member name instead of a client-supplied actor', async () => {
    const req = new Request('https://example.test/api/activity', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
      body: JSON.stringify({ actorName: 'Parent', text: 'Finished the dishes' }),
    });
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(dbAddHouseholdActivity).toHaveBeenCalledWith('h1', 'Avery', 'Finished the dishes');
  });

  it('refuses to write if the caller member no longer belongs to the resolved household', async () => {
    vi.mocked(dbGetHouseholdMemberById).mockResolvedValue({
      id: 'member-1', name: 'Avery', email: null, role: 'child', color: 'blue', pin_hash: null, household_id: 'other-household',
    });
    const req = new Request('https://example.test/api/activity', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Finished the dishes' }),
    });
    const res = await handler(req);
    expect(res.status).toBe(401);
    expect(dbAddHouseholdActivity).not.toHaveBeenCalled();
  });

  it('refuses to attribute an activity to a deleted member', async () => {
    vi.mocked(dbGetHouseholdMemberById).mockResolvedValue(null);
    const req = new Request('https://example.test/api/activity', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Finished the dishes' }),
    });
    const res = await handler(req);
    expect(res.status).toBe(401);
    expect(dbAddHouseholdActivity).not.toHaveBeenCalled();
  });

  it('does not write activity when the caller exceeds the rate limit', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 20 });
    const req = new Request('https://example.test/api/activity', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Finished the dishes' }),
    });
    const res = await handler(req);
    expect(res.status).toBe(429);
    expect(dbAddHouseholdActivity).not.toHaveBeenCalled();
  });
});
