import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  validateTriadScopeAccess,
  getScopedChatStorageKey,
  purgeChatSession,
  hydrateScopedChat,
  persistScopedChat,
  executeTriadJsonPipeline,
  type TriadScope,
  type TriadChatMessage,
} from './triadFusion';

// In-memory mock storage for vitest node environment
class MockLocalStorage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  getItem(key: string) { return this.store.get(key) ?? null; }
  setItem(key: string, value: string) { this.store.set(key, value); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
  key(index: number) { return Array.from(this.store.keys())[index] ?? null; }
}

const mockStorage = new MockLocalStorage();
(globalThis as any).localStorage = mockStorage;

describe('Triad Fusion System: Scope Boundaries', () => {
  const superadminScope: TriadScope = {
    householdId: 'house-alpha',
    memberId: 'user-admin',
    memberName: 'Super Dad',
    role: 'superadmin',
    subscriptionStatus: 'active',
    bypassBilling: false,
    timestamp: Date.now(),
  };

  const adultScope: TriadScope = {
    ...superadminScope,
    memberId: 'user-adult',
    memberName: 'Mom',
    role: 'adult',
  };

  const childScope: TriadScope = {
    ...superadminScope,
    memberId: 'user-child',
    memberName: 'Kiddo',
    role: 'child',
  };

  it('allows superadmin full access to all modules including finance', () => {
    expect(validateTriadScopeAccess(superadminScope, 'finance').allowed).toBe(true);
    expect(validateTriadScopeAccess(superadminScope, 'household').allowed).toBe(true);
    expect(validateTriadScopeAccess(superadminScope, 'hermes-chat').allowed).toBe(true);
  });

  it('blocks non-admin adult from finance', () => {
    const res = validateTriadScopeAccess(adultScope, 'finance');
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('requires Admin or Superadmin');
  });

  it('strictly blocks child from finance, health, maintenance, system-health, and custody', () => {
    expect(validateTriadScopeAccess(childScope, 'finance').allowed).toBe(false);
    expect(validateTriadScopeAccess(childScope, 'health').allowed).toBe(false);
    expect(validateTriadScopeAccess(childScope, 'maintenance').allowed).toBe(false);
    expect(validateTriadScopeAccess(childScope, 'system-health').allowed).toBe(false);
    expect(validateTriadScopeAccess(childScope, 'custody').allowed).toBe(false);
  });

  it('allows child access to household, kids, rewards, and legal modules', () => {
    expect(validateTriadScopeAccess(childScope, 'household').allowed).toBe(true);
    expect(validateTriadScopeAccess(childScope, 'kids').allowed).toBe(true);
    expect(validateTriadScopeAccess(childScope, 'rewards').allowed).toBe(true);
    expect(validateTriadScopeAccess(childScope, 'legal-privacy').allowed).toBe(true);
    expect(validateTriadScopeAccess(childScope, 'legal-terms').allowed).toBe(true);
  });

  it('allows unauthenticated scope to access only legal privacy and terms', () => {
    expect(validateTriadScopeAccess(null, 'legal-privacy').allowed).toBe(true);
    expect(validateTriadScopeAccess(null, 'legal-terms').allowed).toBe(true);
    expect(validateTriadScopeAccess(null, 'household').allowed).toBe(false);
  });
});

describe('Triad Fusion System: Clear-Chat & Data Segregation Protocols', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  const scopeHouse1: TriadScope = {
    householdId: 'house-101',
    memberId: 'user-A',
    memberName: 'Alice',
    role: 'adult',
    subscriptionStatus: 'active',
    bypassBilling: false,
    timestamp: Date.now(),
  };

  const scopeHouse2: TriadScope = {
    householdId: 'house-202',
    memberId: 'user-B',
    memberName: 'Bob',
    role: 'adult',
    subscriptionStatus: 'active',
    bypassBilling: false,
    timestamp: Date.now(),
  };

  it('generates distinct partitioned storage keys per household and member', () => {
    const key1 = getScopedChatStorageKey('house-101', 'user-A');
    const key2 = getScopedChatStorageKey('house-202', 'user-B');
    expect(key1).not.toBe(key2);
    expect(key1).toContain('house_101');
  });

  it('persists and hydrates messages strictly for the matching scope', () => {
    const msgs: TriadChatMessage[] = [
      { role: 'user', text: 'Hello Hermes in House 1', ts: Date.now() },
      { role: 'assistant', text: 'Welcome Alice', ts: Date.now() + 10 },
    ];

    persistScopedChat(scopeHouse1, msgs);

    const hydrated1 = hydrateScopedChat(scopeHouse1);
    expect(hydrated1).toHaveLength(2);
    expect(hydrated1[0].text).toBe('Hello Hermes in House 1');

    // Attempting to hydrate using House 2's scope must yield empty array (zero cross-home leak)
    const hydrated2 = hydrateScopedChat(scopeHouse2);
    expect(hydrated2).toHaveLength(0);
  });

  it('purges chat session on explicit clear-chat protocol invocation', () => {
    const msgs: TriadChatMessage[] = [
      { role: 'user', text: 'Confidential message', ts: Date.now() },
    ];
    persistScopedChat(scopeHouse1, msgs);
    expect(hydrateScopedChat(scopeHouse1)).toHaveLength(1);

    purgeChatSession('house-101', 'user-A');
    expect(hydrateScopedChat(scopeHouse1)).toHaveLength(0);
  });
});

describe('Triad Fusion System: JSON Pipeline Wrapper', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('strips markdown code blocks and returns parsed JSON', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: '```json\n{"reply":"Clean JSON output","status":"ready"}\n```',
      }),
    });
    vi.stubGlobal('fetch', fakeFetch);

    const result = await executeTriadJsonPipeline<{ reply: string; status: string }>(
      'https://example.com/api/chat',
      { prompt: 'test' }
    );

    expect(result.ok).toBe(true);
    expect(result.data?.reply).toBe('Clean JSON output');
    expect(result.data?.status).toBe('ready');
  });

  it('gracefully handles plain text when AI does not respond with JSON', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: 'Hello from plain text response!',
      }),
    });
    vi.stubGlobal('fetch', fakeFetch);

    const result = await executeTriadJsonPipeline('https://example.com/api/chat', { prompt: 'test' });
    expect(result.ok).toBe(true);
    expect(result.rawText).toBe('Hello from plain text response!');
  });

  it('supports abort signal cancellation', async () => {
    const fakeFetch = vi.fn().mockImplementation((_url, opts) => {
      return new Promise((_, reject) => {
        if (opts?.signal?.aborted) {
          const err = new DOMException('The user aborted a request.', 'AbortError');
          reject(err);
        } else {
          opts?.signal?.addEventListener('abort', () => {
            const err = new DOMException('The user aborted a request.', 'AbortError');
            reject(err);
          });
        }
      });
    });
    vi.stubGlobal('fetch', fakeFetch);

    const controller = new AbortController();
    controller.abort();

    const result = await executeTriadJsonPipeline(
      'https://example.com/api/chat',
      { prompt: 'test' },
      { signal: controller.signal }
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain('aborted');
  });
});
