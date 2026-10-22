import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));
vi.mock('./_db.js', () => ({
  resolveCallerMember: vi.fn(),
  dbSetHouseholdWebhookToken: vi.fn(),
  dbHouseholdHasWebhookToken: vi.fn(),
}));

import handler from './webhook-token';
import { checkRateLimit } from './_rateLimit.js';
import { resolveCallerMember, dbSetHouseholdWebhookToken, dbHouseholdHasWebhookToken } from './_db.js';

const req = (body: unknown) =>
  new Request('https://example.com/api/webhook-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  });
const member = (role: string) => ({ householdId: 'h1', memberId: 'm1', role, canControlDevices: false });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe('POST /api/webhook-token', () => {
  it('401 without a caller; 403 for non-admins', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(null);
    expect((await handler(req({ action: 'rotate' }))).status).toBe(401);
    vi.mocked(resolveCallerMember).mockResolvedValue(member('child'));
    expect((await handler(req({ action: 'rotate' }))).status).toBe(403);
    expect(dbSetHouseholdWebhookToken).not.toHaveBeenCalled();
  });

  it('rotate returns the raw token once and persists the same value for hashing', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(member('admin'));
    const res = await handler(req({ action: 'rotate' }));
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(dbSetHouseholdWebhookToken).toHaveBeenCalledWith('h1', token);
  });

  it('status never returns a token', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(member('superadmin'));
    vi.mocked(dbHouseholdHasWebhookToken).mockResolvedValue(true);
    const body = (await (await handler(req({ action: 'status' }))).json()) as any;
    expect(body).toEqual({ ok: true, hasToken: true });
  });

  it('400 on unknown action', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(member('admin'));
    expect((await handler(req({ action: 'nope' }))).status).toBe(400);
  });
});
