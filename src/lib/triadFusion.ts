/**
 * Triad Fusion System: Frontend Structural Scope & Data Segregation Protocols
 *
 * Enforces role boundaries, tenant isolation, and clear-chat protocols
 * across inline expanding bento grid modules.
 */

import type { UserRole } from './familyos';
import { isModuleVisibleTo, type TopModule } from './navVisibility';

export type BentoModuleId =
  | TopModule
  | 'custody'
  | 'hermes-chat'
  | 'run-of-show'
  | 'pantry-shopping'
  | 'meal-planner'
  | 'maintenance'
  | 'legal-privacy'
  | 'legal-terms'
  | 'brain-battery'
  | 'system-health';

export interface TriadScope {
  householdId: string | null;
  memberId: string | null;
  memberName: string;
  role: UserRole | null;
  subscriptionStatus: string | null;
  bypassBilling: boolean;
  timestamp: number;
}

export interface TriadChatMessage {
  role: 'user' | 'assistant';
  text: string;
  ts: number;
  actions?: Array<{
    type: string;
    params: Record<string, unknown>;
    result?: string;
    ok?: boolean;
  }>;
}

export interface TriadChatSessionState {
  householdId: string;
  memberId: string;
  messages: TriadChatMessage[];
  lastUpdated: number;
}

/**
 * Validates whether a Triad scope is authorized to view and expand a given bento module.
 * Strictly blocks child roles from finance, health, and administrative functions.
 */
export function validateTriadScopeAccess(
  scope: TriadScope | null,
  moduleId: BentoModuleId
): { allowed: boolean; reason?: string } {
  if (!scope) {
    // Unauthenticated or unhydrated scope can only view public legal modules
    if (moduleId === 'legal-privacy' || moduleId === 'legal-terms') {
      return { allowed: true };
    }
    return { allowed: false, reason: 'No active Triad scope established' };
  }

  const role = scope.role || 'adult';

  // Role boundaries
  if (role === 'child') {
    const childRestricted: BentoModuleId[] = [
      'finance',
      'health',
      'maintenance',
      'system-health',
      'custody',
    ];
    if (childRestricted.includes(moduleId)) {
      return {
        allowed: false,
        reason: 'Restricted module: not accessible under Child role boundary',
      };
    }
  }

  // Admin-only modules
  if (role !== 'superadmin' && role !== 'admin') {
    if (moduleId === 'finance') {
      return {
        allowed: false,
        reason: 'Restricted module: requires Admin or Superadmin role boundary',
      };
    }
  }

  // Cross-check with core navVisibility rules for TopModules
  const topModuleMap: Partial<Record<BentoModuleId, TopModule>> = {
    household: 'household',
    kids: 'kids',
    family: 'family',
    health: 'health',
    finance: 'finance',
    rewards: 'rewards',
    quality: 'quality',
    promises: 'promises',
    emotions: 'emotions',
  };

  const topId = topModuleMap[moduleId];
  if (topId && !isModuleVisibleTo(role, topId)) {
    return {
      allowed: false,
      reason: `Module '${moduleId}' blocked by Triad role visibility rules`,
    };
  }

  return { allowed: true };
}

/**
 * Triad Clear-Chat Protocol & Tenant-Isolated Storage
 */
const STORAGE_PREFIX = 'triad_fusion_chat';

export function getScopedChatStorageKey(householdId: string, memberId: string): string {
  const safeH = householdId.replace(/[^a-zA-Z0-9]/g, '_');
  const safeM = memberId.replace(/[^a-zA-Z0-9]/g, '_');
  return `${STORAGE_PREFIX}_${safeH}_${safeM}`;
}

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) return (globalThis as any).localStorage;
  return null;
}

/**
 * Purges chat session from memory and localStorage to prevent cross-home or cross-member leaks.
 */
export function purgeChatSession(householdId?: string | null, memberId?: string | null): void {
  const storage = getStorage();
  if (!storage) return;

  if (householdId && memberId) {
    const key = getScopedChatStorageKey(householdId, memberId);
    try {
      storage.removeItem(key);
    } catch {
      // storage unavailable
    }
  } else {
    // Purge all Triad chat keys if no specific scope provided
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) {
        storage.removeItem(k);
      }
    } catch {
      // storage unavailable
    }
  }
}

/**
 * Hydrates chat messages safely for the active Triad scope.
 * Drops messages that do not belong to the current householdId and memberId.
 */
export function hydrateScopedChat(scope: TriadScope | null): TriadChatMessage[] {
  if (!scope || !scope.householdId || !scope.memberId) {
    return [];
  }

  const storage = getStorage();
  if (!storage) return [];

  try {
    const key = getScopedChatStorageKey(scope.householdId, scope.memberId);
    const raw = storage.getItem(key);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as TriadChatSessionState;
    if (parsed.householdId !== scope.householdId || parsed.memberId !== scope.memberId) {
      // Cross-household or cross-member mismatch! Quarantine and purge immediately
      storage.removeItem(key);
      purgeChatSession(parsed.householdId, parsed.memberId);
      return [];
    }

    return Array.isArray(parsed.messages) ? parsed.messages : [];
  } catch {
    return [];
  }
}

/**
 * Persists chat messages strictly scoped to active household and member.
 */
export function persistScopedChat(scope: TriadScope, messages: TriadChatMessage[]): void {
  if (!scope.householdId || !scope.memberId) return;

  const storage = getStorage();
  if (!storage) return;

  try {
    const key = getScopedChatStorageKey(scope.householdId, scope.memberId);
    const sessionState: TriadChatSessionState = {
      householdId: scope.householdId,
      memberId: scope.memberId,
      messages: messages.slice(-50), // Keep last 50 to prevent unbounded bloat
      lastUpdated: Date.now(),
    };
    storage.setItem(key, JSON.stringify(sessionState));
  } catch {
    // storage full or blocked
  }
}

/**
 * Triad JSON Pipeline Wrapper:
 * Safely executes API requests, parses JSON envelopes, handles markdown fence stripping,
 * and provides AbortController support to cancel requests when bento cards collapse.
 */
export interface TriadPipelineOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface TriadPipelineResult<T> {
  ok: boolean;
  data?: T;
  rawText?: string;
  error?: string;
}

export async function executeTriadJsonPipeline<T = Record<string, unknown>>(
  url: string,
  payload: unknown,
  options: TriadPipelineOptions = {}
): Promise<TriadPipelineResult<T>> {
  const { signal, timeoutMs = 25000, headers = {} } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Link external signal if provided
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Network response not ok');
      return { ok: false, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }

    const jsonResponse = await res.json().catch(() => null);
    if (!jsonResponse) {
      return { ok: false, error: 'Empty or invalid JSON payload returned by server' };
    }

    // Check if the payload returned an inner AI response text that needs markdown code-fence parsing
    const rawText = typeof jsonResponse.text === 'string' ? jsonResponse.text : '';
    if (rawText) {
      const cleaned = rawText.replace(/^```json?\s*/i, '').replace(/```$/i, '').trim();
      try {
        const parsedInner = JSON.parse(cleaned) as T;
        return { ok: true, data: parsedInner, rawText };
      } catch {
        // AI replied in plain text rather than structured JSON
        return { ok: true, data: jsonResponse as T, rawText };
      }
    }

    return { ok: true, data: jsonResponse as T };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, error: 'Request aborted or timed out' };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
