// api/preempt-refresh.ts
export const config = { runtime: 'edge' };

import { runFix } from './ha-fix.js';

const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// Integrations whose tokens expire on a known cadence and can be refreshed with a Tier-1 action.
const PREEMPT_TARGETS = ['wyze_bridge'];

export default async function handler(_req: Request): Promise<Response> {
  const refreshed: string[] = [];
  for (const id of PREEMPT_TARGETS) {
    const result = await runFix(id);
    if (result.ok) refreshed.push(id);
  }
  return j({ ok: true, refreshed });
}
