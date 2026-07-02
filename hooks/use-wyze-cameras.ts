import { useEffect, useState } from 'react';
import { authFetch } from '@/lib/api-client';

export interface WyzeCamera {
  entityId: string;
  name: string;
}

// Lists camera.* entities from Home Assistant so rooms can be wired to a
// Wyze feed by picking a name instead of typing the raw entity id.
export function useWyzeCameras() {
  const [cameras, setCameras] = useState<WyzeCamera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch('/api/wyze/entities');
        if (!res.ok) {
          const { error: msg } = await res.json();
          throw new Error(msg ?? `Failed to load cameras (${res.status})`);
        }
        const { cameras: list } = await res.json();
        if (!cancelled) setCameras(list);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load cameras');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { cameras, loading, error };
}
