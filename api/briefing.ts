export const config = { runtime: 'edge' };

/**
 * /api/briefing
 * Generates a personalized morning briefing for a family member.
 * Called by Tasker at 7am — returns plain text the phone can speak or notify.
 *
 * GET  /api/briefing?token=TOKEN&person=Daddy
 * POST /api/briefing  { token, person }
 */

import { dbGet, soleHouseholdId } from './_db.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN!;

async function getKey(key: string, householdId: string) {
  return (await dbGet(key, householdId)) ?? [];
}

function isToday(ts: number | null | undefined): boolean {
  if (!ts) return false;
  const d = new Date(ts), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function isOverdue(ts: number | null | undefined): boolean {
  if (!ts) return false;
  return ts < Date.now();
}

function isSoon(ts: number | null | undefined, days = 3): boolean {
  if (!ts) return false;
  return ts > Date.now() && ts < Date.now() + days * 86400000;
}

function isTomorrow(ts: number | null | undefined): boolean {
  if (!ts) return false;
  const d = new Date(ts);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  return d.getFullYear() === tomorrow.getFullYear() && d.getMonth() === tomorrow.getMonth() && d.getDate() === tomorrow.getDate();
}

async function callHaiku(prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Claude API ${res.status}`);
  return data?.content?.[0]?.text || '';
}

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 600 },
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 150)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function generateBriefing(prompt: string): Promise<string> {
  if (ANTHROPIC_API_KEY) {
    try {
      return await callHaiku(prompt);
    } catch (e: any) {
      if (!GEMINI_API_KEY) throw e;
      console.warn('Claude briefing failed, trying Gemini:', e.message);
    }
  }
  if (GEMINI_API_KEY) return await callGemini(prompt);
  throw new Error('No working AI model configurations found.');
}

const BRIEF_PROMPT = (person: string, data: Record<string, any>, dayName: string) => `
You are Hermes, the Bear House family secretary. Generate a morning briefing for ${person}.
Today is ${dayName}.

DATA:
${JSON.stringify(data, null, 2)}

Write a concise, friendly morning briefing in plain text (no markdown, no bullet symbols).
Structure:
1. Good morning greeting with day + quick weather mention if available (temp + brief condition)
2. Their tasks for today (max 4, most important first)
3. Any overdue tasks they own (max 2)
4. Upcoming bills due this week (if any)
5. Upcoming appointments (if any)
6. Weather heads-up if rain/storms coming (umbrella reminder, etc.)
7. Close with a short motivating line

Keep it under 170 words. Conversational, warm. Use first names. No bullet points — write in flowing sentences.
`.trim();

const EVENING_PROMPT = (person: string, data: Record<string, any>, tomorrowDay: string) => `
You are Hermes, the Bear House family secretary. Generate an evening wrap-up for ${person}.
Tomorrow is ${tomorrowDay}.

DATA:
${JSON.stringify(data, null, 2)}

Write a brief, warm evening summary in plain text (no markdown, no bullets).
1. One opening line reflecting on the day
2. Wins: what got done today (max 3 items, acknowledge effort)
3. Tomorrow's priorities (max 3 items with person assigned)
4. Any urgent bills or appointments for tomorrow
5. A brief gentle note about anyone showing stress/negative emotions (if flagged)
6. Warm goodnight closing

Under 130 words. Flowing sentences, no bullet points. First names only.
`.trim();

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const isGet = req.method === 'GET';
  const bodyData = isGet ? {} : await req.json().catch(() => ({})) as any;

  const token = isGet ? url.searchParams.get('token') : (req.headers.get('x-webhook-token') || bodyData?.token);
  if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const person: string | null = isGet ? url.searchParams.get('person') : bodyData?.person;
  if (!person) return new Response(JSON.stringify({ error: 'person required' }), { status: 400 });
  const briefType: string = (isGet ? url.searchParams.get('type') : bodyData?.type) || 'morning';

  try {
    const householdId = await soleHouseholdId();
    const [tasks, bills, appointments, promises, weatherRaw] = await Promise.all([
      getKey('household_tasks', householdId),
      getKey('familyos_bills', householdId),
      getKey('familyos_appointments', householdId),
      getKey('family_promises', householdId),
      getKey('weather_cache', householdId),
    ]);

    const weather = weatherRaw as any;
    const weatherSummary = weather?.today ? {
      temp: weather.current?.temp,
      condition: weather.today.shortForecast,
      precipChance: weather.today.precipChance,
      alerts: (weather.alerts || []).map((a: any) => a.headline).filter(Boolean),
    } : null;

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
      weather: weatherSummary,
    };

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[new Date().getDay()];
    const tomorrowName = days[new Date(Date.now() + 86400000).getDay()];

    let briefing: string;

    if (briefType === 'evening') {
      // Evening briefing — pull extra data
      const NEGATIVE = ['Frustration', 'Concern', 'Anxiety', 'Confusion'];
      const emotions: any[] = await getKey('emotion_logs', householdId) as any[];
      const todayEmotions = (emotions as any[]).filter((e: any) => isToday(e.createdAt));
      const moodFlags = todayEmotions.filter((e: any) => NEGATIVE.includes(e.category));
      const completedToday = (tasks as any[]).filter((t: any) => t.completed && t.completedAt && isToday(t.completedAt));
      const tomorrowTasks = (tasks as any[]).filter((t: any) =>
        !t.completed && (
          (t.dueDate && isTomorrow(t.dueDate)) || t.dueEstimate === 'Today'
        )
      );
      const urgentBills = (bills as any[]).filter((b: any) => !b.paid && b.dueDate && (b.dueDate - Date.now()) < 3 * 86400000 && b.dueDate > Date.now());

      const eveningData = {
        completedToday: completedToday.slice(0, 5).map((t: any) => t.text),
        stillOpenToday: todayTasks.slice(0, 3).map((t: any) => ({ text: t.text, person: t.person })),
        tomorrowTasks: tomorrowTasks.slice(0, 4).map((t: any) => ({ text: t.text, person: t.person, priority: t.priority })),
        urgentBills: urgentBills.slice(0, 2).map((b: any) => ({ name: b.name, amount: b.amount })),
        tomorrowAppts: myAppts.filter((a: any) => isTomorrow(a.date)).slice(0, 2).map((a: any) => ({ type: a.type, notes: a.notes })),
        moodFlags: moodFlags.slice(0, 2).map((e: any) => ({ person: e.person, category: e.category })),
      };
      briefing = await generateBriefing(EVENING_PROMPT(person, eveningData, tomorrowName));
    } else {
      briefing = await generateBriefing(BRIEF_PROMPT(person, data, dayName));
    }

    return new Response(briefing, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: (e as any)?.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
