import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  resolveCallerMember: vi.fn(),
}));
vi.mock('./_haConfig.js', () => ({
  resolveHaConfig: vi.fn(async () => ({ haUrl: 'https://ha.example.com', haToken: 'fake-token' })),
}));
vi.mock('./_rateLimit.js', () => ({
  checkRateLimit: vi.fn(),
}));

import handler from './ha-fix';
import { resolveCallerMember } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';

function req(body: unknown | null, method = 'POST', auth = 'Bearer valid-token') {
  return new Request('https://example.com/api/ha-fix', {
    method,
    headers: { authorization: auth, 'content-type': 'application/json' },
    ...(body !== null ? { body: JSON.stringify(body) } : {}),
  });
}

const admin = { householdId: 'h1', memberId: 'admin1', role: 'admin', canControlDevices: false };
const child = { householdId: 'h1', memberId: 'kid1', role: 'child', canControlDevices: false };

describe('POST /api/ha-fix', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }))));
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  });

  it('rejects with 401 when unauthenticated', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(null);
    const res = await handler(req({ integration: 'wyze_bridge' }, 'POST', ''));
    expect(res.status).toBe(401);
  });

  it('rejects with 403 when a child attempts to run a fix', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(child as any);
    const res = await handler(req({ integration: 'wyze_bridge' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('Only an admin can run integration fixes');
  });

  it('rejects with 400 for an unknown or unsupported integration', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    const res = await handler(req({ integration: 'malicious_addon_slug' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Unsupported integration for fix/);
  });

  it('rejects with 429 when rate limited', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 15 });
    const res = await handler(req({ integration: 'wyze_bridge' }));
    expect(res.status).toBe(429);
  });

  it('allows an admin to run a fix on an allowed integration', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    const res = await handler(req({ integration: 'wyze_bridge' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tier).toBe(1);
  });
});
