import { createClient } from '@supabase/supabase-js';
import { apiUrl } from './api';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let syncEnabled = false;
let currentHouseholdId: string | null = null;
const listeners: Set<(key: string) => void> = new Set();

const knownVersions = new Map<string, string>();

export function onSyncUpdate(cb: (key: string) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notifyListeners(key: string) {
  listeners.forEach(cb => cb(key));
}

// --- Offline queue ---
// Writes that couldn't reach the server are held here and replayed on the
// next 'online' event (or the next successful pull). Persisted to
// localStorage so an edit made while offline survives a page reload.
const offlineQueue: Array<{ key: string; value: unknown }> = [];

function loadOfflineQueue() {
  const saved = localStorage.getItem('sync_offline_queue');
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) offlineQueue.push(...parsed);
  } catch (e) {
    console.warn('Failed to parse offline queue', e);
  }
}

function persistQueue() {
  if (offlineQueue.length === 0) {
    localStorage.removeItem('sync_offline_queue');
  } else {
    localStorage.setItem('sync_offline_queue', JSON.stringify(offlineQueue));
  }
}

function isQueued(key: string): boolean {
  return offlineQueue.some(item => item.key === key);
}

export function isWriteQueued(key: string): boolean {
  return isQueued(key);
}

// Store a failed write for later replay. Whole-value blobs, so a newer
// queued write for the same key supersedes the older one — replaying a
// stale value would clobber the newer edit.
function enqueueOfflineWrite(key: string, value: unknown) {
  const idx = offlineQueue.findIndex(item => item.key === key);
  if (idx >= 0) offlineQueue[idx] = { key, value };
  else offlineQueue.push({ key, value });
  persistQueue();
  // Surface the queued state to optimistic-UI hooks immediately so a
  // pending indicator appears right when the offline edit is registered.
  notifyListeners('*');
}

function clearQueuedWrite(key: string) {
  const idx = offlineQueue.findIndex(item => item.key === key);
  if (idx >= 0) {
    offlineQueue.splice(idx, 1);
    persistQueue();
  }
}

// Flush the queue once we're back online and a household is synced.
// Replays via doPush directly (no re-enqueue on failure); on failure the
// item stays at the head of the queue for the next retry.
async function flushOfflineQueue() {
  if (!syncEnabled || !currentHouseholdId || offlineQueue.length === 0) return;
  console.log(`Flushing ${offlineQueue.length} queued write(s)...`);
  while (offlineQueue.length > 0) {
    const item = offlineQueue[0];
    const result = await doPush(item.key, item.value);
    if (!result.ok) break; // still failing — retry next event
    offlineQueue.shift();
  }
  persistQueue();
  notifyListeners('*');
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { flushOfflineQueue(); });
  window.addEventListener('load', () => {
    if (navigator.onLine) flushOfflineQueue();
  });
}

if (typeof localStorage !== 'undefined') {
  loadOfflineQueue();
}

export async function pullFromCloud(householdId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('family_data')
      .select('key, value, updated_at')
      .eq('household_id', householdId);
    if (error) { console.warn('Sync pull failed:', error.message); return; }
    for (const row of data ?? []) {
      // Never clobber a write still sitting in the offline queue — the
      // local value is newer than what the server has. It'll be replayed
      // after the queue flushes.
      if (isQueued(row.key)) continue;
      localStorage.setItem(row.key, JSON.stringify(row.value));
      if (row.updated_at) knownVersions.set(row.key, row.updated_at);
    }
    currentHouseholdId = householdId;
    syncEnabled = true;
    flushOfflineQueue();
    notifyListeners('*');
  } catch (e) {
    console.warn('Sync unavailable, running offline');
  }
}

const WRITE_SECRET = import.meta.env.VITE_DATA_WRITE_SECRET || '';

// Per-key write serialization — see comment history; coalesces in-flight
// pushes so knownVersions stays current between sends.
const pending = new Map<string, Promise<boolean>>();
const queuedValue = new Map<string, unknown>();

export function pushToCloud(key: string, value: unknown): Promise<boolean> {
  const inFlight = pending.get(key);
  if (inFlight) {
    queuedValue.set(key, value);
    return inFlight;
  }
  const run = doPush(key, value).then(async (result) => {
    pending.delete(key);
    if (queuedValue.has(key)) {
      // A newer edit arrived while this push was in flight — send it next;
      // it supersedes this value whether this one succeeded or not.
      const next = queuedValue.get(key);
      queuedValue.delete(key);
      return pushToCloud(key, next);
    }
    if (result.ok) {
      clearQueuedWrite(key);
      return true;
    }
    if (result.retryable) {
      // Network/upstream failure — hold the latest value in the offline
      // queue so it's not lost. (409 conflicts are permanent: we already
      // adopted the cloud value and must NOT replay our losing edit.)
      enqueueOfflineWrite(key, value);
    }
    return false;
  });
  pending.set(key, run);
  return run;
}

// Discriminated result so callers can tell "transient failure, retry later"
// (network error, 5xx) from "permanent, don't retry" (409 conflict — we
// adopted the cloud's value, replaying ours would clobber it).
type PushResult = { ok: true } | { ok: false; retryable: boolean };

async function doPush(key: string, value: unknown): Promise<PushResult> {
  if (!syncEnabled || !currentHouseholdId) return { ok: false, retryable: true };

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
      const detail = await res.json().catch(() => null);
      if (detail?.current !== undefined) {
        localStorage.setItem(key, JSON.stringify(detail.current));
        if (detail.currentUpdatedAt) knownVersions.set(key, detail.currentUpdatedAt);
        notifyListeners(key);
      }
      return { ok: false, retryable: false };
    }
    if (!res.ok) {
      console.warn(`Sync push failed for "${key}": ${res.status}`);
      return { ok: false, retryable: res.status >= 500 };
    }
    const body = await res.json().catch(() => null);
    if (body?.updatedAt) knownVersions.set(key, body.updatedAt);
    return { ok: true };
  } catch (e) {
    console.warn(`Sync push failed for "${key}" (network):`, e);
    return { ok: false, retryable: true };
  }
}

export function subscribeToRealtime(householdId: string): () => void {
  const channel = supabase
    .channel('family_data_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'family_data', filter: `household_id=eq.${householdId}` },
      (payload) => {
        if (payload.new && typeof payload.new === 'object' && 'key' in payload.new) {
          const row = payload.new as { key: string; value: unknown; updated_at?: string };
          // Don't apply a remote change to a key we have a queued local
          // write for — the queued edit is newer and reconciles after flush.
          if (isQueued(row.key)) return;
          localStorage.setItem(row.key, JSON.stringify(row.value));
          if (row.updated_at) knownVersions.set(row.key, row.updated_at);
          notifyListeners(row.key);
        }
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

export function isSyncEnabled() { return syncEnabled; }
