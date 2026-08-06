// Household activity feed — server-backed (api/activity.ts, household_activity
// table) so "who did what" is visible to every device in the household, not
// just the one that made the change. Fire-and-forget writes: a failed log
// never blocks the action that triggered it.
//
// Local cache (module-level, not persisted) exists only so the feed UI can
// render without waiting on a round-trip.

import { apiUrl } from './api';
import { getAccessToken } from './householdAuth';

export interface ActivityEntry {
  id: string;
  actor_name: string;
  text: string;
  created_at: string;
}

let cache: ActivityEntry[] | null = null;

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
export async function loadHouseholdActivity(): Promise<ActivityEntry[]> {
  try {
    const data = await authedJson('/api/activity', { method: 'GET' });
    cache = data.entries || [];
    return cache!;
  } catch {
    return cache || [];
  }
}

/** Returns the last-known cache without a network call. */
export function cachedHouseholdActivity(): ActivityEntry[] {
  return cache || [];
}

/** Fire-and-forget log: call this alongside saveJSON() at a mutation site.
 * Never awaited by the caller — logging activity must never slow down or
 * block the actual action. */
export function logActivity(actorName: string, text: string): void {
  authedJson('/api/activity', { method: 'POST', body: JSON.stringify({ actorName, text }) }).catch(() => {});
}
