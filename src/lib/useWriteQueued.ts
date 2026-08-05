import { useState, useEffect } from 'react';
import { onSyncUpdate, isWriteQueued } from '@/lib/sync';

// Reflects whether a given storage key currently has a write stuck in the
// offline queue (i.e. the user edited it while offline and it hasn't flushed
// to the server yet). Lets optimistic-UI sections show a subtle "will sync
// when connected" indicator instead of silently dropping the user's edit.
export function useWriteQueued(storageKey: string): boolean {
  const [queued, setQueued] = useState(() => isWriteQueued(storageKey));

  useEffect(() => {
    const read = () => setQueued(isWriteQueued(storageKey));
    // Recompute when any key flushes / a realtime event lands, and when the
    // queue itself is drained (flushOfflineQueue notifies '*').
    return onSyncUpdate(() => read());
  }, [storageKey]);

  return queued;
}