import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  resolveCallerMember: vi.fn(),
  dbGetHouseholdKeys: vi.fn(),
  dbSetHouseholdKey: vi.fn(),
}));
vi.mock('./_crypto.js', () => ({
  encryptSecret: vi.fn(async (s: string) => `enc:${s}`),
  decryptSecret: vi.fn(async (s: string) => s.replace(/^enc:/, '')),
  maskKey: vi.fn((s: string) => `masked:${s.slice(0, 3)}`),
}));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler from './settings-keys';
import { resolveCallerMember, dbGetHouseholdKeys, dbSetHouseholdKey } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';

function req(body: unknown | null, method = 'POST', auth = 'Bearer valid-token') {
  return new Request('https://example.com/api/settings-keys', {
    method,
    headers: { authorization: auth, 'content-type': 'application/json' },
    ...(body !== null ? { body: JSON.stringify(body) } : {}),
  });
}

const admin = { householdId: 'h1', memberId: 'admin1', role: 'admin', canControlDevices: false };
const child = { householdId: 'h1', memberId: 'kid1', role: 'child', canControlDevices: false };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe('GET /api/settings-keys', () => {
  it('rejects with 401 when there is no bearer token', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(null);
    const res = await handler(req(null, 'GET', ''));
    expect(res.status).toBe(401);
  });

  it('returns masked status for any authenticated role (read-only)', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(child as any);
    vi.mocked(dbGetHouseholdKeys).mockResolvedValue({ byo_anthropic_key_encrypted: null, byo_gemini_key_encrypted: null });
    const res = await handler(req(null, 'GET'));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/settings-keys', () => {
  it('rejects with 403 when a child tries to set an API key', async () => {
    // P1 from TRIAD_FULL_CODEBASE_REVIEW_2026-09-27.md follow-up: this route
    // had zero role check even though its UI tab is admin-only — a child
    // could set or clear the household's BYO API keys.
    vi.mocked(resolveCallerMember).mockResolvedValue(child as any);
    const res = await handler(req({ action: 'set', provider: 'anthropic', apiKey: 'sk-ant-x' }));
    expect(res.status).toBe(403);
    expect(dbSetHouseholdKey).not.toHaveBeenCalled();
  });

  it('rejects with 403 when a child tries to clear an API key', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(child as any);
    const res = await handler(req({ action: 'clear', provider: 'gemini' }));
    expect(res.status).toBe(403);
  });

  it('allows an admin to set an API key', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    const res = await handler(req({ action: 'set', provider: 'anthropic', apiKey: 'sk-ant-x' }));
    expect(res.status).toBe(200);
    expect(dbSetHouseholdKey).toHaveBeenCalledWith('h1', 'anthropic', 'enc:sk-ant-x');
  });

  it('allows an admin to clear an API key', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    const res = await handler(req({ action: 'clear', provider: 'gemini' }));
    expect(res.status).toBe(200);
    expect(dbSetHouseholdKey).toHaveBeenCalledWith('h1', 'gemini', null);
  });
});
