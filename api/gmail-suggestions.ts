/**
 * Gmail → Bear House suggestions
 * Reads the signed-in user's Gmail for actionable items:
 * bills, appointments, school notices, Amazon orders, etc.
 * Returns structured suggestions for the user to approve.
 */
export const config = { runtime: 'edge' };

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

async function fetchGmailMessages(accessToken: string, query: string, maxResults = 10) {
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) throw new Error(`Gmail list error: ${listRes.status}`);
  const list = await listRes.json();
  if (!list.messages?.length) return [];

  // Fetch snippet + subject + date for each message
  const messages = await Promise.all(
    list.messages.slice(0, maxResults).map(async (m: { id: string }) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!msgRes.ok) return null;
      const msg = await msgRes.json();
      const headers: Record<string, string> = {};
      (msg.payload?.headers || []).forEach((h: { name: string; value: string }) => {
        headers[h.name] = h.value;
      });
      return { id: m.id, subject: headers.Subject || '', date: headers.Date || '', from: headers.From || '', snippet: msg.snippet || '' };
    })
  );
  return messages.filter(Boolean);
}

const PARSE_PROMPT = (emails: any[], person: string) => `
You are Hermes, the Bear House family secretary. Analyze these emails for ${person} and extract actionable items.

EMAILS:
${emails.map((e, i) => `${i + 1}. FROM: ${e.from}\n   SUBJECT: ${e.subject}\n   DATE: ${e.date}\n   PREVIEW: ${e.snippet}`).join('\n\n')}

Extract items that need action. Return ONLY valid JSON array (no markdown):
[
  {
    "type": "bill" | "appointment" | "task" | "shopping" | "reminder",
    "text": "clear action description",
    "person": "${person}",
    "priority": "High" | "Medium" | "Low",
    "dueEstimate": "Today" | "This Week" | "This Month" | "No Deadline",
    "amount": number or null,
    "source": "email subject",
    "from": "sender name",
    "dueDate": "ISO date string or null"
  }
]

Rules:
- "payment due", "invoice", "bill", "statement" → bill type
- "appointment", "reminder", "scheduled", "confirmation" → appointment
- "your order", "shipped", "delivered" → task (confirm receipt / put away)
- "unsubscribe" / newsletters / promotions → skip entirely
- Return [] if nothing actionable found
- Maximum 8 items
`.trim();

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1024 },
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 150)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
}

async function callHaiku(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-3-5-haiku-latest', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Claude API ${res.status}`);
  }
  return data?.content?.[0]?.text || '[]';
}

async function callAI(prompt: string): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (geminiKey) {
    try {
      return await callGemini(prompt, geminiKey);
    } catch (e: any) {
      console.warn('Gemini gmail-suggestions failed, trying Claude:', e.message);
    }
  }

  if (anthropicKey) {
    return await callHaiku(prompt, anthropicKey);
  }

  throw new Error('No working AI model configurations found.');
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const body = await req.json().catch(() => ({})) as any;
  const { accessToken, person } = body;
  if (!accessToken) return j({ error: 'accessToken required' }, 400);

  const GMAIL_QUERIES = [
    'subject:(payment due OR bill due OR invoice OR amount due) newer_than:14d',
    'subject:(appointment OR reminder OR confirmation OR scheduled) newer_than:14d',
    'subject:(your order OR shipped OR delivered OR Amazon) newer_than:7d',
  ];

  try {
    const allEmails: any[] = [];
    for (const query of GMAIL_QUERIES) {
      const msgs = await fetchGmailMessages(accessToken, query, 5);
      allEmails.push(...msgs);
    }

    if (allEmails.length === 0) return j({ suggestions: [] });

    const unique = Array.from(new Map(allEmails.map((e: any) => [e.id, e])).values());
    const raw = await callAI(PARSE_PROMPT(unique, person || 'Daddy'));
    const clean = raw.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
    const arrMatch = clean.match(/\[[\s\S]*\]/);
    const suggestions = arrMatch ? JSON.parse(arrMatch[0]) : [];

    return j({ suggestions, emailsScanned: unique.length });
  } catch (e: any) {
    return j({ error: e?.message || 'Gmail scan failed' }, 500);
  }
}
