/**
 * /api/ha-webhook — Home Assistant → Bear House bridge (Edge Runtime)
 */
export const config = { runtime: 'edge' };

import { dbGet, dbSet } from './_db.js';

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }

async function appendTask(task: object) {
  const existing: any[] = (await dbGet('household_tasks')) ?? [];
  const text = (task as any).text;
  if (existing.some((t: any) => !t.completed && t.text?.toLowerCase() === text?.toLowerCase())) return { skipped: true };
  await dbSet('household_tasks', [task, ...existing]);
  return { saved: true };
}

async function logPresence(entry: object) {
  const existing: any[] = (await dbGet('presence_log')) ?? [];
  await dbSet('presence_log', [entry, ...existing.slice(0, 199)]);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') return j({ ok: true, supported_events: ['person_arrived','person_left','package_delivered','door_left_open','low_battery','motion_detected','wyze_alert','custom'] });
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN!;

  const body = await req.json().catch(() => ({})) as any;
  const token = req.headers.get('x-webhook-token') || body?.token;
  if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) return j({ error: 'Unauthorized' }, 401);

  const { event, person, area, device, text: customText, priority, category, dueEstimate, alert_type } = body;
  if (!event) return j({ error: 'Missing event type' }, 400);

  try {
    let result: any;
    const base = { id: uid(), completed: false, createdAt: Date.now(), source: 'home_assistant', dueDate: null };

    if (event === 'person_arrived' || event === 'person_left') {
      await logPresence({ ts: Date.now(), person, event: event === 'person_arrived' ? 'arrived' : 'left', area });
      result = { action: 'presence_logged' };

    } else if (event === 'package_delivered') {
      const task = { ...base, text: 'Bring in package from front door', person: 'Daddy', priority: 'High', category: 'General', dueEstimate: 'Today' };
      const r = await appendTask(task);
      result = { action: r.skipped ? 'duplicate_skipped' : 'task_created', task };

    } else if (event === 'door_left_open') {
      const task = { ...base, text: `Close ${area || 'door'} — left open`, person: 'Daddy', priority: 'High', category: 'General', dueEstimate: 'Today' };
      const r = await appendTask(task);
      result = { action: r.skipped ? 'duplicate_skipped' : 'task_created', task };

    } else if (event === 'low_battery') {
      const task = { ...base, text: `Replace battery in ${device || 'sensor'}`, person: 'Daddy', priority: 'Low', category: 'Maintenance', dueEstimate: 'This Week' };
      const r = await appendTask(task);
      result = { action: r.skipped ? 'duplicate_skipped' : 'task_created', task };

    } else if (event === 'motion_detected') {
      await logPresence({ ts: Date.now(), event: 'motion', area, device });
      result = { action: 'motion_logged' };

    } else if (event === 'wyze_alert') {
      const at = (alert_type || '').toLowerCase();
      if (at.includes('package') || at.includes('delivery')) {
        const task = { ...base, text: 'Package delivered — bring inside', person: 'Daddy', priority: 'High', category: 'General', dueEstimate: 'Today', source: 'wyze' };
        const r = await appendTask(task);
        result = { action: r.skipped ? 'duplicate_skipped' : 'task_created', task };
      } else {
        result = { action: 'alert_logged' };
      }

    } else if (event === 'custom') {
      if (!customText) return j({ error: 'Missing text for custom event' }, 400);
      const task = { ...base, text: customText, person: person || 'Daddy', priority: priority || 'Medium', category: category || 'General', dueEstimate: dueEstimate || 'Today' };
      const r = await appendTask(task);
      result = { action: r.skipped ? 'duplicate_skipped' : 'task_created', task };

    } else {
      return j({ error: `Unknown event: ${event}` }, 400);
    }

    return j({ ok: true, event, ...result });
  } catch (e: any) {
    return j({ error: e?.message }, 500);
  }
}
