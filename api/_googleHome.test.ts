import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isAllowedRedirect, signAccessToken, verifyAccessToken, timingSafeEqual,
  createAuthCode, consumeAuthCode, resolveGoogleHomeCaller, googleHomeConfig,
} from './_googleHome';

beforeEach(() => {
  vi.unstubAllGlobals();
  process.env.SUPABASE_SERVICE_KEY = 'svc';
  process.env.GOOGLE_HOME_CLIENT_ID = 'cid';
  process.env.GOOGLE_HOME_CLIENT_SECRET = 'secret';
  process.env.GOOGLE_HOME_PROJECT_ID = 'proj-1';
});

const okJson = (json: unknown) => ({ ok: true, status: 200, json: async () => json }) as any;

describe('config', () => {
  it('is null unless all three env vars are set', () => {
    expect(googleHomeConfig()).not.toBeNull();
    delete process.env.GOOGLE_HOME_PROJECT_ID;
    expect(googleHomeConfig()).toBeNull();
  });
});

describe('isAllowedRedirect', () => {
  it('allows only Google\'s two redirect URLs for this project', () => {
    expect(isAllowedRedirect('https://oauth-redirect.googleusercontent.com/r/proj-1', 'proj-1')).toBe(true);
    expect(isAllowedRedirect('https://oauth-redirect-sandbox.googleusercontent.com/r/proj-1', 'proj-1')).toBe(true);
  });
  it('rejects other projects, hosts, and lookalikes', () => {
    expect(isAllowedRedirect('https://oauth-redirect.googleusercontent.com/r/other', 'proj-1')).toBe(false);
    expect(isAllowedRedirect('https://evil.example.com/r/proj-1', 'proj-1')).toBe(false);
    expect(isAllowedRedirect('https://oauth-redirect.googleusercontent.com/r/proj-1/../x', 'proj-1')).toBe(false);
    expect(isAllowedRedirect('https://oauth-redirect.googleusercontent.com.evil.com/r/proj-1', 'proj-1')).toBe(false);
  });
});

describe('access tokens', () => {
  it('round-trips', async () => {
    const { token } = await signAccessToken('link-1', 'secret');
    expect(await verifyAccessToken(token, 'secret')).toEqual({ linkId: 'link-1' });
  });
  it('rejects a wrong secret, a tampered link id, and an expired token', async () => {
    const { token } = await signAccessToken('link-1', 'secret');
    expect(await verifyAccessToken(token, 'other-secret')).toBeNull();
    expect(await verifyAccessToken(token.replace('link-1', 'link-2'), 'secret')).toBeNull();
    const old = await signAccessToken('link-1', 'secret', Date.now() - 2 * 3600 * 1000);
    expect(await verifyAccessToken(old.token, 'secret')).toBeNull();
  });
  it('rejects malformed tokens', async () => {
    for (const t of ['', 'abc', 'ght1.only.three', 'xxx.a.1.b']) expect(await verifyAccessToken(t, 'secret')).toBeNull();
  });
});

describe('timingSafeEqual', () => {
  it('compares equal-length strings and rejects mismatched lengths', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('auth codes', () => {
  it('stores only a hash of the code, never the code itself', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const code = await createAuthCode({ memberId: 'm1', householdId: 'h1' }, 'https://oauth-redirect.googleusercontent.com/r/proj-1');
    expect(code).toMatch(/^ghc_[0-9a-f]{64}$/);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(sent)).not.toContain(code!);
    expect(sent.member_id).toBe('m1');
  });

  it('consuming a code is a DELETE restricted to unexpired rows (single-use)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson([{ member_id: 'm1', household_id: 'h1', redirect_uri: 'u' }]));
    vi.stubGlobal('fetch', fetchMock);
    const row = await consumeAuthCode('ghc_x');
    expect(row).toEqual({ member_id: 'm1', household_id: 'h1', redirect_uri: 'u' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('DELETE');
    expect(String(url)).toContain('expires_at=gt.');
  });

  it('returns null when nothing was deleted (already used or expired)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okJson([])));
    expect(await consumeAuthCode('ghc_x')).toBeNull();
  });
});

describe('resolveGoogleHomeCaller', () => {
  it('resolves the linked member with their CURRENT role and household', async () => {
    const { token } = await signAccessToken('link-1', 'secret');
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(okJson([{ id: 'link-1', member_id: 'm1' }]))
      .mockResolvedValueOnce(okJson([{ id: 'm1', household_id: 'h2', role: 'child', can_control_devices: false }])));
    expect(await resolveGoogleHomeCaller(token)).toEqual({ linkId: 'link-1', householdId: 'h2', memberId: 'm1', role: 'child', canControlDevices: false });
  });

  it('returns null for a revoked link (no row) and never looks up the member', async () => {
    const { token } = await signAccessToken('link-1', 'secret');
    const fetchMock = vi.fn().mockResolvedValueOnce(okJson([]));
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveGoogleHomeCaller(token)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null for a forged token without touching the database', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveGoogleHomeCaller('ght1.link-1.9999999999.deadbeef')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
