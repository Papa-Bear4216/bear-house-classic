// Hermes observability — structured event trail for every AI action.
// Events land in the top-level `hermes_events` Firestore collection so the Vercel app
// and the GCE hermes-api agent can share one audit trail (`source` distinguishes them).
// Telemetry must never break a user-facing response: logEvent swallows its own errors.
import { getAdminFirestore } from '@/lib/firebase-admin';

export type EventStatus = 'ok' | 'error';

export interface HermesEvent {
  event_type: string;      // e.g. 'ai.chat', 'ai.scan', 'ai.avatar', 'memory.store'
  summary: string;         // one human-readable line
  status: EventStatus;
  route?: string;          // API route that emitted it
  model?: string;          // model that served (or failed) the call
  latencyMs?: number;
  userId?: string;
  taskId?: string;
  error?: string;          // truncated error text when status === 'error'
}

export interface StoredHermesEvent extends HermesEvent {
  ts: string;              // ISO timestamp
  source: 'vercel' | 'gce';
}

export async function logEvent(evt: HermesEvent): Promise<void> {
  try {
    const record: StoredHermesEvent = {
      ...evt,
      ...(evt.error ? { error: evt.error.slice(0, 500) } : {}),
      ts: new Date().toISOString(),
      source: 'vercel',
    };
    // Firestore rejects undefined values — drop unset optional fields.
    const clean = Object.fromEntries(
      Object.entries(record).filter(([, v]) => v !== undefined),
    );
    await getAdminFirestore().collection('hermes_events').add(clean);
  } catch (err) {
    // Never let telemetry take down the request path.
    console.error('[hermes-events] failed to log event:', err);
  }
}

export function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
