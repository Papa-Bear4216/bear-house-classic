/**
 * /api/ha-webhook
 * Home Assistant → Bear House bridge.
 *
 * Set up in HA as a REST command or automation action:
 *   service: rest_command.bearhouse_event
 *   data:
 *     event: person_arrived | person_left | motion_detected | door_opened | package_delivered
 *     person: Daddy | Mommy | Abriana | Julia
 *     area: front_door | kitchen | living_room | etc
 *     device: sensor name
 *
 * POST /api/ha-webhook  { token, event, person, area, device }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pbiffzdcythkwtwxtqlu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN!;

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }

async function appendTask(task: object) {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data } = await sb.from('family_data').select('value').eq('key', 'household_tasks').single();
  const existing = Array.isArray(data?.value) ? data.value : [];
  // Don't duplicate — check if same task text already open
  const text = (task as any).text;
  const alreadyOpen = existing.some((t: any) => !t.completed && t.text?.toLowerCase() === text?.toLowerCase());
  if (alreadyOpen) return { skipped: true };
  await sb.from('family_data').upsert(
    { key: 'household_tasks', value: [task, ...existing], updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  return { saved: true };
}

async function logPresence(entry: object) {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data } = await sb.from('family_data').select('value').eq('key', 'presence_log').single();
  const existing = Array.isArray(data?.value) ? data.value : [];
  await sb.from('family_data').upsert(
    { key: 'presence_log', value: [entry, ...existing.slice(0, 199)], updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
}

const EVENT_HANDLERS: Record<string, (body: Record<string, string>) => Promise<{ action: string; task?: object }>> = {
  person_arrived: async (body) => {
    await logPresence({ ts: Date.now(), person: body.person, event: 'arrived', area: body.area });
    return { action: 'presence_logged' };
  },

  person_left: async (body) => {
    await logPresence({ ts: Date.now(), person: body.person, event: 'left', area: body.area });
    return { action: 'presence_logged' };
  },

  package_delivered: async (_body) => {
    const task = { id: uid(), text: 'Bring in package from front door', person: 'Daddy', priority: 'High', category: 'General', dueEstimate: 'Today', dueDate: null, completed: false, createdAt: Date.now(), source: 'home_assistant' };
    const result = await appendTask(task);
    return { action: result.skipped ? 'duplicate_skipped' : 'task_created', task };
  },

  door_left_open: async (body) => {
    const task = { id: uid(), text: `Close ${body.area || 'door'} — left open`, person: 'Daddy', priority: 'High', category: 'General', dueEstimate: 'Today', dueDate: null, completed: false, createdAt: Date.now(), source: 'home_assistant' };
    const result = await appendTask(task);
    return { action: result.skipped ? 'duplicate_skipped' : 'task_created', task };
  },

  low_battery: async (body) => {
    const task = { id: uid(), text: `Replace battery in ${body.device || 'sensor'}`, person: 'Daddy', priority: 'Low', category: 'Maintenance', dueEstimate: 'This Week', dueDate: null, completed: false, createdAt: Date.now(), source: 'home_assistant' };
    const result = await appendTask(task);
    return { action: result.skipped ? 'duplicate_skipped' : 'task_created', task };
  },

  motion_detected: async (body) => {
    // Only log motion for now — don't create tasks for every motion event
    await logPresence({ ts: Date.now(), event: 'motion', area: body.area, device: body.device });
    return { action: 'motion_logged' };
  },

  wyze_alert: async (body) => {
    // Wyze cam alert → task if it's a meaningful alert (package, person, vehicle)
    const alertType = (body.alert_type || '').toLowerCase();
    if (alertType.includes('package') || alertType.includes('delivery')) {
      const task = { id: uid(), text: 'Package delivered — bring inside', person: 'Daddy', priority: 'High', category: 'General', dueEstimate: 'Today', dueDate: null, completed: false, createdAt: Date.now(), source: 'wyze' };
      const result = await appendTask(task);
      return { action: result.skipped ? 'duplicate_skipped' : 'task_created', task };
    }
    return { action: 'alert_logged' };
  },

  custom: async (body) => {
    if (!body.text) return { action: 'error: missing text for custom event' };
    const task = { id: uid(), text: body.text, person: body.person || 'Daddy', priority: body.priority || 'Medium', category: body.category || 'General', dueEstimate: body.dueEstimate || 'Today', dueDate: null, completed: false, createdAt: Date.now(), source: 'home_assistant' };
    const result = await appendTask(task);
    return { action: result.skipped ? 'duplicate_skipped' : 'task_created', task };
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, supported_events: Object.keys(EVENT_HANDLERS) });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers['x-webhook-token'] as string) || req.body?.token;
  if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) return res.status(401).json({ error: 'Unauthorized' });

  const event: string = req.body?.event;
  if (!event) return res.status(400).json({ error: 'Missing event type' });

  const handler_fn = EVENT_HANDLERS[event];
  if (!handler_fn) return res.status(400).json({ error: `Unknown event. Supported: ${Object.keys(EVENT_HANDLERS).join(', ')}` });

  try {
    const result = await handler_fn(req.body);
    return res.status(200).json({ ok: true, event, ...result });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
}
