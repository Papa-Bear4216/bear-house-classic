export const config = { runtime: 'edge' };

import { dbGet, dbSet, dbPrepend, resolveHouseholdIdByWebhookToken } from './_db.js';
import { notifyIFTTT } from './_notify.js';

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
const BASE_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.hotmessexpress.lol';

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }

type ItemType = 'task' | 'bill' | 'shopping' | 'appointment' | 'reminder' | 'nfc';

const KEY_MAP: Record<ItemType, string> = {
  task: 'household_tasks', bill: 'familyos_bills',
  shopping: 'familyos_shopping', appointment: 'familyos_appointments',
  reminder: 'household_tasks', nfc: 'nfc_completion_log',
};

// NFC tag → default chore text
const NFC_TAG_DEFAULTS: Record<string, string> = {
  kitchen_sink: 'Dishes done', trash_can: 'Trash taken out',
  laundry: 'Laundry moved / started', medicine: 'Medication taken',
  front_door: 'Checked in at front door', dog_bowl: 'Fed Lucy',
  vacuum: 'Vacuumed', dishwasher: 'Unloaded dishwasher',
};

function buildItem(type: ItemType, body: Record<string, any>) {
  const base = { id: uid(), createdAt: Date.now(), source: body.source || 'webhook' };
  if (type === 'task' || type === 'reminder') return { ...base, text: body.text || 'Untitled', person: body.person || 'General', priority: body.priority || 'Medium', category: body.category || 'General', dueEstimate: body.dueEstimate || 'No Deadline', dueDate: body.dueDate ? new Date(body.dueDate).getTime() : null, completed: false };
  if (type === 'bill') return { ...base, name: body.name || body.text || 'Untitled bill', amount: parseFloat(body.amount) || 0, dueDate: body.dueDate ? new Date(body.dueDate).getTime() : null, paid: false, recurring: body.recurring === 'true' };
  if (type === 'shopping') return { ...base, name: body.name || body.text || 'Untitled item', category: body.category || 'General', assignedTo: body.assignedTo || 'General', quantity: body.quantity || '1', completed: false };
  if (type === 'appointment') return { ...base, person: body.person || 'General', type: body.type || 'General', doctor: body.doctor || '', date: body.date ? new Date(body.date).getTime() : null, notes: body.notes || '' };
  return base;
}

async function runThroughSecretary(item: object, type: string, token: string): Promise<{ action: string; item: object }> {
  try {
    const res = await fetch(`${BASE_URL}/api/secretary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-token': token },
      body: JSON.stringify({ item, type }),
    });
    if (!res.ok) return { action: 'save', item };
    return await res.json();
  } catch {
    return { action: 'save', item };
  }
}

async function appendToKey(householdId: string, key: string, item: object) {
  await dbPrepend(key, householdId, item);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') return j({ ok: true, message: 'Bear House webhook + Hermes is live.' });
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const body = await req.json().catch(() => ({})) as any;
  const token = req.headers.get('x-webhook-token') || body?.token;
  const householdId = await resolveHouseholdIdByWebhookToken(token);
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const type: ItemType = body?.type;
  if (!type || !KEY_MAP[type]) return j({ error: 'Invalid type. Use: task|bill|shopping|appointment|reminder|nfc' }, 400);

  if (type === 'nfc') {
    const { action: nfcAction = 'log', taskId, tagName, person = 'Family', text: nfcText } = body;
    const logText = nfcText || (tagName ? NFC_TAG_DEFAULTS[tagName] : null) || `NFC tap: ${tagName || 'unknown'}`;

    if (nfcAction === 'complete' && taskId) {
      const tasks: any[] = (await dbGet('household_tasks', householdId)) ?? [];
      const updated = tasks.map((t: any) => t.id === taskId ? { ...t, completed: true, completedAt: Date.now(), completedBy: person } : t);
      await dbSet('household_tasks', householdId, updated);
    }

    await appendToKey(householdId, 'nfc_completion_log', { id: uid(), text: logText, person, tagName: tagName || null, ts: Date.now(), nfcAction });
    return j({ ok: true, action: 'logged', text: logText, person });
  }

  const raw = buildItem(type, body);
  const { action, item } = await runThroughSecretary(raw, type, token);
  if (action === 'skip') return j({ ok: true, action: 'skip', reason: (item as any).reason || 'duplicate' });

  await appendToKey(householdId, KEY_MAP[type], item);
  if (body?.notify) await notifyIFTTT(`bearhouse_${type}`, (item as any).text || (item as any).name || 'New item', (item as any).person || '');
  return j({ ok: true, action: 'saved', type, item });
}
