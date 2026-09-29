import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  resolveCallerMember: vi.fn(),
  canControlDevices: (c: { role: string; canControlDevices: boolean }) => c.role === 'admin' || c.role === 'superadmin' || c.canControlDevices,
}));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));
vi.mock('./_googleHome.js', async (orig) => ({ ...(await orig<typeof import('./_googleHome.js')>()), createAuthCode: vi.fn() }));

import handler from './google-home-authorize';
import { resolveCallerMember } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';
import { createAuthCode } from './_googleHome.js';

const REDIRECT = 'https://oauth-redirect.googleusercontent.com/r/proj-1';
const admin = { householdId: 'h1', memberId: 'm1', role: 'admin', canControlDevices: false };
const kid = { householdId: 'h1', memberId: 'k1', role: 'child', canControlDevices: false };

const req = (body: unknown, auth = 'Bearer supabase-token') => new Request('https://x/api/google-home-authorize', {
  method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const good = { client_id: 'cid', redirect_uri: REDIRECT, state: 'st-1' };

beforeEach(() => {
  vi.resetAllMocks();
  process.env.GOOGLE_HOME_CLIENT_ID = 'cid';
  process.env.GOOGLE_HOME_CLIENT_SECRET = 'secret';
  process.env.GOOGLE_HOME_PROJECT_ID = 'proj-1';
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(createAuthCode).mockResolvedValue('ghc_code');
});

describe('POST /api/google-home-authorize', () => {
  it('503s when Google Home is not configured', async () => {
    delete process.env.GOOGLE_HOME_CLIENT_SECRET;
    expect((await handler(req(good))).status).toBe(503);
  });
  it('401s without a valid session', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(null);
    expect((await handler(req(good))).status).toBe(401);
  });
  it('403s for a child without the device-control override', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(kid as any);
    expect((await handler(req(good))).status).toBe(403);
    expect(createAuthCode).not.toHaveBeenCalled();
  });
  it('400s on a wrong client_id or a redirect that is not Google\'s', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    expect((await handler(req({ ...good, client_id: 'nope' }))).status).toBe(400);
    expect((await handler(req({ ...good, redirect_uri: 'https://evil.example.com/cb' }))).status).toBe(400);
    expect(createAuthCode).not.toHaveBeenCalled();
  });
  it('returns Google\'s redirect with the code and state', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    const body = await (await handler(req(good))).json();
    const u = new URL(body.redirectTo);
    expect(u.origin + u.pathname).toBe(REDIRECT);
    expect(u.searchParams.get('code')).toBe('ghc_code');
    expect(u.searchParams.get('state')).toBe('st-1');
    expect(createAuthCode).toHaveBeenCalledWith({ memberId: 'm1', householdId: 'h1' }, REDIRECT);
  });
  it('Cancel redirects back with access_denied and issues no code', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    const body = await (await handler(req({ ...good, deny: true }))).json();
    const u = new URL(body.redirectTo);
    expect(u.searchParams.get('error')).toBe('access_denied');
    expect(u.searchParams.get('code')).toBeNull();
    expect(createAuthCode).not.toHaveBeenCalled();
  });
});
