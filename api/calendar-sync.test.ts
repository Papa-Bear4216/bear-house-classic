import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  dbGet: vi.fn(),
  dbSet: vi.fn(),
  resolveHouseholdIdByWebhookToken: vi.fn(),
}));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler from './calendar-sync';
import { dbGet, dbSet, resolveHouseholdIdByWebhookToken } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';

function req(body: unknown) {
  return new Request('https://example.com/api/calendar-sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-webhook-token': 'valid-token' },
    body: JSON.stringify(body),
  });
}

function googleEvent(id: string, summary: string) {
  return { id, summary, start: { dateTime: '2026-10-01T09:00:00Z' } };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  vi.mocked(resolveHouseholdIdByWebhookToken).mockResolvedValue('h1');
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe('POST /api/calendar-sync', () => {
  it('rejects with 401 when the webhook token is invalid', async () => {
    vi.mocked(resolveHouseholdIdByWebhookToken).mockResolvedValue(null);
    const res = await handler(req({ accessToken: 'x', person: 'Alice' }));
    expect(res.status).toBe(401);
  });

  it('does not wipe a different person\'s previously-synced Google Calendar events', async () => {
    // Regression guard: syncing Bob's calendar must not delete Alice's
    // already-imported events, even though both share source: google_calendar.
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [googleEvent('bob-evt', 'Bob dentist')] }),
    } as Response);
    vi.mocked(dbGet).mockResolvedValue([
      { id: 'gcal-alice-evt', person: 'Alice', source: 'google_calendar', calendarId: 'primary' },
    ]);

    const res = await handler(req({ accessToken: 'tok', person: 'Bob', calendarId: 'primary' }));
    expect(res.status).toBe(200);

    const written = vi.mocked(dbSet).mock.calls[0][2] as any[];
    expect(written.some(a => a.person === 'Alice')).toBe(true);
    expect(written.some(a => a.person === 'Bob')).toBe(true);
  });

  it('replaces only this person+calendar\'s own previously-synced events on re-sync', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [googleEvent('bob-evt-2', 'Bob checkup')] }),
    } as Response);
    vi.mocked(dbGet).mockResolvedValue([
      { id: 'gcal-bob-evt-1', person: 'Bob', source: 'google_calendar', calendarId: 'primary' },
    ]);

    const res = await handler(req({ accessToken: 'tok', person: 'Bob', calendarId: 'primary' }));
    expect(res.status).toBe(200);

    const written = vi.mocked(dbSet).mock.calls[0][2] as any[];
    expect(written.find(a => a.id === 'gcal-bob-evt-1')).toBeUndefined();
    expect(written.find(a => a.id === 'gcal-bob-evt-2')).toBeDefined();
  });

  it('preserves non-Google-Calendar appointments untouched', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) } as Response);
    vi.mocked(dbGet).mockResolvedValue([
      { id: 'manual-1', person: 'Alice', source: 'manual' },
    ]);

    await handler(req({ accessToken: 'tok', person: 'Bob', calendarId: 'primary' }));
    const written = vi.mocked(dbSet).mock.calls[0][2] as any[];
    expect(written.some(a => a.id === 'manual-1')).toBe(true);
  });
});
