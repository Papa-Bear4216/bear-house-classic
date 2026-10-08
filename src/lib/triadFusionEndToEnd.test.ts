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
  type BentoModuleId,
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

describe('Triad Fusion End-to-End Verification: Complete Module Matrix', () => {
  const superadminScope: TriadScope = {
    householdId: 'tenant_house_100',
    memberId: 'usr_superadmin',
    memberName: 'Chief Admin',
    role: 'superadmin',
    subscriptionStatus: 'active',
    bypassBilling: false,
    timestamp: Date.now(),
  };

  const adminScope: TriadScope = {
    ...superadminScope,
    memberId: 'usr_admin',
    memberName: 'Co-Admin Dad',
    role: 'admin',
  };

  const adultScope: TriadScope = {
    ...superadminScope,
    memberId: 'usr_adult',
    memberName: 'Adult Step-Parent',
    role: 'adult',
  };

  const childScope: TriadScope = {
    ...superadminScope,
    memberId: 'usr_child',
    memberName: 'Kiddo Sam',
    role: 'child',
  };

  const ALL_12_CORE_BENTO_MODULES: BentoModuleId[] = [
    'household',
    'meal-planner',
    'pantry-shopping',
    'maintenance',
    'emotions',
    'kids',
    'rewards',
    'promises',
    'custody',
    'quality',
    'hermes-chat',
    'finance',
  ];

  it('verifies Superadmin has access to all 12 core Bento modules', () => {
    for (const mod of ALL_12_CORE_BENTO_MODULES) {
      const res = validateTriadScopeAccess(superadminScope, mod);
      expect(res.allowed, `Superadmin should access module: ${mod}`).toBe(true);
    }
  });

  it('verifies Admin has access to all 12 core Bento modules', () => {
    for (const mod of ALL_12_CORE_BENTO_MODULES) {
      const res = validateTriadScopeAccess(adminScope, mod);
      expect(res.allowed, `Admin should access module: ${mod}`).toBe(true);
    }
  });

  it('verifies non-admin Adult has access to 11 modules and is strictly blocked from Finance', () => {
    for (const mod of ALL_12_CORE_BENTO_MODULES) {
      const res = validateTriadScopeAccess(adultScope, mod);
      if (mod === 'finance') {
        expect(res.allowed).toBe(false);
        expect(res.reason).toContain('requires Admin or Superadmin');
      } else {
        expect(res.allowed, `Adult should access module: ${mod}`).toBe(true);
      }
    }
  });

  it('verifies Child role is quarantined from finance, health, maintenance, custody, system-health, quality, promises, and emotions', () => {
    const quarantinedModules: BentoModuleId[] = [
      'finance',
      'health',
      'maintenance',
      'system-health',
      'custody',
      'quality',
      'promises',
      'emotions',
    ];

    for (const mod of quarantinedModules) {
      const res = validateTriadScopeAccess(childScope, mod);
      expect(res.allowed, `Child MUST NOT access module: ${mod}`).toBe(false);
    }

    // Verify child can access permitted modules
    const permittedModules: BentoModuleId[] = [
      'household',
      'kids',
      'rewards',
      'meal-planner',
      'pantry-shopping',
      'hermes-chat',
      'legal-privacy',
      'legal-terms',
    ];

    for (const mod of permittedModules) {
      const res = validateTriadScopeAccess(childScope, mod);
      expect(res.allowed, `Child should be able to access: ${mod}`).toBe(true);
    }
  });

  it('verifies Unauthenticated (null scope) is strictly blocked from all private modules', () => {
    for (const mod of ALL_12_CORE_BENTO_MODULES) {
      const res = validateTriadScopeAccess(null, mod);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('No active Triad scope established');
    }

    // Only public legal policies may be viewed without a scope
    expect(validateTriadScopeAccess(null, 'legal-privacy').allowed).toBe(true);
    expect(validateTriadScopeAccess(null, 'legal-terms').allowed).toBe(true);
  });
});

describe('Triad Fusion End-to-End: Multi-Tenant Data Quarantine & Leak Prevention', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  const householdAlpha: TriadScope = {
    householdId: 'house_alpha_123',
    memberId: 'parent_1',
    memberName: 'Parent 1',
    role: 'admin',
    subscriptionStatus: 'active',
    bypassBilling: false,
    timestamp: Date.now(),
  };

  const householdBeta: TriadScope = {
    householdId: 'house_beta_456',
    memberId: 'parent_2',
    memberName: 'Parent 2',
    role: 'admin',
    subscriptionStatus: 'active',
    bypassBilling: false,
    timestamp: Date.now(),
  };

  it('guarantees zero-leak isolation between co-parenting or separate tenant households', () => {
    const alphaMessages: TriadChatMessage[] = [
      { role: 'user', text: 'Household Alpha Secret: Dad picked up meds at 4pm', ts: Date.now() },
      { role: 'assistant', text: 'Logged into Alpha records.', ts: Date.now() + 10 },
    ];

    const betaMessages: TriadChatMessage[] = [
      { role: 'user', text: 'Household Beta Note: Mom bought winter coats', ts: Date.now() },
      { role: 'assistant', text: 'Logged into Beta records.', ts: Date.now() + 10 },
    ];

    // Persist Alpha
    persistScopedChat(householdAlpha, alphaMessages);

    // Persist Beta
    persistScopedChat(householdBeta, betaMessages);

    // Alpha hydrates only Alpha
    const hydratedAlpha = hydrateScopedChat(householdAlpha);
    expect(hydratedAlpha).toHaveLength(2);
    expect(hydratedAlpha[0].text).toContain('Household Alpha Secret');
    expect(hydratedAlpha[0].text).not.toContain('Household Beta');

    // Beta hydrates only Beta
    const hydratedBeta = hydrateScopedChat(householdBeta);
    expect(hydratedBeta).toHaveLength(2);
    expect(hydratedBeta[0].text).toContain('Household Beta Note');
    expect(hydratedBeta[0].text).not.toContain('Household Alpha');
  });

  it('immediately purges quarantined cache if storage key contains mismatched tenant payload', () => {
    const key = getScopedChatStorageKey('house_alpha_123', 'parent_1');

    // Simulate tampered storage payload with spoofed tenant data
    mockStorage.setItem(
      key,
      JSON.stringify({
        householdId: 'MALICIOUS_TENANT_HIJACK',
        memberId: 'parent_1',
        messages: [{ role: 'user', text: 'Injected spoofed message', ts: Date.now() }],
        lastUpdated: Date.now(),
      })
    );

    // Hydrating must detect the cross-tenant mismatch, quarantine and purge the data
    const result = hydrateScopedChat(householdAlpha);
    expect(result).toHaveLength(0);

    // Storage key should be cleared
    expect(mockStorage.getItem(key)).toBeNull();
  });

  it('purges specific household/member session without affecting other household scopes', () => {
    persistScopedChat(householdAlpha, [{ role: 'user', text: 'Keep Alpha', ts: 1 }]);
    persistScopedChat(householdBeta, [{ role: 'user', text: 'Keep Beta', ts: 2 }]);

    expect(hydrateScopedChat(householdAlpha)).toHaveLength(1);
    expect(hydrateScopedChat(householdBeta)).toHaveLength(1);

    // Purge only householdAlpha
    purgeChatSession(householdAlpha.householdId, householdAlpha.memberId);

    expect(hydrateScopedChat(householdAlpha)).toHaveLength(0);
    expect(hydrateScopedChat(householdBeta)).toHaveLength(1);
  });

  it('purges all Triad chat sessions globally when called with null parameters', () => {
    persistScopedChat(householdAlpha, [{ role: 'user', text: 'Alpha 1', ts: 1 }]);
    persistScopedChat(householdBeta, [{ role: 'user', text: 'Beta 1', ts: 2 }]);

    // Unrelated storage keys must be preserved
    mockStorage.setItem('unrelated_family_setting', 'keep_me');

    purgeChatSession(null, null);

    expect(hydrateScopedChat(householdAlpha)).toHaveLength(0);
    expect(hydrateScopedChat(householdBeta)).toHaveLength(0);
    expect(mockStorage.getItem('unrelated_family_setting')).toBe('keep_me');
  });
});

describe('Triad Fusion End-to-End: JSON Pipeline Execution & Fault Handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('executes pipeline and strips triple-backtick markdown envelopes cleanly', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: '```json\n{"action":"SCHEDULE_EVENT","details":{"time":"19:30","parent":"dad"}}\n```',
      }),
    });
    vi.stubGlobal('fetch', fakeFetch);

    const result = await executeTriadJsonPipeline<{ action: string; details: { time: string; parent: string } }>(
      '/api/hermes/triad-execute',
      { command: 'sync split routine' }
    );

    expect(result.ok).toBe(true);
    expect(result.data?.action).toBe('SCHEDULE_EVENT');
    expect(result.data?.details.parent).toBe('dad');
  });

  it('handles server HTTP 500 error gracefully without unhandled promise rejections', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error in Triad Node',
    });
    vi.stubGlobal('fetch', fakeFetch);

    const result = await executeTriadJsonPipeline('/api/hermes/triad-execute', {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('HTTP 500');
  });

  it('aborts request gracefully when AbortSignal fires', async () => {
    const controller = new AbortController();
    controller.abort();

    const fakeFetch = vi.fn().mockImplementation((_url, opts) => {
      if (opts.signal.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fakeFetch);

    const result = await executeTriadJsonPipeline('/api/hermes/triad-execute', {}, {
      signal: controller.signal,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Request aborted or timed out');
  });
});
