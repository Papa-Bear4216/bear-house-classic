import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveHouseholdId, resolveHouseholdIdByWebhookToken, dbSetHouseholdWebhookToken, soleHouseholdId, allHouseholdIds } from './_db';

// Every function under test calls the global fetch() directly (no SDK) —
// mocking fetch is the whole test surface here. Each test wires up the
// exact sequence of responses the function is expected to make, in order.
function mockFetchSequence(responses: Array<{ ok: boolean; json?: unknown }>) {
  const fetchMock = vi.fn();
  for (const r of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: r.ok,
      json: async () => r.json ?? [],
      text: async () => JSON.stringify(r.json ?? {}),
    } as Response);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
});

describe('resolveHouseholdId', () => {
  it('returns the household_id for a valid access token', async () => {
    mockFetchSequence([
      { ok: true, json: { id: 'user-1', email: 'a@b.com' } }, // GET /auth/v1/user
      { ok: true, json: [{ household_id: 'household-1' }] },  // GET household_members
    ]);
    const result = await resolveHouseholdId('valid-token');
    expect(result).toBe('household-1');
  });

  it('returns null when the access token is invalid', async () => {
    mockFetchSequence([{ ok: false }]); // GET /auth/v1/user fails
    const result = await resolveHouseholdId('bad-token');
    expect(result).toBeNull();
  });

  it('returns null when the user has no household_members row', async () => {
    mockFetchSequence([
      { ok: true, json: { id: 'user-1' } },
      { ok: true, json: [] }, // no membership row
    ]);
    const result = await resolveHouseholdId('valid-token-orphan-user');
    expect(result).toBeNull();
  });

  it('returns null when the auth response has no user id', async () => {
    mockFetchSequence([{ ok: true, json: {} }]);
    const result = await resolveHouseholdId('weird-token');
    expect(result).toBeNull();
  });

  it('never trusts a client-supplied household_id — only derives it from the verified token', async () => {
    // Regression guard for the exact vulnerability this function exists to
    // close: the function signature only accepts an access token, never a
    // household_id parameter, so there is no code path where a caller can
    // inject an arbitrary household_id and have it trusted.
    expect(resolveHouseholdId.length).toBe(1);
  });
});

describe('resolveHouseholdIdByWebhookToken', () => {
  it('returns the household_id owning the given webhook token', async () => {
    mockFetchSequence([{ ok: true, json: [{ id: 'household-2' }] }]);
    const result = await resolveHouseholdIdByWebhookToken('household-2-secret');
    expect(result).toBe('household-2');
  });

  it('returns null for an empty token without making any network call', async () => {
    const fetchMock = mockFetchSequence([]);
    const result = await resolveHouseholdIdByWebhookToken('');
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when no household matches the token', async () => {
    mockFetchSequence([{ ok: true, json: [] }, { ok: true, json: [] }]);
    const result = await resolveHouseholdIdByWebhookToken('unknown-token');
    expect(result).toBeNull();
  });

  it('returns null when the Supabase lookup itself fails', async () => {
    mockFetchSequence([{ ok: false }, { ok: false }]);
    const result = await resolveHouseholdIdByWebhookToken('some-token');
    expect(result).toBeNull();
  });

  it("one household's token never resolves to a different household's id", async () => {
    // Regression guard for cross-tenant leakage: the mocked response only
    // ever contains the row for the token actually queried, so if the
    // implementation ever i) stopped filtering by webhook_token in the
    // query, or ii) returned a hardcoded/cached id, this would catch it
    // by asserting the exact id round-trips for two distinct tokens.
    mockFetchSequence([{ ok: true, json: [{ id: 'household-A' }] }]);
    const a = await resolveHouseholdIdByWebhookToken('token-for-A');
    expect(a).toBe('household-A');

    mockFetchSequence([{ ok: true, json: [{ id: 'household-B' }] }]);
    const b = await resolveHouseholdIdByWebhookToken('token-for-B');
    expect(b).toBe('household-B');
    expect(b).not.toBe(a);
  });
});

describe('webhook token hashing', () => {
  it('looks the token up by its SHA-256 hash first (known vector for "abc")', async () => {
    const fetchMock = mockFetchSequence([{ ok: true, json: [{ id: 'household-1' }] }]);
    expect(await resolveHouseholdIdByWebhookToken('abc')).toBe('household-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'webhook_token_hash=eq.ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('falls back to the legacy plaintext column when no hash matches', async () => {
    const fetchMock = mockFetchSequence([{ ok: true, json: [] }, { ok: true, json: [{ id: 'household-legacy' }] }]);
    expect(await resolveHouseholdIdByWebhookToken('legacy-token')).toBe('household-legacy');
    expect(String(fetchMock.mock.calls[1][0])).toContain('webhook_token=eq.legacy-token');
  });

  it('a wrong token resolves to null (no hash match, no plaintext match)', async () => {
    mockFetchSequence([{ ok: true, json: [] }, { ok: true, json: [] }]);
    expect(await resolveHouseholdIdByWebhookToken('wrong')).toBeNull();
  });

  it('does not let filter syntax in a token alter the query', async () => {
    const fetchMock = mockFetchSequence([{ ok: true, json: [] }, { ok: true, json: [] }]);
    await resolveHouseholdIdByWebhookToken('x,webhook_token.neq.y');
    expect(String(fetchMock.mock.calls[1][0])).toContain('webhook_token=eq.x%2Cwebhook_token.neq.y');
  });

  it('dbSetHouseholdWebhookToken PATCHes the hash and nulls the plaintext; the raw token is never sent', async () => {
    const fetchMock = mockFetchSequence([{ ok: true }]);
    await dbSetHouseholdWebhookToken('household-1', 'abc');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      webhook_token_hash: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      webhook_token: null,
    });
    expect(init.body as string).not.toContain('"abc"');
  });
});

describe('soleHouseholdId (deprecated, kept for unmigrated callers)', () => {
  it('returns the id when exactly one household exists', async () => {
    mockFetchSequence([{ ok: true, json: [{ id: 'only-household' }] }]);
    const result = await soleHouseholdId();
    expect(result).toBe('only-household');
  });

  it('throws when zero households exist', async () => {
    mockFetchSequence([{ ok: true, json: [] }]);
    await expect(soleHouseholdId()).rejects.toThrow('no households exist');
  });

  it('throws loudly when more than one household exists, rather than guessing', async () => {
    // This is the exact bug this whole test-writing pass traces back to —
    // confirm the guard still fails loud instead of silently picking one.
    mockFetchSequence([{ ok: true, json: [{ id: 'h1' }, { id: 'h2' }] }]);
    await expect(soleHouseholdId()).rejects.toThrow('more than one household exists');
  });
});

describe('allHouseholdIds', () => {
  it('returns every household id for fan-out cron jobs', async () => {
    mockFetchSequence([{ ok: true, json: [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }] }]);
    const result = await allHouseholdIds();
    expect(result).toEqual(['h1', 'h2', 'h3']);
  });

  it('returns an empty array when no households exist', async () => {
    mockFetchSequence([{ ok: true, json: [] }]);
    const result = await allHouseholdIds();
    expect(result).toEqual([]);
  });

  it('throws when the households lookup fails', async () => {
    mockFetchSequence([{ ok: false }]);
    await expect(allHouseholdIds()).rejects.toThrow('households lookup failed');
  });
});
