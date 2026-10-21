// Household-wide, server-backed Hermes memory with a device-local retry outbox.
import { apiUrl } from './api';
import { getAccessToken } from './householdAuth';

const OUTBOX_KEY = 'hermes_memory_outbox';
type MemoryKind = 'fact'|'preference'|'routine'|'pattern'|'correction';
export interface MemoryMeta {
  memberId?: string | null;
  subjectMemberId?: string | null;
  kind?: MemoryKind;
  importance?: number;
  inferred?: boolean;
}
type OutboxEntry = { text: string; meta?: MemoryMeta };

let cache: string[] | null = null;
let loadPromise: Promise<string[]> | null = null;

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

function readOutbox(): OutboxEntry[] {
  try {
    const rows = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
    return Array.isArray(rows) ? rows.filter((row) => typeof row?.text === 'string') : [];
  } catch {
    return [];
  }
}

function writeOutbox(rows: OutboxEntry[]): void {
  try {
    if (rows.length) localStorage.setItem(OUTBOX_KEY, JSON.stringify(rows));
    else localStorage.removeItem(OUTBOX_KEY);
  } catch {
    // Keep the user-visible return value false when storage itself is unavailable.
  }
}

async function postMemory(entry: OutboxEntry): Promise<void> {
  await authedJson('/api/memory', {
    method: 'POST',
    body: JSON.stringify({ action: 'add', text: entry.text, ...(entry.meta || {}) }),
  });
}

async function flushOutbox(): Promise<void> {
  const pending = readOutbox();
  if (!pending.length) return;
  const remaining: OutboxEntry[] = [];
  for (const entry of pending) {
    try { await postMemory(entry); }
    catch { remaining.push(entry); }
  }
  writeOutbox(remaining);
}

/** Fetch server memory after first retrying writes saved on this device. */
export async function loadHermesMemory(): Promise<string[]> {
  try {
    await flushOutbox();
    const data = await authedJson('/api/memory', { method: 'GET' });
    cache = (data.notes || []).filter((note: any) => note.status === undefined || note.status === 'active').map((note: any) => note.text);
    return cache;
  } catch {
    return cache || [];
  }
}

export function ensureHermesMemoryLoaded(): Promise<string[]> {
  if (!loadPromise) loadPromise = loadHermesMemory().finally(() => { loadPromise = null; });
  return loadPromise;
}

/** Last known cache without a network call. */
export function cachedHermesMemory(): string[] {
  return cache || [];
}

/** Optimistically update memory, persist it, and queue failures for next load. */
export async function addHermesMemory(text: string, meta?: MemoryMeta): Promise<boolean> {
  cache = [text, ...(cache || [])];
  try {
    await postMemory({ text, meta });
    return true;
  } catch {
    const outbox = readOutbox();
    outbox.push({ text, meta });
    writeOutbox(outbox);
    return false;
  }
}

export async function supersedeClosestMemory(subjectMemberId: string, replacementText: string): Promise<void> {
  const data = await authedJson('/api/memory', { method: 'GET' });
  const candidates = (data.notes || []).filter((note: any) =>
    note.status === 'active' && note.subject_member_id === subjectMemberId && note.id && note.text !== replacementText
  );
  if (!candidates.length) return;
  const words = (value: string) => new Set(value.toLowerCase().match(/[a-z0-9]+/g) || []);
  const replacementWords = words(replacementText);
  candidates.sort((a: any, b: any) => {
    const score = (text: string) => {
      const candidateWords = words(text);
      const overlap = [...replacementWords].filter((word) => candidateWords.has(word)).length;
      return overlap / Math.max(1, new Set([...replacementWords, ...candidateWords]).size);
    };
    return score(b.text) - score(a.text) || Date.parse(b.created_at) - Date.parse(a.created_at);
  });
  await authedJson('/api/memory', {
    method: 'POST',
    body: JSON.stringify({ action: 'setStatus', id: candidates[0].id, status: 'superseded' }),
  });
}

export async function clearHermesMemory(): Promise<void> {
  cache = [];
  writeOutbox([]);
  await authedJson('/api/memory', { method: 'POST', body: JSON.stringify({ action: 'clear' }) });
}
