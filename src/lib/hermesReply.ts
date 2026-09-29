// Turns a raw Hermes model reply into { text, actions }. The system prompt asks
// for `{"text": "...", "actions": []}` but models also wrap it in code fences,
// add prose around it, or get cut off by the token cap mid-object. In every one
// of those cases the user must see the conversational text — never raw JSON.
export type HermesReply<A = unknown> = { text: string; actions: A[] };

const FALLBACK = 'Sorry, that reply got cut off. Could you ask again?';

// First balanced {...} in s, ignoring braces inside strings.
function firstJsonObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

function fromObject<A>(o: unknown): HermesReply<A> | null {
  if (!o || typeof o !== 'object') return null;
  const { text, actions } = o as { text?: unknown; actions?: unknown };
  if (typeof text !== 'string') return null;
  return { text, actions: Array.isArray(actions) ? (actions as A[]) : [] };
}

// The model's actions are validated by the caller's action dispatcher; A is
// only the shape the caller expects them to have.
export function parseHermesReply<A = unknown>(raw: string): HermesReply<A> {
  const cleaned = raw.trim().replace(/```(?:json)?/gi, '').trim();

  try {
    const whole = fromObject<A>(JSON.parse(cleaned));
    if (whole) return whole;
    // A JSON string literal, e.g. "\"hello\"".
    const s = JSON.parse(cleaned);
    if (typeof s === 'string') return parseHermesReply<A>(s);
  } catch { /* fall through */ }

  const obj = firstJsonObject(cleaned);
  if (obj) {
    try {
      const found = fromObject<A>(JSON.parse(obj));
      if (found) return found;
    } catch { /* fall through */ }
  }

  // Cut off mid-object: salvage the text field, drop the (unreliable) actions.
  const m = cleaned.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (m) {
    let body = m[1];
    if (body.endsWith('\\')) body = body.slice(0, -1);
    try { return { text: JSON.parse(`"${body}"`), actions: [] }; } catch { /* fall through */ }
    return { text: body.replace(/\\n/g, '\n').replace(/\\"/g, '"'), actions: [] };
  }

  // Looks like JSON but has no usable text — never show it raw.
  if (/^[{[]/.test(cleaned)) return { text: FALLBACK, actions: [] };

  return { text: raw.trim(), actions: [] };
}
