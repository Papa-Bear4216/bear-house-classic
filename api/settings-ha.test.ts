import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  resolveCallerMember: vi.fn(),
  dbGetHouseholdHA: vi.fn(),
  dbSetHouseholdHA: vi.fn(),
}));
vi.mock('./_crypto.js', () => ({ encryptSecret: vi.fn(async (s: string) => `enc:${s}`) }));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler from './settings-ha';
import { resolveCallerMember, dbGetHouseholdHA, dbSetHouseholdHA } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';

function req(body: unknown | null, method = 'POST', auth = 'Bearer valid-token') {
  return new Request('https://example.com/api/settings-ha', {
    method,
    headers: { authorization: auth, 'content-type': 'application/json' },
    ...(body !== null ? { body: JSON.stringify(body) } : {}),
  });
}

const admin = { householdId: 'h1', memberId: 'admin1', role: 'admin', canControlDevices: false };
const child = { householdId: 'h1', memberId: 'kid1', role: 'child', canControlDevices: false };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe('GET /api/settings-ha', () => {
  it('rejects with 401 when there is no bearer token', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(null);
    const res = await handler(req(null, 'GET', ''));
    expect(res.status).toBe(401);
  });

  it('returns status for any authenticated role (read-only)', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(child as any);
    vi.mocked(dbGetHouseholdHA).mockResolvedValue({ ha_url: 'https://ha.example.com', ha_token_encrypted: 'enc' });
    const res = await handler(req(null, 'GET'));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/settings-ha', () => {
  it('rejects with 403 when a child tries to set the HA connection', async () => {
    // P1 from TRIAD_FULL_CODEBASE_REVIEW_2026-09-27.md: this route had zero
    // role check even though the UI restricts it to admins — a child could
    // wipe or repoint the household's Home Assistant connection.
    vi.mocked(resolveCallerMember).mockResolvedValue(child as any);
    const res = await handler(req({ action: 'clear' }));
    expect(res.status).toBe(403);
    expect(dbSetHouseholdHA).not.toHaveBeenCalled();
  });

  it('rejects with 403 when a child tries to clear the HA connection', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(child as any);
    const res = await handler(req({ action: 'set', url: 'https://ha.example.com', token: 't' }));
    expect(res.status).toBe(403);
  });

  it('allows an admin to clear the connection', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    const res = await handler(req({ action: 'clear' }));
    expect(res.status).toBe(200);
    expect(dbSetHouseholdHA).toHaveBeenCalledWith('h1', null, null);
  });

  it('rejects a URL pointing at a private/internal address (SSRF guard)', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    const res = await handler(req({ action: 'set', url: 'https://169.254.169.254/', token: 't' }));
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(dbSetHouseholdHA).not.toHaveBeenCalled();
  });

  it('rejects when the test connection redirects instead of connecting directly', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    vi.mocked(fetch).mockResolvedValueOnce({ type: 'opaqueredirect', status: 0, ok: false } as any);
    const res = await handler(req({ action: 'set', url: 'https://ha.example.com', token: 't' }));
    expect(res.status).toBe(400);
    expect(dbSetHouseholdHA).not.toHaveBeenCalled();
  });

  it('saves an encrypted token when the connection test succeeds', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, type: 'basic' } as any);
    const res = await handler(req({ action: 'set', url: 'https://ha.example.com', token: 'secret-token' }));
    expect(res.status).toBe(200);
    expect(dbSetHouseholdHA).toHaveBeenCalledWith('h1', 'https://ha.example.com', 'enc:secret-token');
  });

  it('rejects with 400 when the connection test fails', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 401, type: 'basic' } as any);
    const res = await handler(req({ action: 'set', url: 'https://ha.example.com', token: 'bad' }));
    expect(res.status).toBe(400);
    expect(dbSetHouseholdHA).not.toHaveBeenCalled();
  });
});
