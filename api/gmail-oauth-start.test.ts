import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  resolveCallerMember: vi.fn(),
  dbGetHouseholdMembersByHouseholdId: vi.fn(),
}));

import handler from './gmail-oauth-start';
import { resolveCallerMember, dbGetHouseholdMembersByHouseholdId } from './_db.js';

function req(params: Record<string, string> = {}) {
  const url = new URL('https://example.com/api/gmail-oauth-start');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url, { method: 'GET' });
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
  process.env.GMAIL_STATE_SECRET = 'test-gmail-state-secret-do-not-use-in-prod';
});

describe('GET /api/gmail-oauth-start', () => {
  it('rejects with 401 when there is no token', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(null);
    const res = await handler(req());
    expect(res.status).toBe(401);
  });

  it('rejects with 401 when the token does not resolve to a caller', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(null);
    const res = await handler(req({ token: 'bad-token' }));
    expect(res.status).toBe(401);
  });

  it('allows a child-role caller to connect their own Gmail (memberId omitted)', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue({ memberId: 'm1', householdId: 'h1', role: 'child' });
    vi.mocked(dbGetHouseholdMembersByHouseholdId).mockResolvedValue([{ id: 'm1', role: 'child' } as any]);

    const res = await handler(req({ token: 'valid' }));
    expect(res.status).toBe(302);
    const location = res.headers.get('Location')!;
    expect(location).toContain('accounts.google.com');
    const state = new URL(location).searchParams.get('state')!;
    // state is a signed token, not raw JSON — must not be directly parseable.
    expect(() => JSON.parse(decodeURIComponent(state))).toThrow();
  });

  it('rejects with 403 when a child tries to connect a different member', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue({ memberId: 'm1', householdId: 'h1', role: 'child' });
    const res = await handler(req({ token: 'valid', memberId: 'm2' }));
    expect(res.status).toBe(403);
    expect(dbGetHouseholdMembersByHouseholdId).not.toHaveBeenCalled();
  });

  it('allows an admin to connect Gmail for a different (non-superadmin) member', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue({ memberId: 'admin1', householdId: 'h1', role: 'admin' });
    vi.mocked(dbGetHouseholdMembersByHouseholdId).mockResolvedValue([
      { id: 'admin1', role: 'admin' } as any,
      { id: 'kid1', role: 'child' } as any,
    ]);

    const res = await handler(req({ token: 'valid', memberId: 'kid1' }));
    expect(res.status).toBe(302);
  });

  it('rejects with 403 when an admin tries to manage a superadmin\'s Gmail connection', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue({ memberId: 'admin1', householdId: 'h1', role: 'admin' });
    vi.mocked(dbGetHouseholdMembersByHouseholdId).mockResolvedValue([
      { id: 'admin1', role: 'admin' } as any,
      { id: 'super1', role: 'superadmin' } as any,
    ]);

    const res = await handler(req({ token: 'valid', memberId: 'super1' }));
    expect(res.status).toBe(403);
  });

  it('allows a superadmin to manage another superadmin\'s Gmail connection', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue({ memberId: 'super1', householdId: 'h1', role: 'superadmin' });
    vi.mocked(dbGetHouseholdMembersByHouseholdId).mockResolvedValue([
      { id: 'super1', role: 'superadmin' } as any,
      { id: 'super2', role: 'superadmin' } as any,
    ]);

    const res = await handler(req({ token: 'valid', memberId: 'super2' }));
    expect(res.status).toBe(302);
  });

  it('rejects with 404 when the target member is not in this household', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue({ memberId: 'admin1', householdId: 'h1', role: 'admin' });
    vi.mocked(dbGetHouseholdMembersByHouseholdId).mockResolvedValue([{ id: 'admin1', role: 'admin' } as any]);

    const res = await handler(req({ token: 'valid', memberId: 'ghost' }));
    expect(res.status).toBe(404);
  });

  it('rejects with 500 when GOOGLE_OAUTH_CLIENT_ID is not configured', async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    vi.mocked(resolveCallerMember).mockResolvedValue({ memberId: 'm1', householdId: 'h1', role: 'child' });
    vi.mocked(dbGetHouseholdMembersByHouseholdId).mockResolvedValue([{ id: 'm1', role: 'child' } as any]);

    const res = await handler(req({ token: 'valid' }));
    expect(res.status).toBe(500);
  });
});
