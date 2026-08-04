// Household-wide Hermes memory — server-backed (api/memory.ts,
// household_memory table), replacing the old per-device
// localStorage['hermes_memory'] blob. Any device can add a note; every
// device in the household sees it.
//
// Local cache (module-level, not persisted) exists only so the chat UI can
// render optimistically without waiting on a round-trip after every add.

import { apiUrl } from './api';
import { getAccessToken } from './householdAuth';

let cache: string[] | null = null;

async function authedJson(path: string, init: RequestInit = {}): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

/** Fetches from the server and refreshes the local cache. */
export async function loadHermesMemory(): Promise<string[]> {
  try {
    const data = await authedJson('/api/memory', { method: 'GET' });
    cache = (data.notes || []).map((n: any) => n.text);
    return cache;
  } catch {
    return cache || [];
  }
}

/** Returns the last-known cache without a network call — use for the
 * system prompt where a stale-by-a-few-seconds read is fine. */
export function cachedHermesMemory(): string[] {
  return cache || [];
}

/** Fire-and-forget add: updates the local cache immediately, persists in
 * the background. A failed write just means the next loadHermesMemory()
 * won't have it — never blocks the chat response. */
export function addHermesMemory(text: string): void {
  cache = [text, ...(cache || [])];
  authedJson('/api/memory', { method: 'POST', body: JSON.stringify({ action: 'add', text }) }).catch(() => {});
}

export async function clearHermesMemory(): Promise<void> {
  cache = [];
  await authedJson('/api/memory', { method: 'POST', body: JSON.stringify({ action: 'clear' }) });
}
