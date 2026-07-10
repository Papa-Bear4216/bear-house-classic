/**
 * Hermes — Bear House Family Secretary (Edge Runtime)
 */
export const config = { runtime: 'edge' };

import { dbGet } from './_db.js';

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

const FAMILY = ['Daddy', 'Mommy', 'Abriana', 'Julia', 'Lucy', 'Family', 'General'];
const CATEGORIES = ['Shopping', 'Maintenance', 'Scheduling', 'Pet', 'Important Dates', 'General'];

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

async function callHaiku(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-3-5-haiku-latest', max_tokens: 512, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await res.json() as any;
  if (!res.ok) {
    throw new Error(data?.error?.message || `Claude API ${res.status}`);
  }
  return data?.content?.[0]?.text || '';
}

async function getRecentTasks(limit = 20) {
  const value = await dbGet('household_tasks');
  if (!value || !Array.isArray(value)) return [];
  return (value as any[]).filter((t: any) => !t.completed).slice(0, limit);
}

function isDuplicate(incoming: string, existing: any[]): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = norm(incoming);
  return existing.some(t => { const b = norm(t.text || t.name || ''); return a === b || a.includes(b) || b.includes(a); });
}

const ENRICH_PROMPT = (item: object, existingTasks: any[]) => `
You are Hermes, the Bear House family secretary. Enrich and validate this incoming item before saving.

INCOMING ITEM:
${JSON.stringify(item, null, 2)}

EXISTING OPEN TASKS (dedup check):
${existingTasks.map((t: any) => `- [${t.person}] ${t.text}`).join('\n') || 'none'}

FAMILY MEMBERS: ${FAMILY.join(', ')}
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

Rules: skip if very similar task exists. Assign Daddy for maintenance/car, Mommy for scheduling by default.
`.trim();

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') return j({ ok: true, agent: 'Hermes', status: 'ready' });
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN!;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  const body = await req.json().catch(() => ({})) as any;
  const token = req.headers.get('x-webhook-token') || body?.token;
  if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) return j({ error: 'Unauthorized' }, 401);

  const { item, type } = body;
  if (!item || !type) return j({ error: 'Missing item or type' }, 400);

  try {
    const existingTasks = await getRecentTasks();

    const text = item.text || item.name || '';
    if (isDuplicate(text, existingTasks)) return j({ action: 'skip', reason: 'Duplicate detected locally', item });

    let raw = '';
    const prompt = ENRICH_PROMPT(item, existingTasks);

    // 1. Try Gemini first if GEMINI_API_KEY is configured
    if (geminiKey) {
      try {
        raw = await callGemini(prompt, geminiKey);
      } catch (e: any) {
        console.warn('Gemini enrichment failed, trying Claude:', e.message);
      }
    }

    // 2. Call Claude if raw is still empty
    if (!raw && anthropicKey) {
      raw = await callHaiku(prompt, anthropicKey);
    }

    if (!raw) {
      throw new Error('No working AI model configurations found.');
    }

    const clean = raw.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
    const result = JSON.parse(clean);

    if (result.action === 'skip') return j({ action: 'skip', reason: result.reason, item });

    const enriched = { ...item, ...result.enriched, secretaryNote: result.enriched?.secretaryNote || '' };
    return j({ action: 'save', item: enriched });
  } catch (e: any) {
    return j({ action: 'save', item, secretaryError: e?.message });
  }
}

