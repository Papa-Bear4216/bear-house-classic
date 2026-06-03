/**
 * /api/walmart
 * Walmart order parsing via Gmail + smart shopping list management.
 * Also handles Google Home / Alexa add-to-list webhooks.
 *
 * POST /api/walmart { token, accessToken, person }  → scan Gmail for Walmart orders
 * POST /api/walmart { token, action: 'add', items: [...] }  → add items directly (voice assistant)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pbiffzdcythkwtwxtqlu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN!;

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }

async function getShoppingList() {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data } = await sb.from('family_data').select('value').eq('key', 'familyos_shopping').single();
  return Array.isArray(data?.value) ? data.value : [];
}

async function saveShoppingList(items: object[]) {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await sb.from('family_data').upsert({ key: 'familyos_shopping', value: items, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

async function fetchGmailWalmart(accessToken: string) {
  const queries = [
    'from:@walmart.com subject:(order shipped OR delivered OR confirmation) newer_than:14d',
    'from:@walmart.com subject:(pickup ready OR curbside) newer_than:7d',
  ];
  const all: any[] = [];
  for (const q of queries) {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=5`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) continue;
    const list = await res.json();
    for (const m of list.messages || []) {
      const msg = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!msg.ok) continue;
      const data = await msg.json();
      const subject = data.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || '';
      all.push({ id: m.id, subject, snippet: data.snippet || '' });
    }
  }
  return all;
}

async function parseWalmartEmails(emails: any[], person: string): Promise<any[]> {
  if (!emails.length) return [];
  const prompt = `Parse these Walmart emails and extract a shopping list of items to restock based on what was recently ordered.

EMAILS:
${emails.map((e, i) => `${i + 1}. ${e.subject}: ${e.snippet}`).join('\n')}

Return ONLY a JSON array of items to consider restocking (things commonly reordered):
[{"name": "item name", "category": "Groceries|Household|Personal|Other", "quantity": "1", "reason": "ordered 2 weeks ago"}]

Max 6 items. Skip electronics, one-time purchases, clothing. Focus on consumables.
Return [] if nothing relevant.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 512, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await res.json();
  const raw = (data?.content?.[0]?.text || '[]').replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
  const match = raw.match(/\[[\s\S]*\]/);
  return match ? JSON.parse(match[0]) : [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'Bear House Walmart + Voice Assistant bridge' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers['x-webhook-token'] as string) || req.body?.token;
  if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) return res.status(401).json({ error: 'Unauthorized' });

  const { action, accessToken, person, items: incomingItems } = req.body;

  // Direct add — from Google Home / Alexa / voice assistant webhook
  if (action === 'add' && incomingItems) {
    const existing = await getShoppingList();
    const existingNames = existing.map((i: any) => (i.name || '').toLowerCase());
    const newItems = (Array.isArray(incomingItems) ? incomingItems : [incomingItems])
      .filter((name: string) => !existingNames.includes(name.toLowerCase()))
      .map((name: string) => ({ id: uid(), name, category: 'General', assignedTo: person || 'General', quantity: '1', completed: false, createdAt: Date.now(), source: 'voice_assistant' }));
    await saveShoppingList([...newItems, ...existing]);
    return res.status(200).json({ ok: true, added: newItems.length, items: newItems });
  }

  // Gmail scan for restock suggestions
  if (accessToken) {
    try {
      const emails = await fetchGmailWalmart(accessToken);
      const suggestions = await parseWalmartEmails(emails, person || 'Family');
      return res.status(200).json({ ok: true, suggestions, emailsScanned: emails.length });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message });
    }
  }

  return res.status(400).json({ error: 'Provide accessToken (Gmail scan) or action:add with items (voice assistant)' });
}
