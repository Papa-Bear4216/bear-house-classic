/**
 * Hermes — Bear House Family Secretary (Edge Runtime)
 */
export const config = { runtime: 'edge' };

import { dbGet, resolveHouseholdIdByWebhookToken } from './_db.js';

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

const CATEGORIES = ['Shopping', 'Maintenance', 'Scheduling', 'Pet', 'Important Dates', 'General'];

async function callHaiku(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 512, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data?.error?.message || `Claude API ${res.status}`);
  return data?.content?.[0]?.text || '';
}

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 512 },
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

async function callAI(prompt: string, anthropicKey: string | undefined, geminiKey: string | undefined): Promise<string> {
  if (anthropicKey) {
    try {
      return await callHaiku(prompt, anthropicKey);
    } catch (e: any) {
      if (!geminiKey) throw e;
      console.warn('Claude failed, trying Gemini:', e.message);
    }
  }
  if (geminiKey) return await callGemini(prompt, geminiKey);
  throw new Error('No working AI model configurations found.');
}

async function getRecentTasks(householdId: string, limit = 20) {
  const value = await dbGet('household_tasks', householdId);
  if (!value || !Array.isArray(value)) return [];
  return (value as any[]).filter((t: any) => !t.completed).slice(0, limit);
}

function isDuplicate(incoming: string, existing: any[]): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = norm(incoming);
  return existing.some(t => { const b = norm(t.text || t.name || ''); return a === b || a.includes(b) || b.includes(a); });
}

const ENRICH_PROMPT = (item: object, existingTasks: any[], familyMembers: string[]) => `
You are Hermes, the Bear House family secretary. Enrich and validate this incoming item before saving.

INCOMING ITEM:
${JSON.stringify(item, null, 2)}

EXISTING OPEN TASKS (dedup check):
${existingTasks.map((t: any) => `- [${t.person}] ${t.text}`).join('\n') || 'none'}

FAMILY MEMBERS: ${familyMembers.join(', ')}
CATEGORIES: ${CATEGORIES.join(', ')}

Return ONLY valid JSON (no markdown):
{
  "action": "save" | "skip",
  "reason": "why skip if skipping",
  "enriched": {
    "text": "cleaner, more actionable phrasing",
    "person": "best family member",
    "priority": "High" | "Medium" | "Low",
    "category": "one of the categories",
    "dueEstimate": "Today" | "This Week" | "This Month" | "No Deadline",
    "secretaryNote": "optional short context note or empty string"
  }
}

Rules: skip if very similar task exists. Default to the first family member for maintenance/car, the second for scheduling, unless the item clearly names someone else.
`.trim();

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') return j({ ok: true, agent: 'Hermes', status: 'ready' });
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  const body = await req.json().catch(() => ({})) as any;
  const token = req.headers.get('x-webhook-token') || body?.token;
  const householdId = await resolveHouseholdIdByWebhookToken(token);
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const { item, type, familyMembers } = body;
  if (!item || !type) return j({ error: 'Missing item or type' }, 400);
  const members: string[] = Array.isArray(familyMembers) && familyMembers.length > 0
    ? familyMembers
    : ['Family', 'General'];

  try {
    const existingTasks = await getRecentTasks(householdId);

    const text = item.text || item.name || '';
    if (isDuplicate(text, existingTasks)) return j({ action: 'skip', reason: 'Duplicate detected locally', item });

    const raw = await callAI(ENRICH_PROMPT(item, existingTasks, members), anthropicKey, geminiKey);
    const clean = raw.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
    const result = JSON.parse(clean);

    if (result.action === 'skip') return j({ action: 'skip', reason: result.reason, item });

    const enriched = { ...item, ...result.enriched, secretaryNote: result.enriched?.secretaryNote || '' };
    return j({ action: 'save', item: enriched });
  } catch (e: any) {
    return j({ action: 'save', item, secretaryError: e?.message });
  }
}
