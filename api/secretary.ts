/**
 * Hermes — Bear House Family Secretary
 *
 * Sits in front of every incoming data write (webhook, quick capture, IFTTT, Tasker).
 * Enriches, deduplicates, assigns, and proactively flags patterns.
 * Uses Claude Haiku for fast, cheap classification + enrichment.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pbiffzdcythkwtwxtqlu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN!;

const FAMILY = ['Daddy', 'Mommy', 'Abriana', 'Julia', 'Lucy', 'Family', 'General'];
const CATEGORIES = ['Shopping', 'Maintenance', 'Scheduling', 'Pet', 'Important Dates', 'General'];

async function callHaiku(prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  return data?.content?.[0]?.text || '';
}

async function getRecentTasks(supabase: ReturnType<typeof createClient>, limit = 20) {
  const { data } = await supabase.from('family_data').select('value').eq('key', 'household_tasks').single();
  if (!data?.value || !Array.isArray(data.value)) return [];
  return (data.value as any[]).filter(t => !t.completed).slice(0, limit);
}

function isDuplicate(incoming: string, existing: any[]): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = norm(incoming);
  return existing.some(t => {
    const b = norm(t.text || t.name || '');
    // Simple similarity: one contains the other, or they share 80%+ chars
    return a === b || a.includes(b) || b.includes(a);
  });
}

const ENRICH_PROMPT = (item: object, existingTasks: any[]) => `
You are Hermes, the Bear House family secretary. Your job is to enrich and validate an incoming item before saving it.

INCOMING ITEM:
${JSON.stringify(item, null, 2)}

EXISTING OPEN TASKS (for dedup check):
${existingTasks.map(t => `- [${t.person}] ${t.text}`).join('\n') || 'none'}

FAMILY MEMBERS: ${FAMILY.join(', ')}
CATEGORIES: ${CATEGORIES.join(', ')}

Return ONLY valid JSON with this exact shape (no markdown):
{
  "action": "save" | "skip",
  "reason": "why skip if skipping (duplicate/irrelevant)",
  "enriched": {
    "text": "cleaner, more actionable phrasing",
    "person": "best family member to assign this to",
    "priority": "High" | "Medium" | "Low",
    "category": "one of the categories above",
    "dueEstimate": "Today" | "This Week" | "This Month" | "No Deadline",
    "secretaryNote": "optional short note for the family (e.g. 'Car hasn\\'t been serviced in 3 months')"
  }
}

Rules:
- If very similar task already exists in the open list: action = "skip"
- Assign "Daddy" for home maintenance/car, "Mommy" for scheduling/appointments by default
- Be concise but keep all meaning
- secretaryNote only when genuinely useful context, otherwise empty string
`.trim();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, agent: 'Hermes', status: 'ready' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers['x-webhook-token'] as string) || req.body?.token;
  if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) return res.status(401).json({ error: 'Unauthorized' });

  const { item, type } = req.body;
  if (!item || !type) return res.status(400).json({ error: 'Missing item or type' });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const existingTasks = await getRecentTasks(supabase);

    // Quick local dedup before calling Claude
    const text = item.text || item.name || '';
    if (isDuplicate(text, existingTasks)) {
      return res.status(200).json({ action: 'skip', reason: 'Duplicate detected locally', item });
    }

    const raw = await callHaiku(ENRICH_PROMPT(item, existingTasks));
    const clean = raw.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
    const result = JSON.parse(clean);

    if (result.action === 'skip') {
      return res.status(200).json({ action: 'skip', reason: result.reason, item });
    }

    // Merge enriched fields back into original item
    const enriched = { ...item, ...result.enriched, secretaryNote: result.enriched?.secretaryNote || '' };
    return res.status(200).json({ action: 'save', item: enriched });

  } catch (e: any) {
    // If secretary fails, pass through original item unchanged
    return res.status(200).json({ action: 'save', item, secretaryError: e?.message });
  }
}
