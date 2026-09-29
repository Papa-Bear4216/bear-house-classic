import { createClient } from '@supabase/supabase-js';
import { apiUrl } from './api';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let syncEnabled = false;
let currentHouseholdId: string | null = null;
let householdGeneration = 0;
const listeners: Set<(key: string) => void> = new Set();

const knownVersions = new Map<string, string>();

export function onSyncUpdate(cb: (key: string) => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function notifyListeners(key: string) {
  listeners.forEach(cb => cb(key));
}

// --- Offline queue ---
// Writes that couldn't reach the server are held here and replayed on the
// next 'online' event (or the next successful pull). Persisted to
// localStorage so an edit made while offline survives a page reload.
type QueuedWrite = { id: string; key: string; value: unknown; householdId: string | null };
const OFFLINE_DB_NAME = 'familyos-sync';
const OFFLINE_STORE = 'writes';
const OFFLINE_LS_KEY = 'sync_offline_queue';

// Which household the localStorage data cache belongs to. Every synced value
// (messages, meds, bills, memory, ...) lives in localStorage and is only ever
// *overlaid* by a pull — so without this, signing into a second household on
// the same browser kept showing (and could push back) the first one's data.
const DATA_OWNER_KEY = 'sync_data_owner';

// Device-level keys that are not household data and must survive a purge.
function isDeviceKey(key: string): boolean {
  return key === OFFLINE_LS_KEY || key === DATA_OWNER_KEY || key === 'theme'
    || key === 'hermes_voice_output' || key.startsWith('sb-');
}

/** Removes every cached household value from localStorage, keeping only
 * device-level keys (auth session, theme, the offline write queue). */
export function purgeLocalHouseholdData(): void {
  try {
    const ls = globalThis.localStorage;
    if (!ls || typeof ls.length !== 'number' || typeof ls.key !== 'function') return;
    const doomed: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && !isDeviceKey(k)) doomed.push(k);
    }
    for (const k of doomed) ls.removeItem(k);
  } catch { /* storage unavailable */ }
}

/** Call on sign-out: drop the cache and the owner marker. */
export function clearLocalHouseholdCache(): void {
  purgeLocalHouseholdData();
  try { globalThis.localStorage?.removeItem(DATA_OWNER_KEY); } catch { /* ignore */ }
}
const offlineQueue: QueuedWrite[] = readLocalQueue();
let syncingQueue = false;
let queueDb: Promise<IDBDatabase | null> | null = null;

function queueId(key: string, householdId: string | null): string {
  return `${householdId ?? 'legacy'}:${key}`;
}

function normalizeQueuedWrite(value: any): QueuedWrite | null {
  if (!value || typeof value.key !== 'string' || !value.key) return null;
  const householdId = typeof value.householdId === 'string' ? value.householdId : null;
  return { id: queueId(value.key, householdId), key: value.key, value: value.value, householdId };
}

function readLocalSnapshot(): string | null {
  try { return globalThis.localStorage?.getItem(OFFLINE_LS_KEY) ?? null; }
  catch (error) { console.warn('Local offline queue is unavailable', error); return null; }
}

function writeLocalSnapshot(snapshot: QueuedWrite[]): void {
  try {
    if (snapshot.length) globalThis.localStorage?.setItem(OFFLINE_LS_KEY, JSON.stringify(snapshot));
    else globalThis.localStorage?.removeItem(OFFLINE_LS_KEY);
  } catch (error) { console.warn('Local offline queue fallback could not be saved', error); }
}

function readLocalQueue(): QueuedWrite[] {
  try {
    const saved = readLocalSnapshot();
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeQueuedWrite).filter((item): item is QueuedWrite => item !== null);
  } catch (e) {
    console.warn('Failed to read local offline queue', e);
    return [];
  }
}

function getQueueDb(): Promise<IDBDatabase | null> {
  if (queueDb) return queueDb;
  queueDb = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    try {
      const request = indexedDB.open(OFFLINE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(OFFLINE_STORE)) {
          request.result.createObjectStore(OFFLINE_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return queueDb;
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

async function readIndexedQueue(db: IDBDatabase): Promise<QueuedWrite[]> {
  const tx = db.transaction(OFFLINE_STORE, 'readonly');
  const done = transactionDone(tx);
  const request = tx.objectStore(OFFLINE_STORE).getAll();
  const items = await new Promise<unknown[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as unknown[]);
    request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
  });
  await done;
  return items.map(normalizeQueuedWrite).filter((item): item is QueuedWrite => item !== null);
}

let persistenceChain: Promise<void> = Promise.resolve();
function persistQueue(): Promise<void> {
  const snapshot = offlineQueue.map(item => ({ ...item }));
  const write = persistenceChain.then(async () => {
    const db = await getQueueDb();
    if (!db) {
      writeLocalSnapshot(snapshot);
      return;
    }
    try {
      const tx = db.transaction(OFFLINE_STORE, 'readwrite');
      const done = transactionDone(tx);
      const store = tx.objectStore(OFFLINE_STORE);
      store.clear();
      snapshot.forEach(item => store.put(item));
      await done;
      writeLocalSnapshot([]);
    } catch (error) {
      console.warn('IndexedDB queue write failed; retaining localStorage copy', error);
      writeLocalSnapshot(snapshot);
    }
  });
  persistenceChain = write.catch(() => {});
  return write;
}

const queueReady: Promise<void> = (async () => {
  try {
    const db = await getQueueDb();
    if (!db) return;
    const hasLocalSnapshot = !!readLocalSnapshot();
    if (!hasLocalSnapshot) {
      const stored = await readIndexedQueue(db);
      offlineQueue.splice(0, offlineQueue.length, ...stored);
    }
    // A local snapshot is authoritative: it may be the last complete fallback
    // after an interrupted database operation, or the legacy queue being moved.
    await persistQueue();
  } catch (error) {
    // Keep the queue usable in memory if storage initialization is unavailable.
    // In particular, never replace IndexedDB with an empty snapshot after a
    // failed read.
    console.warn('Offline queue initialization failed; retaining in-memory state', error);
  }
})();

function isQueued(key: string, householdId: string | null = currentHouseholdId): boolean {
  return householdId !== null && offlineQueue.some(item => item.key === key
    && item.householdId === householdId);
}

export function isWriteQueued(key: string): boolean {
  return isQueued(key);
}

export function getOfflineSyncStatus() {
  return {
    online: typeof navigator === 'undefined' || navigator.onLine,
    syncing: syncingQueue,
    pendingWrites: offlineQueue.filter(item => item.householdId === currentHouseholdId).length,
    unassignedWrites: offlineQueue.filter(item => item.householdId === null).length,
  };
}

// Store a failed write for later replay. Whole-value blobs, so a newer
// queued write for the same key supersedes the older one — replaying a
// stale value would clobber the newer edit.
async function enqueueOfflineWrite(key: string, value: unknown, householdId: string | null) {
  await queueReady;
  const id = queueId(key, householdId);
  const queued = { id, key, value, householdId };
  const idx = offlineQueue.findIndex(item => item.id === id);
  if (idx >= 0) offlineQueue[idx] = queued;
  else offlineQueue.push(queued);
  await persistQueue();
  // Surface the queued state to optimistic-UI hooks immediately so a
  // pending indicator appears right when the offline edit is registered.
  notifyListeners('*');
}

async function clearQueuedWrite(key: string, householdId: string | null) {
  await queueReady;
  const id = queueId(key, householdId);
  const idx = offlineQueue.findIndex(item => item.id === id);
  if (idx >= 0) {
    offlineQueue.splice(idx, 1);
    await persistQueue();
  }
}

// Flush the queue once we're back online and a household is synced.
async function flushOfflineQueue() {
  if (syncingQueue || !syncEnabled || !currentHouseholdId) return;
  syncingQueue = true;
  notifyListeners('*');
  try {
    await queueReady;
    while (syncEnabled && currentHouseholdId) {
      const householdId = currentHouseholdId;
      const index = offlineQueue.findIndex(item => item.householdId === householdId);
      // Legacy entries have no trustworthy owner. Keep them quarantined instead
      // of replaying them into whichever household signs in next.
      if (index < 0) break;
      const item = offlineQueue[index];
      await pushToCloudInHousehold(item.key, item.value, householdId);
      // enqueueOfflineWrite replaces a re-queued entry with a new object, so
      // an identity check here would never see it and would spin forever.
      if (isQueued(item.key, householdId)) break;
    }
  } finally {
    syncingQueue = false;
    notifyListeners('*');
  }
}

export async function retryOfflineWrites(): Promise<void> {
  await flushOfflineQueue();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushOfflineQueue(); });
  window.addEventListener('load', () => {
    if (navigator.onLine) void flushOfflineQueue();
  });
}

export async function pullFromCloud(householdId: string): Promise<void> {
  const generation = ++householdGeneration;
  try {
    if (currentHouseholdId !== householdId) {
      currentHouseholdId = null;
      syncEnabled = false;
      knownVersions.clear();
    }
    await queueReady;
    // The cache belongs to a different household: wipe it before anything
    // can render it. (Unknown owner = pre-fix cache; wiped after the fetch
    // succeeds, below, so an offline first load isn't left empty.)
    const cacheOwner = localStorage.getItem(DATA_OWNER_KEY);
    const foreignCache = cacheOwner !== null && cacheOwner !== householdId;
    if (foreignCache) purgeLocalHouseholdData();
    const { data, error } = await supabase
      .from('family_data')
      .select('key, value, updated_at')
      .eq('household_id', householdId);
    if (error) { console.warn('Sync pull failed:', error.message); return; }
    if (generation !== householdGeneration) return;
    if (cacheOwner === null || foreignCache) {
      if (cacheOwner === null) purgeLocalHouseholdData();
      // Re-apply this household's own unflushed offline edits the purge removed.
      for (const item of offlineQueue) {
        if (item.householdId === householdId) localStorage.setItem(item.key, JSON.stringify(item.value));
      }
    }
    localStorage.setItem(DATA_OWNER_KEY, householdId);
    for (const row of data ?? []) {
      // Never clobber a write still sitting in the offline queue — the
      // local value is newer than what the server has. It'll be replayed
      // after the queue flushes.
      if (isQueued(row.key, householdId)) continue;
      localStorage.setItem(row.key, JSON.stringify(row.value));
      if (row.updated_at) knownVersions.set(`${householdId}:${row.key}`, row.updated_at);
    }
    currentHouseholdId = householdId;
    syncEnabled = true;
    void flushOfflineQueue();
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
  return pushToCloudInHousehold(key, value, currentHouseholdId);
}

function pushToCloudInHousehold(key: string, value: unknown, householdId: string | null): Promise<boolean> {
  const scope = `${householdId ?? 'unassigned'}:${key}`;
  const inFlight = pending.get(scope);
  if (inFlight) {
    queuedValue.set(scope, value);
    return inFlight;
  }
  const run = doPush(key, value, householdId).then(async (result) => {
    pending.delete(scope);
    if (queuedValue.has(scope)) {
      // A newer edit arrived while this push was in flight — send it next;
      // it supersedes this value whether this one succeeded or not.
      const next = queuedValue.get(scope);
      queuedValue.delete(scope);
      return pushToCloudInHousehold(key, next, householdId);
    }
    if (result.ok) {
      await clearQueuedWrite(key, householdId);
      return true;
    }
    if ('conflict' in result && result.conflict) {
      // A 409 already adopted the server's value. Retaining this losing local
      // revision would suppress the same remote value and block later replay.
      await clearQueuedWrite(key, householdId);
      return false;
    }
    if ('retryable' in result && result.retryable) {
      // Network/upstream failure — hold the latest value in the offline
      // queue so it's not lost. (409 conflicts are permanent: we already
      // adopted the cloud value and must NOT replay our losing edit.)
      await enqueueOfflineWrite(key, value, householdId);
    }
    return false;
  });
  pending.set(scope, run);
  return run;
}

// Discriminated result so callers can tell "transient failure, retry later"
// (network error, 5xx) from "permanent, don't retry" (409 conflict — we
// adopted the cloud's value, replaying ours would clobber it).
type PushResult = { ok: true } | { ok: false; retryable: boolean; conflict?: boolean };

async function doPush(key: string, value: unknown, householdId: string | null = currentHouseholdId): Promise<PushResult> {
  if (!syncEnabled || !householdId || currentHouseholdId !== householdId) return { ok: false, retryable: true };

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) return { ok: false, retryable: true };
    if (currentHouseholdId !== householdId) return { ok: false, retryable: true };

    const res = await fetch(apiUrl('/api/data-write'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-write-secret': WRITE_SECRET,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        // householdId is transitional: the new server (commit 65be63d+) resolves
        // householdId from the Authorization header and ignores this field, but
        // an old, not-yet-redeployed server still requires it in the body. Safe
        // to remove once every server instance is confirmed running 65be63d+.
        key, value, householdId,
        expectedUpdatedAt: knownVersions.get(`${householdId}:${key}`),
      }),
    });
    if (res.status === 409) {
      const detail = await res.json().catch(() => null);
      if (detail?.current !== undefined && currentHouseholdId === householdId) {
        localStorage.setItem(key, JSON.stringify(detail.current));
        if (detail.currentUpdatedAt) knownVersions.set(`${householdId}:${key}`, detail.currentUpdatedAt);
        notifyListeners(key);
      }
      return { ok: false, retryable: false, conflict: true };
    }
    if (!res.ok) {
      console.warn(`Sync push failed for "${key}": ${res.status}`);
      // 401/429 are transient from the client's perspective (expired token about to
      // refresh, or a burst rate-limit window) — worth another attempt, not a permanent
      // drop. 400/403 are genuine client errors (malformed body, server-managed key)
      // where retrying the same payload will never succeed.
      return { ok: false, retryable: res.status >= 500 || res.status === 401 || res.status === 429 };
    }
    const body = await res.json().catch(() => null);
    if (body?.updatedAt) knownVersions.set(`${householdId}:${key}`, body.updatedAt);
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
          if (isQueued(row.key, householdId)) return;
          localStorage.setItem(row.key, JSON.stringify(row.value));
          if (row.updated_at) knownVersions.set(`${householdId}:${row.key}`, row.updated_at);
          notifyListeners(row.key);
        }
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

export function isSyncEnabled() { return syncEnabled; }
