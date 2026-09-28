// api/triad-telemetry.ts
export const config = { runtime: 'edge' };

import { handleCorsPreflight } from './_cors.js';
import { json as j } from './_responseHelpers.js';
import { resolveHouseholdId } from './_db.js';

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) {
    return j({ error: 'Unauthorized' }, 401);
  }

  const TRIAD_URL = process.env.TRIAD_URL || 'http://127.0.0.1:8789';

  try {
    const [healthRes, telemetryRes] = await Promise.allSettled([
      fetch(`${TRIAD_URL}/health`, { signal: AbortSignal.timeout(3000) }),
      fetch(`${TRIAD_URL}/telemetry`, { signal: AbortSignal.timeout(3000) }),
    ]);

    const healthData = healthRes.status === 'fulfilled' && healthRes.value.ok
      ? await healthRes.value.json()
      : null;

    const telemetryData = telemetryRes.status === 'fulfilled' && telemetryRes.value.ok
      ? await telemetryRes.value.json()
      : null;

    if (!healthData && !telemetryData) {
      return j({
        available: false,
        status: 'standby',
        port: 8789,
        message: 'Triad daemon standby on port 8789. Run `triad listen` to activate.',
        advisors: [],
        sessions: [],
      });
    }

    return j({
      available: true,
      status: 'online',
      port: 8789,
      health: healthData,
      telemetry: telemetryData,
    });
  } catch (err: any) {
    return j({
      available: false,
      status: 'error',
      port: 8789,
      error: err?.message || 'Failed connecting to Triad daemon',
    });
  }
}
