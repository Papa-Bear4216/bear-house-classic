import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./householdAuth', () => ({ getAccessToken: async () => 'test-token' }));

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

describe('Hermes memory outbox', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    vi.resetModules();
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps a failed write in the device outbox and flushes it before loading', async () => {
    let failPost = true;
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST' && failPost) return new Response('', { status: 503 });
      if (init?.method === 'POST') return new Response(JSON.stringify({ ok: true }), { status: 200 });
      return new Response(JSON.stringify({ notes: [{ text: 'Lucy has soccer Tuesday', status: 'active' }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const memory = await import('./hermesMemory');
    await expect(memory.addHermesMemory('Lucy has soccer Tuesday')).resolves.toBe(false);
    expect(JSON.parse(storage.getItem('hermes_memory_outbox') || '[]')).toHaveLength(1);

    failPost = false;
    await expect(memory.ensureHermesMemoryLoaded()).resolves.toEqual(['Lucy has soccer Tuesday']);
    expect(storage.getItem('hermes_memory_outbox')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
