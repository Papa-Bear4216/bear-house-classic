import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pullFromCloud, pushToCloud } from './sync';

// pullFromCloud goes through the Supabase JS client, not fetch — stub the
// client's query chain so pushToCloud has a currentHouseholdId to work with
// without a real network call.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  }),
}));

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

// environment: 'node' in vitest.config.ts means there's no DOM localStorage;
// sync.ts calls it directly, so stub a minimal in-memory version for tests
// that exercise the 409 path (which writes to localStorage on conflict).
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
});

describe('pushToCloud write serialization', () => {
  beforeEach(async () => {
    await pullFromCloud('household-1');
    vi.restoreAllMocks();
  });

  it('coalesces a second push into the latest value instead of racing it', async () => {
    const first = deferred<Response>();
    const calls: any[] = [];
    const fetchMock = vi.fn().mockImplementation((_url, opts) => {
      calls.push(JSON.parse(opts.body));
      if (calls.length === 1) return first.promise;
      return Promise.resolve(new Response(JSON.stringify({ ok: true, updatedAt: 'T2' }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const p1 = pushToCloud('shopping', ['a']);
    const p2 = pushToCloud('shopping', ['a', 'b']);

    // Only one request should be in flight at this point — the second edit
    // is queued, not sent as a competing concurrent write.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    first.resolve(new Response(JSON.stringify({ ok: true, updatedAt: 'T1' }), { status: 200 }));
    await p1;
    await p2;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(calls[0].value).toEqual(['a']);
    expect(calls[1].value).toEqual(['a', 'b']);
    // The second, queued push must carry the version the first push just
    // established (T1) — not the stale pre-push version both edits started
    // from. Otherwise the server sees it as a stale write and 409s it.
    expect(calls[1].expectedUpdatedAt).toBe('T1');
  });

  it('only sends the latest of several edits queued during one in-flight push', async () => {
    const first = deferred<Response>();
    const calls: any[] = [];
    const fetchMock = vi.fn().mockImplementation((_url, opts) => {
      calls.push(JSON.parse(opts.body));
      if (calls.length === 1) return first.promise;
      return Promise.resolve(new Response(JSON.stringify({ ok: true, updatedAt: 'T2' }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const p1 = pushToCloud('tasks', [1]);
    void pushToCloud('tasks', [1, 2]);
    const p3 = pushToCloud('tasks', [1, 2, 3]);

    first.resolve(new Response(JSON.stringify({ ok: true, updatedAt: 'T1' }), { status: 200 }));
    await p1;
    await p3;

    // Three calls queued, but only two network requests: the in-flight one
    // plus a single follow-up carrying the final value — the middle edit
    // was superseded, never sent on its own.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(calls[1].value).toEqual([1, 2, 3]);
  });

  it('on a 409 conflict, adopts the cloud value instead of keeping the local one', async () => {
    const cloudValue = ['from-other-device'];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Version conflict', current: cloudValue, currentUpdatedAt: 'T9' }), { status: 409 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const ok = await pushToCloud('bills', ['local-edit']);

    expect(ok).toBe(false);
    expect(JSON.parse(localStorage.getItem('bills')!)).toEqual(cloudValue);

    // The next push for this key must carry the version we just adopted,
    // not the stale one the losing push started from.
    const fetchMock2 = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, updatedAt: 'T10' }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock2);
    await pushToCloud('bills', ['retry']);
    expect(JSON.parse(fetchMock2.mock.calls[0][1].body).expectedUpdatedAt).toBe('T9');
  });
});
