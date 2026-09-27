import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./ha-fix.js', () => ({ runFix: vi.fn() }));

import handler from './preempt-refresh';
import { runFix } from './ha-fix.js';

function req(auth = 'Bearer test-cron-secret', method = 'GET') {
  return new Request('https://example.com/api/preempt-refresh', {
    method,
    headers: { authorization: auth },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CRON_SECRET = 'test-cron-secret';
  process.env.HOME_ASSISTANT_HOUSEHOLD_ID = 'household-1';
});

describe('GET /api/preempt-refresh', () => {
  it('rejects with 401 when there is no bearer token', async () => {
    const res = await handler(req(''));
    expect(res.status).toBe(401);
    expect(vi.mocked(runFix)).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the token does not match CRON_SECRET', async () => {
    const res = await handler(req('Bearer wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('rejects with 401 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = await handler(req('Bearer test-cron-secret'));
    expect(res.status).toBe(401);
  });

  it('rejects with 405 for a non-GET method', async () => {
    const res = await handler(req('Bearer test-cron-secret', 'POST'));
    expect(res.status).toBe(405);
  });

  it('rejects with 500 when HOME_ASSISTANT_HOUSEHOLD_ID is not configured', async () => {
    delete process.env.HOME_ASSISTANT_HOUSEHOLD_ID;
    const res = await handler(req());
    expect(res.status).toBe(500);
  });

  it('refreshes each preempt target and returns the successfully-refreshed list', async () => {
    vi.mocked(runFix).mockResolvedValue({ ok: true } as any);
    const res = await handler(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.refreshed).toEqual(['wyze_bridge']);
    expect(runFix).toHaveBeenCalledWith('household-1', 'wyze_bridge');
  });

  it('excludes a target from refreshed when runFix reports failure', async () => {
    vi.mocked(runFix).mockResolvedValue({ ok: false } as any);
    const res = await handler(req());
    const body = await res.json();
    expect(body.refreshed).toEqual([]);
  });
});
