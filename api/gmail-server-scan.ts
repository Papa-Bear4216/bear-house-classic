/**
 * Server-side Gmail scan for a household member — uses their stored
 * refresh token (api/_gmail.ts), NOT a client-passed access token. Callable
 * from background jobs (api/daily-brain.ts) or Hermes routes without that
 * member's browser being open. Read-only (gmail.readonly scope only).
 *
 * Deliberately narrow: same subject-line query shape as
 * api/gmail-suggestions.ts, but this file has no HTTP handler of its own —
 * it's imported and called directly, same pattern as daily-brain.ts's
 * relationship to finance-sync.ts.
 */
import { getMemberGmailAccessToken } from './_gmail.js';

const GMAIL_QUERIES = [
  'subject:(payment due OR bill due OR invoice OR amount due) newer_than:14d',
  'subject:(appointment OR reminder OR confirmation OR scheduled) newer_than:14d',
];

interface GmailHit { id: string; subject: string; date: string; from: string; snippet: string; }

async function fetchGmailMessages(accessToken: string, query: string, maxResults = 5): Promise<GmailHit[]> {
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) return [];
  const list = await listRes.json() as any;
  if (!list.messages?.length) return [];

  const messages = await Promise.all(
    list.messages.slice(0, maxResults).map(async (m: { id: string }) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!msgRes.ok) return null;
      const msg = await msgRes.json() as any;
      const hdrs: Record<string, string> = {};
      (msg.payload?.headers || []).forEach((h: { name: string; value: string }) => { hdrs[h.name] = h.value; });
      return { id: m.id, subject: hdrs.Subject || '', date: hdrs.Date || '', from: hdrs.From || '', snippet: msg.snippet || '' };
    })
  );
  return messages.filter(Boolean) as GmailHit[];
}

/** Returns recent bill/appointment-shaped emails for this member, or null
 * if they haven't connected Gmail / the grant was revoked. */
export async function scanMemberGmail(memberId: string): Promise<GmailHit[] | null> {
  const accessToken = await getMemberGmailAccessToken(memberId);
  if (!accessToken) return null;

  const all: GmailHit[] = [];
  for (const query of GMAIL_QUERIES) {
    all.push(...await fetchGmailMessages(accessToken, query));
  }
  return Array.from(new Map(all.map(h => [h.id, h])).values());
}
