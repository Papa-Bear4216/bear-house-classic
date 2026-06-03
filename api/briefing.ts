/**
 * /api/briefing
 * Generates a personalized morning briefing for a family member.
 * Called by Tasker at 7am — returns plain text the phone can speak or notify.
 *
 * GET  /api/briefing?token=TOKEN&person=Daddy
 * POST /api/briefing  { token, person }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pbiffzdcythkwtwxtqlu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN!;

const supabase = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getKey(key: string) {
  const { data } = await supabase().from('family_data').select('value').eq('key', key).single();
  return data?.value ?? [];
}

function isToday(ts: number | null | undefined): boolean {
  if (!ts) return false;
  const d = new Date(ts);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isOverdue(ts: number | null | undefined): boolean {
  if (!ts) return false;
  return ts < Date.now();
}

function isSoon(ts: number | null | undefined, days = 3): boolean {
  if (!ts) return false;
  return ts > Date.now() && ts < Date.now() + days * 86400000;
}

async function callHaiku(prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await res.json();
  return data?.content?.[0]?.text || '';
}

const BRIEF_PROMPT = (person: string, data: Record<string, any>, dayName: string) => `
You are Hermes, the Bear House family secretary. Generate a morning briefing for ${person}.
Today is ${dayName}.

DATA:
${JSON.stringify(data, null, 2)}

Write a concise, friendly morning briefing in plain text (no markdown, no bullet symbols).
Structure:
1. One-line good morning greeting with the day
2. Their tasks for today (max 4, most important first)
3. Any overdue tasks they own (max 2)
4. Upcoming bills due this week (if any)
5. Upcoming appointments (if any)
6. One family note if relevant (e.g. someone's birthday, school event)
7. Close with a short motivating line

Keep it under 150 words. Conversational, warm. Use first names. No bullet points — write in flowing sentences.
`.trim();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.method === 'GET'
    ? (req.query.token as string)
    : ((req.headers['x-webhook-token'] as string) || req.body?.token);

  if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) return res.status(401).json({ error: 'Unauthorized' });

  const person: string = (req.method === 'GET' ? (req.query.person as string) : req.body?.person) || 'Daddy';

  try {
    const [tasks, bills, appointments, promises] = await Promise.all([
      getKey('household_tasks'),
      getKey('familyos_bills'),
      getKey('familyos_appointments'),
      getKey('family_promises'),
    ]);

    const myTasks = (tasks as any[]).filter(t => !t.completed && (t.person === person || t.person === 'Family'));
    const todayTasks = myTasks.filter(t => isToday(t.dueDate) || t.dueEstimate === 'Today');
    const overdueTasks = myTasks.filter(t => t.dueDate && isOverdue(t.dueDate) && !isToday(t.dueDate));
    const upcomingBills = (bills as any[]).filter(b => !b.paid && b.dueDate && isSoon(b.dueDate, 7));
    const myAppts = (appointments as any[]).filter(a => a.person === person && a.date && isSoon(a.date, 3));
    const myPromises = (promises as any[]).filter(p => !p.completed && p.person === person && p.dueDate && isSoon(p.dueDate, 3));

    const data = {
      todayTasks: todayTasks.slice(0, 4).map(t => ({ text: t.text, priority: t.priority })),
      overdueTasks: overdueTasks.slice(0, 2).map(t => ({ text: t.text, daysPast: Math.floor((Date.now() - t.dueDate!) / 86400000) })),
      upcomingBills: upcomingBills.slice(0, 3).map(b => ({ name: b.name, amount: b.amount, dueDate: new Date(b.dueDate).toLocaleDateString() })),
      appointments: myAppts.slice(0, 2).map(a => ({ type: a.type, date: new Date(a.date).toLocaleDateString(), notes: a.notes })),
      promises: myPromises.slice(0, 2).map(p => ({ text: p.text })),
    };

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[new Date().getDay()];

    const briefing = await callHaiku(BRIEF_PROMPT(person, data, dayName));

    // Return as plain text for Tasker TTS / notification
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(briefing);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message });
  }
}
