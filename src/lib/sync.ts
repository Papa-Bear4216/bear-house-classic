import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pbiffzdcythkwtwxtqlu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiaWZmemRjeXRoa3d0d3h0cWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNTMxNzQsImV4cCI6MjA5MjgyOTE3NH0.N-K-GJMBQsYiYjzMKiYVeJ8urE893Pr7LG0KOqiPBLg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let syncEnabled = false;
const listeners: Set<() => void> = new Set();

export function onSyncUpdate(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notifyListeners() {
  listeners.forEach(cb => cb());
}

// Pull all keys from Supabase into localStorage
export async function pullFromCloud(): Promise<void> {
  try {
    const { data, error } = await supabase.from('family_data').select('key, value');
    if (error) { console.warn('Sync pull failed:', error.message); return; }
    for (const row of data ?? []) {
      localStorage.setItem(row.key, JSON.stringify(row.value));
    }
    syncEnabled = true;
    notifyListeners();
  } catch (e) {
    console.warn('Sync unavailable, running offline');
  }
}

// Push a single key to Supabase
export async function pushToCloud(key: string, value: unknown): Promise<void> {
  if (!syncEnabled) return;
  try {
    await supabase.from('family_data').upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
  } catch (e) {
    console.warn('Sync push failed for', key);
  }
}

// Subscribe to real-time changes from other devices
export function subscribeToRealtime(): () => void {
  const channel = supabase
    .channel('family_data_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'family_data' }, (payload) => {
      if (payload.new && typeof payload.new === 'object' && 'key' in payload.new) {
        const row = payload.new as { key: string; value: unknown };
        localStorage.setItem(row.key, JSON.stringify(row.value));
        notifyListeners();
      }
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

export function isSyncEnabled() { return syncEnabled; }
