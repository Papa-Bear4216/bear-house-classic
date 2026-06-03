import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pbiffzdcythkwtwxtqlu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN!;
const BASE_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://bearhouseos.vercel.app';

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }

type ItemType = 'task' | 'bill' | 'shopping' | 'appointment' | 'reminder';

const KEY_MAP: Record<ItemType, string> = {
  task: 'household_tasks', bill: 'familyos_bills',
  shopping: 'familyos_shopping', appointment: 'familyos_appointments', reminder: 'household_tasks',
};

function buildItem(type: ItemType, body: Record<string, any>) {
  const base = { id: uid(), createdAt: Date.now(), source: body.source || 'webhook' };
  if (type === 'task' || type === 'reminder') return { ...base, text: body.text || 'Untitled', person: body.person || 'Daddy', priority: body.priority || 'Medium', category: body.category || 'General', dueEstimate: body.dueEstimate || 'No Deadline', dueDate: body.dueDate ? new Date(body.dueDate).getTime() : null, completed: false };
  if (type === 'bill') return { ...base, name: body.name || body.text || 'Untitled bill', amount: parseFloat(body.amount) || 0, dueDate: body.dueDate ? new Date(body.dueDate).getTime() : null, paid: false, recurring: body.recurring === 'true' };
  if (type === 'shopping') return { ...base, name: body.name || body.text || 'Untitled item', category: body.category || 'General', assignedTo: body.assignedTo || 'General', quantity: body.quantity || '1', completed: false };
  if (type === 'appointment') return { ...base, person: body.person || 'Daddy', type: body.type || 'General', doctor: body.doctor || '', date: body.date ? new Date(body.date).getTime() : null, notes: body.notes || '' };
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

async function appendToKey(supabase: ReturnType<typeof createClient>, key: string, item: object) {
  const { data } = await supabase.from('family_data').select('value').eq('key', key).single();
  const existing: object[] = Array.isArray(data?.value) ? data.value : [];
  await supabase.from('family_data').upsert({ key, value: [item, ...existing], updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, message: 'Bear House webhook + Hermes is live.' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers['x-webhook-token'] as string) || req.body?.token;
  if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) return res.status(401).json({ error: 'Unauthorized' });

  const type: ItemType = req.body?.type;
  if (!type || !KEY_MAP[type]) return res.status(400).json({ error: 'Invalid type. Use: task|bill|shopping|appointment|reminder' });

  const raw = buildItem(type, req.body);

  // Route through Hermes secretary
  const { action, item } = await runThroughSecretary(raw, type, token);
  if (action === 'skip') return res.status(200).json({ ok: true, action: 'skip', reason: (item as any).reason || 'duplicate' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await appendToKey(supabase, KEY_MAP[type], item);
  return res.status(200).json({ ok: true, action: 'saved', type, item });
}
