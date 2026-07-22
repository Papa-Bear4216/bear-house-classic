/**
 * /api/ha-webhook — Home Assistant → Bear House bridge (Edge Runtime)
 */
export const config = { runtime: 'edge' };

import { dbGet, dbSet, resolveHouseholdIdByWebhookToken } from './_db.js';
import { notifyIFTTT } from './_notify.js';
import { parseBody, HaWebhookBodySchema } from './_schemas.js';

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }

async function appendTask(householdId: string, task: object) {
  const existing: any[] = (await dbGet('household_tasks', householdId)) ?? [];
  const text = (task as any).text;
  if (existing.some((t: any) => !t.completed && t.text?.toLowerCase() === text?.toLowerCase())) return { skipped: true };
  await dbSet('household_tasks', householdId, [task, ...existing]);
  return { saved: true };
}

async function logPresence(householdId: string, entry: object) {
  const existing: any[] = (await dbGet('presence_log', householdId)) ?? [];
  await dbSet('presence_log', householdId, [entry, ...existing.slice(0, 199)]);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') return j({ ok: true, supported_events: ['person_arrived','person_left','package_delivered','door_left_open','low_battery','motion_detected','wyze_alert','custom'] });
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const rawBody = await req.json().catch(() => ({})) as any;
  const token = req.headers.get('x-webhook-token') || rawBody?.token;
  const householdId = await resolveHouseholdIdByWebhookToken(token);
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const parsed = parseBody(HaWebhookBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const body = parsed.data;
  const { event } = body;

  try {
    let result: any;
    const base = { id: uid(), completed: false, createdAt: Date.now(), source: 'home_assistant', dueDate: null };

    if (event === 'person_arrived' || event === 'person_left') {
      const { person, area } = body;
      await logPresence(householdId, { ts: Date.now(), person, event: event === 'person_arrived' ? 'arrived' : 'left', area });
      result = { action: 'presence_logged' };

    } else if (event === 'package_delivered') {
      const task = { ...base, text: 'Bring in package from front door', person: 'General', priority: 'High', category: 'General', dueEstimate: 'Today' };
      const r = await appendTask(householdId, task);
      if (!r.skipped) await notifyIFTTT('bearhouse_package', 'Package delivered', 'Front door');
      result = { action: r.skipped ? 'duplicate_skipped' : 'task_created', task };

    } else if (event === 'door_left_open') {
      const { area } = body;
      const task = { ...base, text: `Close ${area || 'door'} — left open`, person: 'General', priority: 'High', category: 'General', dueEstimate: 'Today' };
      const r = await appendTask(householdId, task);
      if (!r.skipped) await notifyIFTTT('bearhouse_door_open', area || 'A door', 'left open');
      result = { action: r.skipped ? 'duplicate_skipped' : 'task_created', task };

    } else if (event === 'low_battery') {
      const { device } = body;
      const task = { ...base, text: `Replace battery in ${device || 'sensor'}`, person: 'General', priority: 'Low', category: 'Maintenance', dueEstimate: 'This Week' };
      const r = await appendTask(householdId, task);
      result = { action: r.skipped ? 'duplicate_skipped' : 'task_created', task };

    } else if (event === 'motion_detected') {
      const { area, device } = body;
      await logPresence(householdId, { ts: Date.now(), event: 'motion', area, device });
      result = { action: 'motion_logged' };

    } else if (event === 'wyze_alert') {
      const { alert_type } = body;
      const at = (alert_type || '').toLowerCase();
      if (at.includes('package') || at.includes('delivery')) {
        const task = { ...base, text: 'Package delivered — bring inside', person: 'General', priority: 'High', category: 'General', dueEstimate: 'Today', source: 'wyze' };
        const r = await appendTask(householdId, task);
        result = { action: r.skipped ? 'duplicate_skipped' : 'task_created', task };
      } else {
        result = { action: 'alert_logged' };
      }

    } else if (event === 'custom') {
      const { text: customText, person, priority, category, dueEstimate } = body;
      const task = { ...base, text: customText, person, priority, category, dueEstimate };
      const r = await appendTask(householdId, task);
      result = { action: r.skipped ? 'duplicate_skipped' : 'task_created', task };

    } else {
      return j({ error: `Unknown event: ${event}` }, 400);
    }

    return j({ ok: true, event, ...result });
  } catch (e: any) {
    return j({ error: e?.message }, 500);
  }
}
