/**
 * /api/walmart
 * Walmart order parsing via Gmail + smart shopping list management.
 * Also handles Google Home / Alexa add-to-list webhooks.
 *
 * POST /api/walmart { token, accessToken, person }  → scan Gmail for Walmart orders
 * POST /api/walmart { token, action: 'add', items: [...] }  → add items directly (voice assistant)
 */
export const config = { runtime: 'edge' };

import { dbGet, dbSet, resolveHouseholdIdByWebhookToken } from './_db.js';
import { parseBody, WalmartBodySchema } from './_schemas.js';

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }

async function getShoppingList(householdId: string) {
  const value = await dbGet('familyos_shopping', householdId);
  return Array.isArray(value) ? value : [];
}

async function saveShoppingList(householdId: string, items: object[]) {
  await dbSet('familyos_shopping', householdId, items);
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
${emails.map((e: any, i: number) => `${i + 1}. ${e.subject}: ${e.snippet}`).join('\n')}

Return ONLY a JSON array of items to consider restocking (things commonly reordered):
[{"name": "item name", "category": "Groceries|Household|Personal|Other", "quantity": "1", "reason": "ordered 2 weeks ago"}]

Max 6 items. Skip electronics, one-time purchases, clothing. Focus on consumables.
Return [] if nothing relevant.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 512, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await res.json();
  const raw = (data?.content?.[0]?.text || '[]').replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
  const match = raw.match(/\[[\s\S]*\]/);
  return match ? JSON.parse(match[0]) : [];
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') return j({ ok: true, service: 'Bear House Walmart + Voice Assistant bridge' });
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const rawBody = await req.json().catch(() => ({})) as any;
  const token = req.headers.get('x-webhook-token') || rawBody?.token;
  const householdId = await resolveHouseholdIdByWebhookToken(token);
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const parsed = parseBody(WalmartBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { action, accessToken, person, items: incomingItems } = parsed.data;

  if (action === 'add' && incomingItems) {
    const existing = await getShoppingList(householdId);
    const existingNames = (existing as any[]).map((i: any) => (i.name || '').toLowerCase());
    const newItems = (Array.isArray(incomingItems) ? incomingItems : [incomingItems])
      .filter((name: string) => !existingNames.includes(name.toLowerCase()))
      .map((name: string) => ({ id: uid(), name, category: 'General', assignedTo: person || 'General', quantity: '1', completed: false, createdAt: Date.now(), source: 'voice_assistant' }));
    await saveShoppingList(householdId, [...newItems, ...(existing as any[])]);
    return j({ ok: true, added: newItems.length, items: newItems });
  }

  if (accessToken) {
    try {
      const emails = await fetchGmailWalmart(accessToken);
      const suggestions = await parseWalmartEmails(emails, person || 'Family');
      return j({ ok: true, suggestions, emailsScanned: emails.length });
    } catch (e: any) {
      return j({ error: e?.message }, 500);
    }
  }

  return j({ error: 'Provide accessToken (Gmail scan) or action:add with items' }, 400);
}
