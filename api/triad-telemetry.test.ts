import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({ resolveHouseholdId: vi.fn() }));

import handler from './triad-telemetry';
import { resolveHouseholdId } from './_db.js';

function req(method = 'GET', auth = 'Bearer valid-token', host = 'example.com') {
  return new Request('https://example.com/api/triad-telemetry', {
    method,
    headers: {
      authorization: auth,
      host,
    },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

describe('GET /api/triad-telemetry', () => {
  it('handles CORS OPTIONS preflight with 204', async () => {
    const res = await handler(new Request('https://example.com/api/triad-telemetry', { method: 'OPTIONS' }));
    expect(res.status).toBe(204);
  });

  it('rejects with 401 when no auth provided and caller is remote', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req('GET', '', 'remote-client.com'));
    expect(res.status).toBe(401);
  });

  it('allows access for local caller (localhost)', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    vi.mocked(fetch).mockRejectedValue(new Error('connection refused'));

    const res = await handler(req('GET', '', 'localhost:3000'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('standby');
    expect(body.available).toBe(false);
  });

  it('returns standby when Triad daemon is offline / unreachable', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(fetch).mockRejectedValue(new Error('fetch failed'));

    const res = await handler(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.status).toBe('standby');
    expect(body.port).toBe(8789);
  });

  it('returns online state and telemetry when Triad daemon responds', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');

    vi.mocked(fetch).mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/health')) {
        return {
          ok: true,
          json: async () => ({
            status: 'ok',
            advisors: [{ name: 'claude', enabled: true }, { name: 'codex', enabled: true }],
            subsystems: { pieces_os: true, hermes_relay: true },
          }),
        } as any;
      }
      if (urlStr.endsWith('/telemetry')) {
        return {
          ok: true,
          json: async () => ({
            total_sessions: 42,
            avg_elapsed_seconds: 3.14,
            sessions: [],
          }),
        } as any;
      }
      return { ok: false } as any;
    });

    const res = await handler(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.status).toBe('online');
    expect(body.health.advisors).toHaveLength(2);
    expect(body.telemetry.total_sessions).toBe(42);
  });
});
