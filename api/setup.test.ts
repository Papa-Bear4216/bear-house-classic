import { describe, it, expect, beforeEach, vi } from 'vitest';
import handler from './setup';

function req(body: unknown, auth = 'Bearer valid-token') {
  return new Request('https://example.com/api/setup', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// setup.ts talks to Supabase via raw fetch calls (no _db.ts boundary — it
// runs before a household_members row is guaranteed to exist). Each test
// queues up the exact sequence of fetch responses the handler will make.
function jsonRes(body: unknown, ok = true) {
  return { ok, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

describe('POST /api/setup — setDevicePermission', () => {
  it('rejects with 401 when there is no bearer token', async () => {
    const res = await handler(req({ action: 'setDevicePermission', memberId: '11111111-1111-1111-1111-111111111111', canControlDevices: true }, ''));
    expect(res.status).toBe(401);
  });

  it('allows an admin to grant device-control access to a child', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonRes({ id: 'auth-1', email: 'parent@example.com' })) // getAuthUserId
      .mockResolvedValueOnce(jsonRes([{ id: 'admin-member-id', household_id: 'h1', role: 'admin' }])) // caller lookup
      .mockResolvedValueOnce(jsonRes([{ id: '11111111-1111-1111-1111-111111111111', role: 'child' }])) // target lookup
      .mockResolvedValueOnce(jsonRes({}, true)); // PATCH

    const res = await handler(req({ action: 'setDevicePermission', memberId: '11111111-1111-1111-1111-111111111111', canControlDevices: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const patchCall = fetchMock.mock.calls[3];
    expect(patchCall[1]?.method).toBe('PATCH');
    expect(JSON.parse(patchCall[1]!.body as string)).toEqual({ can_control_devices: true });
  });

  it('rejects with 403 when a child tries to grant device-control access', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonRes({ id: 'auth-1', email: 'kid@example.com' }))
      .mockResolvedValueOnce(jsonRes([{ id: 'kid-member-id', household_id: 'h1', role: 'child' }]));

    const res = await handler(req({ action: 'setDevicePermission', memberId: '22222222-2222-2222-2222-222222222222', canControlDevices: true }));
    expect(res.status).toBe(403);
  });

  it('rejects with 404 when the target member is not in the caller\'s household', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonRes({ id: 'auth-1', email: 'parent@example.com' }))
      .mockResolvedValueOnce(jsonRes([{ id: 'admin-member-id', household_id: 'h1', role: 'admin' }]))
      .mockResolvedValueOnce(jsonRes([])); // target lookup — empty, not found

    const res = await handler(req({ action: 'setDevicePermission', memberId: '33333333-3333-3333-3333-333333333333', canControlDevices: true }));
    expect(res.status).toBe(404);
  });

  it('rejects with 400 when targeting an admin/superadmin member — the toggle is meaningless for them', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonRes({ id: 'auth-1', email: 'parent@example.com' }))
      .mockResolvedValueOnce(jsonRes([{ id: 'admin-member-id', household_id: 'h1', role: 'admin' }]))
      .mockResolvedValueOnce(jsonRes([{ id: '44444444-4444-4444-4444-444444444444', role: 'admin' }]));

    const res = await handler(req({ action: 'setDevicePermission', memberId: '44444444-4444-4444-4444-444444444444', canControlDevices: true }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/setup — pre-household rate limit', () => {
  it('stops household creation when the atomic per-user limit is exhausted', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonRes({ id: 'auth-1', email: 'parent@example.com' }))
      .mockResolvedValueOnce(jsonRes(false));

    const res = await handler(req({ action: 'createHousehold', householdName: 'Home', memberName: 'Parent' }));
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/rpc/consume_setup_rate_limit');
  });

  it('fails closed if the rate-limit service is unavailable', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonRes({ id: 'auth-1', email: 'parent@example.com' }));
    fetchMock.mockRejectedValueOnce(new Error('network unavailable'));

    const res = await handler(req({ action: 'createHousehold', householdName: 'Home', memberName: 'Parent' }));
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/setup — updateRole clears a stale device-control grant', () => {
  it('clears can_control_devices whenever a role change is applied', async () => {
    // Regression guard: a child granted device access, promoted to admin,
    // then demoted back to child should not silently keep the earlier grant.
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonRes({ id: 'auth-1', email: 'super@example.com' }))
      .mockResolvedValueOnce(jsonRes([{ id: 'super-member-id', household_id: 'h1', role: 'superadmin' }]))
      .mockResolvedValueOnce(jsonRes([{ id: '11111111-1111-1111-1111-111111111111' }])) // target-in-household check
      .mockResolvedValueOnce(jsonRes({}, true)); // PATCH

    const res = await handler(req({ action: 'updateRole', memberId: '11111111-1111-1111-1111-111111111111', role: 'child' }));
    expect(res.status).toBe(200);

    const patchCall = fetchMock.mock.calls[3];
    expect(JSON.parse(patchCall[1]!.body as string)).toEqual({ role: 'child', can_control_devices: false });
  });
});
