import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  resolveHouseholdIdByVoiceTriggerToken: vi.fn(),
  dbGet: vi.fn(),
}));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));
vi.mock('./_deviceDispatcher.js', () => ({ dispatchDevice: vi.fn() }));

import handler from './voice-trigger';
import { resolveHouseholdIdByVoiceTriggerToken } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';
import { dispatchDevice } from './_deviceDispatcher.js';
import { dbGet } from './_db.js';

function req(body: unknown, token = 'valid-token') {
  return new Request('https://example.com/api/voice-trigger', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, token }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(dispatchDevice).mockResolvedValue({ ok: true });
  vi.mocked(dbGet).mockResolvedValue(null);
});

describe('POST /api/voice-trigger', () => {
  it('rejects with 401 when token resolves to no household', async () => {
    vi.mocked(resolveHouseholdIdByVoiceTriggerToken).mockResolvedValue(null);
    const res = await handler(req({ trigger: 'kitchen lights' }));
    expect(res.status).toBe(401);
  });

  it('rejects with 429 when rate limited', async () => {
    vi.mocked(resolveHouseholdIdByVoiceTriggerToken).mockResolvedValue('household-1');
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 10 });
    const res = await handler(req({ trigger: 'kitchen lights' }));
    expect(res.status).toBe(429);
  });

  it('rejects with 400 for invalid body', async () => {
    vi.mocked(resolveHouseholdIdByVoiceTriggerToken).mockResolvedValue('household-1');
    const res = await handler(req({ trigger: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when trigger not found', async () => {
    vi.mocked(resolveHouseholdIdByVoiceTriggerToken).mockResolvedValue('household-1');
    vi.mocked(dbGet).mockResolvedValue({ triggers: [] });
    const res = await handler(req({ trigger: 'kitchen lights' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('not found');
  });

  it('dispatches and returns 200 on success', async () => {
    vi.mocked(resolveHouseholdIdByVoiceTriggerToken).mockResolvedValue('household-1');
    vi.mocked(dbGet).mockResolvedValue({ triggers: [{ trigger: 'kitchen lights', deviceId: 'light.kitchen', action: 'turn_on', params: {} }] });
    const res = await handler(req({ trigger: 'kitchen lights' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.trigger).toBe('kitchen lights');
  });

  it('returns 500 when dispatch fails', async () => {
    vi.mocked(resolveHouseholdIdByVoiceTriggerToken).mockResolvedValue('household-1');
    vi.mocked(dbGet).mockResolvedValue({ triggers: [{ trigger: 'kitchen lights', deviceId: 'light.kitchen', action: 'turn_on', params: {} }] });
    vi.mocked(dispatchDevice).mockResolvedValue({ ok: false, error: 'HA 500' });
    const res = await handler(req({ trigger: 'kitchen lights' }));
    expect(res.status).toBe(500);
  });

  it('returns 200 on GET (health check)', async () => {
    vi.mocked(resolveHouseholdIdByVoiceTriggerToken).mockResolvedValue('household-1');
    const res = await handler(new Request('https://example.com/api/voice-trigger', {
      method: 'GET',
    }) as any);
    expect(res.status).toBe(200);
  });

  it('rejects POST with 405 for non-POST non-GET', async () => {
    vi.mocked(resolveHouseholdIdByVoiceTriggerToken).mockResolvedValue('household-1');
    const res = await handler(new Request('https://example.com/api/voice-trigger', {
      method: 'DELETE',
    }) as any);
    expect(res.status).toBe(405);
  });
});
