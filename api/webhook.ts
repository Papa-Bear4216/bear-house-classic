import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pbiffzdcythkwtwxtqlu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN!;

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type SupportedType = 'task' | 'bill' | 'shopping' | 'appointment' | 'reminder';

// Merge incoming data into the existing Supabase array for a given key
async function appendToKey(supabase: ReturnType<typeof createClient>, key: string, item: object) {
  const { data, error } = await supabase
    .from('family_data')
    .select('value')
    .eq('key', key)
    .single();

  const existing: object[] = (!error && Array.isArray(data?.value)) ? data.value : [];
  const updated = [item, ...existing];

  await supabase
    .from('family_data')
    .upsert({ key, value: updated, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

function buildTask(body: Record<string, string>) {
  return {
    id: uid(),
    text: body.text || body.title || 'Untitled task',
    person: body.person || 'Daddy',
    priority: (['High', 'Medium', 'Low'].includes(body.priority) ? body.priority : 'Medium'),
    category: body.category || 'General',
    dueEstimate: body.dueEstimate || 'No Deadline',
    dueDate: body.dueDate ? new Date(body.dueDate).getTime() : null,
    completed: false,
    createdAt: Date.now(),
    source: body.source || 'webhook',
  };
}

function buildBill(body: Record<string, string>) {
  return {
    id: uid(),
    name: body.name || body.text || 'Untitled bill',
    amount: parseFloat(body.amount) || 0,
    dueDate: body.dueDate ? new Date(body.dueDate).getTime() : null,
    paid: false,
    recurring: body.recurring === 'true',
    createdAt: Date.now(),
    source: body.source || 'webhook',
  };
}

function buildShoppingItem(body: Record<string, string>) {
  return {
    id: uid(),
    name: body.name || body.text || 'Untitled item',
    category: body.category || 'General',
    assignedTo: body.assignedTo || 'General',
    quantity: body.quantity || '1',
    completed: false,
    createdAt: Date.now(),
    source: body.source || 'webhook',
  };
}

function buildAppointment(body: Record<string, string>) {
  return {
    id: uid(),
    person: body.person || 'Daddy',
    type: body.type || 'General',
    doctor: body.doctor || body.provider || '',
    date: body.date ? new Date(body.date).getTime() : null,
    notes: body.notes || body.description || '',
    createdAt: Date.now(),
    source: body.source || 'webhook',
  };
}

const KEY_MAP: Record<SupportedType, string> = {
  task:        'household_tasks',
  bill:        'familyos_bills',
  shopping:    'familyos_shopping',
  appointment: 'familyos_appointments',
  reminder:    'household_tasks', // reminders map to tasks
};

const BUILDER_MAP: Record<SupportedType, (b: Record<string, string>) => object> = {
  task:        buildTask,
  bill:        buildBill,
  shopping:    buildShoppingItem,
  appointment: buildAppointment,
  reminder:    (b) => buildTask({ ...b, category: 'General', priority: 'High' }),
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow GET for quick connectivity test
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, message: 'Bear House webhook is live.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth — token can be in header OR body (for IFTTT compatibility)
  const token =
    (req.headers['x-webhook-token'] as string) ||
    req.body?.token;

  if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const type: SupportedType = req.body?.type;
  if (!type || !KEY_MAP[type]) {
    return res.status(400).json({
      error: 'Missing or invalid type. Must be: task | bill | shopping | appointment | reminder',
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const item = BUILDER_MAP[type](req.body);
    await appendToKey(supabase, KEY_MAP[type], item);
    return res.status(200).json({ ok: true, type, item });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}
