import { createClient } from '@supabase/supabase-js';
import { apiUrl } from './api';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let syncEnabled = false;
let currentHouseholdId: string | null = null;
const listeners: Set<() => void> = new Set();

// Last updated_at we've seen per key, from either a pull, a realtime event,
// or our own successful push. Sent back as expectedUpdatedAt on the next
// push so the server can detect "someone else wrote this key since I last
// saw it" instead of silently overwriting their change (see api/data-write.ts).
const knownVersions = new Map<string, string>();

export function onSyncUpdate(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notifyListeners() {
  listeners.forEach(cb => cb());
}

// Pull all keys for one household from Supabase into localStorage
export async function pullFromCloud(householdId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('family_data')
      .select('key, value, updated_at')
      .eq('household_id', householdId);
    if (error) { console.warn('Sync pull failed:', error.message); return; }
    for (const row of data ?? []) {
      localStorage.setItem(row.key, JSON.stringify(row.value));
      if (row.updated_at) knownVersions.set(row.key, row.updated_at);
    }
    currentHouseholdId = householdId;
    syncEnabled = true;
    notifyListeners();
  } catch (e) {
    console.warn('Sync unavailable, running offline');
  }
}

// Push a single key to Supabase via the server-side write endpoint.
// Writes no longer go direct from the browser: the anon key can't write once
// RLS is enabled, and the powerful service_role key lives only on the server
// (api/data-write.ts). See docs/fix-family-data-rls.sql.
const WRITE_SECRET = import.meta.env.VITE_DATA_WRITE_SECRET || '';

// Per-key write serialization. saveJSON fires pushToCloud without awaiting,
// so rapid edits to the same key (fast typing, quick checkbox toggles) can
// have two pushes in flight at once. Both would read the same
// knownVersions[key] and send it as expectedUpdatedAt, so the second to
// arrive at the server looks like a stale write from another device and
// gets rejected — even though it's this device's own newer edit. Queuing
// pushes per key so only one is ever in flight means knownVersions is
// always current by the time the next one sends, and only genuine
// cross-device conflicts hit the 409 path. Coalesced: if edits pile up
// while a push is in flight, only the latest value is sent next — earlier
// queued values are superseded, not sent one by one.
const pending = new Map<string, Promise<boolean>>();
const queuedValue = new Map<string, unknown>();

export function pushToCloud(key: string, value: unknown): Promise<boolean> {
  const inFlight = pending.get(key);
  if (inFlight) {
    queuedValue.set(key, value);
    return inFlight;
  }
  const run = doPush(key, value).then(async (ok) => {
    pending.delete(key);
    if (queuedValue.has(key)) {
      const next = queuedValue.get(key);
      queuedValue.delete(key);
      return pushToCloud(key, next);
    }
    return ok;
  });
  pending.set(key, run);
  return run;
}

async function doPush(key: string, value: unknown): Promise<boolean> {
  if (!syncEnabled || !currentHouseholdId) return false;
  try {
    const res = await fetch(apiUrl('/api/data-write'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-write-secret': WRITE_SECRET },
      body: JSON.stringify({
        key, value, householdId: currentHouseholdId,
        expectedUpdatedAt: knownVersions.get(key),
      }),
    });
    if (res.status === 409) {
      // Someone else wrote this key since we last read it. We only have
      // whole-value blobs, not deltas, so we can't merge the two edits —
      // take their version as the source of truth and drop ours, rather
      // than clobbering it. The user's in-flight edit is lost locally;
      // logged so it's at least visible during development.
      const detail = await res.json().catch(() => null);
      if (detail?.current !== undefined) {
        localStorage.setItem(key, JSON.stringify(detail.current));
        if (detail.currentUpdatedAt) knownVersions.set(key, detail.currentUpdatedAt);
        notifyListeners();
      }
      console.warn(`Sync push for "${key}" lost a version conflict — took the cloud's value instead`);
      return false;
    }
    if (!res.ok) {
      // Actually surface failures — the old direct-upsert path swallowed them,
      // so multi-device sync could rot invisibly.
      const detail = await res.json().catch(() => ({ error: res.statusText }));
      console.warn(`Sync push failed for "${key}": ${res.status} ${detail.error || ''}`);
      return false;
    }
    const body = await res.json().catch(() => null);
    if (body?.updatedAt) knownVersions.set(key, body.updatedAt);
    return true;
  } catch (e) {
    console.warn(`Sync push failed for "${key}" (network):`, e);
    return false;
  }
}

// Subscribe to real-time changes from other devices in the same household
export function subscribeToRealtime(householdId: string): () => void {
  const channel = supabase
    .channel('family_data_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'family_data', filter: `household_id=eq.${householdId}` },
      (payload) => {
        if (payload.new && typeof payload.new === 'object' && 'key' in payload.new) {
          const row = payload.new as { key: string; value: unknown; updated_at?: string };
          localStorage.setItem(row.key, JSON.stringify(row.value));
          if (row.updated_at) knownVersions.set(row.key, row.updated_at);
          notifyListeners();
        }
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

export function isSyncEnabled() { return syncEnabled; }
