import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_googleHome.js', async (orig) => ({
  ...(await orig<typeof import('./_googleHome.js')>()),
  consumeAuthCode: vi.fn(), createLink: vi.fn(), findLinkByRefresh: vi.fn(),
}));

import handler from './google-home-token';
import { consumeAuthCode, createLink, findLinkByRefresh, verifyAccessToken } from './_googleHome.js';

const REDIRECT = 'https://oauth-redirect.googleusercontent.com/r/proj-1';

const post = (form: Record<string, string>, headers: Record<string, string> = {}) => new Request('https://x/api/google-home-token', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(form).toString(),
});
const creds = { client_id: 'cid', client_secret: 'secret' };

beforeEach(() => {
  vi.resetAllMocks();
  process.env.GOOGLE_HOME_CLIENT_ID = 'cid';
  process.env.GOOGLE_HOME_CLIENT_SECRET = 'secret';
  process.env.GOOGLE_HOME_PROJECT_ID = 'proj-1';
});

describe('POST /api/google-home-token', () => {
  it('rejects wrong client credentials before touching any code', async () => {
    const res = await handler(post({ grant_type: 'authorization_code', code: 'c', redirect_uri: REDIRECT, client_id: 'cid', client_secret: 'wrong' }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('invalid_client');
    expect(consumeAuthCode).not.toHaveBeenCalled();
  });

  it('accepts client credentials via HTTP Basic', async () => {
    vi.mocked(consumeAuthCode).mockResolvedValue({ member_id: 'm1', household_id: 'h1', redirect_uri: REDIRECT });
    vi.mocked(createLink).mockResolvedValue({ id: 'link-1', refreshToken: 'ghr_abc' });
    const res = await handler(post({ grant_type: 'authorization_code', code: 'c', redirect_uri: REDIRECT }, { authorization: `Basic ${btoa('cid:secret')}` }));
    expect(res.status).toBe(200);
  });

  it('exchanges a valid code for a signed access token and a refresh token', async () => {
    vi.mocked(consumeAuthCode).mockResolvedValue({ member_id: 'm1', household_id: 'h1', redirect_uri: REDIRECT });
    vi.mocked(createLink).mockResolvedValue({ id: 'link-1', refreshToken: 'ghr_abc' });
    const body = await (await handler(post({ grant_type: 'authorization_code', code: 'c', redirect_uri: REDIRECT, ...creds }))).json();
    expect(body).toMatchObject({ token_type: 'Bearer', refresh_token: 'ghr_abc', expires_in: 3600 });
    expect(await verifyAccessToken(body.access_token, 'secret')).toEqual({ linkId: 'link-1' });
    expect(createLink).toHaveBeenCalledWith('m1', 'h1');
  });

  it('invalid_grant for an unknown/used/expired code', async () => {
    vi.mocked(consumeAuthCode).mockResolvedValue(null);
    const res = await handler(post({ grant_type: 'authorization_code', code: 'c', redirect_uri: REDIRECT, ...creds }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_grant');
    expect(createLink).not.toHaveBeenCalled();
  });

  it('invalid_grant when the code was issued for a different redirect_uri', async () => {
    vi.mocked(consumeAuthCode).mockResolvedValue({ member_id: 'm1', household_id: 'h1', redirect_uri: 'https://other' });
    const res = await handler(post({ grant_type: 'authorization_code', code: 'c', redirect_uri: REDIRECT, ...creds }));
    expect((await res.json()).error).toBe('invalid_grant');
    expect(createLink).not.toHaveBeenCalled();
  });

  it('refresh_token issues a new access token without a new refresh token', async () => {
    vi.mocked(findLinkByRefresh).mockResolvedValue({ id: 'link-1' });
    const body = await (await handler(post({ grant_type: 'refresh_token', refresh_token: 'ghr_abc', ...creds }))).json();
    expect(body.refresh_token).toBeUndefined();
    expect(await verifyAccessToken(body.access_token, 'secret')).toEqual({ linkId: 'link-1' });
  });

  it('invalid_grant for a revoked or unknown refresh token', async () => {
    vi.mocked(findLinkByRefresh).mockResolvedValue(null);
    const res = await handler(post({ grant_type: 'refresh_token', refresh_token: 'ghr_x', ...creds }));
    expect((await res.json()).error).toBe('invalid_grant');
  });

  it('unsupported grant types and non-POST are rejected; unconfigured is 503', async () => {
    expect((await (await handler(post({ grant_type: 'password', ...creds }))).json()).error).toBe('unsupported_grant_type');
    expect((await handler(new Request('https://x/api/google-home-token', { method: 'GET' }))).status).toBe(405);
    delete process.env.GOOGLE_HOME_PROJECT_ID;
    expect((await handler(post({ grant_type: 'refresh_token', ...creds }))).status).toBe(503);
  });
});
