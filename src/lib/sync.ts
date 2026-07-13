import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zjialvdolbkccduuwsck.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqaWFsdmRvbGJrY2NkdXV3c2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4NzEwNTcsImV4cCI6MjA5OTQ0NzA1N30.rSsMqUCWem2_xE0TXTZ8m4HhcS51QIMKrRkRgNYdPMk';

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

// Push a single key to Supabase via the server-side write endpoint.
// Writes no longer go direct from the browser: the anon key can't write once
// RLS is enabled, and the powerful service_role key lives only on the server
// (api/data-write.ts). See docs/fix-family-data-rls.sql.
const WRITE_SECRET = import.meta.env.VITE_DATA_WRITE_SECRET || '';

export async function pushToCloud(key: string, value: unknown): Promise<boolean> {
  if (!syncEnabled) return false;
  try {
    const res = await fetch('/api/data-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-write-secret': WRITE_SECRET },
      body: JSON.stringify({ key, value }),
    });
    if (!res.ok) {
      // Actually surface failures — the old direct-upsert path swallowed them,
      // so multi-device sync could rot invisibly.
      const detail = await res.json().catch(() => ({ error: res.statusText }));
      console.warn(`Sync push failed for "${key}": ${res.status} ${detail.error || ''}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`Sync push failed for "${key}" (network):`, e);
    return false;
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
