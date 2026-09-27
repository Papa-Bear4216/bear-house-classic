import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  resolveHouseholdId: vi.fn(),
  dbGet: vi.fn(),
  dbSet: vi.fn(),
  dbGetHouseholdVoiceToken: vi.fn(),
  dbSetHouseholdVoiceToken: vi.fn(),
}));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler from './voice-triggers';
import { resolveHouseholdId } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';
import { dbGet, dbSet, dbGetHouseholdVoiceToken, dbSetHouseholdVoiceToken } from './_db.js';

function req(body: unknown, auth = 'Bearer valid-token') {
  return new Request('https://example.com/api/voice-triggers', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe('POST /api/voice-triggers', () => {
  it('rejects with 401 when no bearer token', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req({ action: 'list' }, ''));
    expect(res.status).toBe(401);
  });

  it('rejects with 429 when rate limited', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 5 });
    const res = await handler(req({ action: 'list' }));
    expect(res.status).toBe(429);
  });

  it('lists triggers', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(dbGet).mockResolvedValueOnce({ triggers: [{ trigger: 'kitchen lights', deviceId: 'light.kitchen', action: 'turn_on' }] });
    vi.mocked(dbGetHouseholdVoiceToken).mockResolvedValue({ voice_trigger_token: 'tok-123' });
    const res = await handler(req({ action: 'list' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.triggers.length).toBe(1);
  });

  it('adds a trigger', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(dbGet).mockResolvedValue(null);
    vi.mocked(dbSet).mockResolvedValue(undefined);
    const res = await handler(req({ action: 'add', trigger: 'kitchen lights', deviceId: 'light.kitchen', deviceAction: 'turn_on' } as any));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('rejects duplicate trigger with 409', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(dbGet).mockResolvedValue({ triggers: [{ trigger: 'kitchen lights', deviceId: 'light.kitchen', action: 'turn_on' }] });
    const res = await handler(req({ action: 'add', trigger: 'kitchen lights', deviceId: 'light.kitchen', deviceAction: 'turn_on' } as any));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('already exists');
  });

  it('removes a trigger', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(dbGet).mockResolvedValue({ triggers: [{ trigger: 'kitchen lights', deviceId: 'light.kitchen', action: 'turn_on' }] });
    vi.mocked(dbSet).mockResolvedValue(undefined);
    const res = await handler(req({ action: 'remove', trigger: 'kitchen lights' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('rotates token', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    dbSetHouseholdVoiceToken.mockResolvedValue(undefined);
    const res = await handler(req({ action: 'rotateToken' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.token).toBeTruthy();
    // Web Crypto: 32 bytes → 64 hex chars
    expect(body.token).toMatch(/^[0-9a-f]{64}$/);
    // verify the setter was actually invoked
    expect(dbSetHouseholdVoiceToken).toHaveBeenCalledWith('household-1', body.token);
  });

  it('rejects POST with 405', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    const res = await handler(new Request('https://example.com/api/voice-triggers', {
      method: 'GET',
      headers: { authorization: 'Bearer valid-token' },
    }) as any);
    expect(res.status).toBe(405);
  });
});
