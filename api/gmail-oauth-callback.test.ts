import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  dbGetHouseholdMemberById: vi.fn(),
  dbSetMemberGmailToken: vi.fn(),
}));

import handler from './gmail-oauth-callback';
import { dbGetHouseholdMemberById, dbSetMemberGmailToken } from './_db.js';
import { signGmailState } from './_crypto';

function req(params: Record<string, string> = {}) {
  const url = new URL('https://example.com/api/gmail-oauth-callback');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url, { method: 'GET' });
}

function locationDetail(res: Response): string | null {
  const loc = res.headers.get('Location');
  if (!loc) return null;
  return new URL(loc).searchParams.get('detail');
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  process.env.GMAIL_STATE_SECRET = 'test-gmail-state-secret-do-not-use-in-prod';
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret';
  // 32 zero bytes, base64-encoded — encryptSecret() requires a configured
  // ENCRYPTION_KEY on the success path (real key value doesn't matter here).
  process.env.ENCRYPTION_KEY = Buffer.alloc(32).toString('base64');
});

describe('GET /api/gmail-oauth-callback', () => {
  it('redirects with error when Google returned an error param', async () => {
    const res = await handler(req({ error: 'access_denied' }));
    expect(res.status).toBe(302);
    expect(locationDetail(res)).toBe('access_denied');
  });

  it('redirects with missing_code_or_state when code or state is absent', async () => {
    const res = await handler(req({ state: 'x' }));
    expect(locationDetail(res)).toBe('missing_code_or_state');
  });

  it('redirects with invalid_state for an unsigned/forged state', async () => {
    const forged = encodeURIComponent(JSON.stringify({ memberId: 'm1', householdId: 'h1' }));
    const res = await handler(req({ code: 'abc', state: forged }));
    expect(locationDetail(res)).toBe('invalid_state');
    expect(dbGetHouseholdMemberById).not.toHaveBeenCalled();
  });

  it('redirects with invalid_state for an expired signed state', async () => {
    const realNow = Date.now;
    Date.now = () => realNow() - 11 * 60 * 1000;
    const state = await signGmailState({ memberId: 'm1', householdId: 'h1' });
    Date.now = realNow;

    const res = await handler(req({ code: 'abc', state: encodeURIComponent(state) }));
    expect(locationDetail(res)).toBe('invalid_state');
  });

  it('accepts a valid signed state and proceeds to token exchange', async () => {
    const state = await signGmailState({ memberId: 'm1', householdId: 'h1' });
    vi.mocked(dbGetHouseholdMemberById).mockResolvedValue({ id: 'm1', household_id: 'h1' } as any);

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ refresh_token: 'rt', access_token: 'at' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ email: 'kid@example.com' }) } as Response);

    const res = await handler(req({ code: 'abc', state: encodeURIComponent(state) }));

    expect(locationDetail(res)).toBeNull();
    expect(res.headers.get('Location')).toContain('gmail_oauth=connected');
    expect(dbSetMemberGmailToken).toHaveBeenCalledWith('m1', expect.any(String), 'kid@example.com');
  });

  it('redirects with member_mismatch if the signed state\'s household no longer matches the member row', async () => {
    // Defense in depth: even with a validly-signed state, if the member's
    // household has since changed, don't proceed.
    const state = await signGmailState({ memberId: 'm1', householdId: 'h1' });
    vi.mocked(dbGetHouseholdMemberById).mockResolvedValue({ id: 'm1', household_id: 'h2' } as any);

    const res = await handler(req({ code: 'abc', state: encodeURIComponent(state) }));
    expect(locationDetail(res)).toBe('member_mismatch');
  });
});
