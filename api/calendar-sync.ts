export const config = { runtime: 'edge' };

import { dbGet, dbSet, resolveHouseholdIdByWebhookToken } from './_db.js';

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Map Google Calendar event to bear-house appointment
function googleEventToAppointment(event: Record<string, any>, person: string) {
  const start = event.start?.dateTime || event.start?.date;
  return {
    id: `gcal-${event.id}`,
    person,
    type: 'Calendar',
    doctor: event.location || '',
    date: start ? new Date(start).getTime() : null,
    notes: event.description || '',
    title: event.summary || 'Untitled event',
    createdAt: Date.now(),
    source: 'google_calendar',
    gcalId: event.id,
  };
}

async function fetchCalendarEvents(accessToken: string, calendarId = 'primary') {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days ahead
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${now}&timeMax=${future}&singleEvents=true&orderBy=startTime&maxResults=50`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);
  const data = await res.json();
  return data.items || [];
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') return j({ ok: true, message: 'Bear House calendar sync endpoint.' });
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const body = await req.json().catch(() => ({})) as any;
  const token = req.headers.get('x-webhook-token') || body?.token;
  const householdId = await resolveHouseholdIdByWebhookToken(token);
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const { accessToken, person, calendarId } = body;
  if (!accessToken) return j({ error: 'accessToken required' }, 400);
  if (!person) return j({ error: 'person required' }, 400);

  try {
    const events = await fetchCalendarEvents(accessToken, calendarId);
    const existing: any[] = (await dbGet('familyos_appointments', householdId)) || [];
    const nonGcal = existing.filter((a: any) => a.source !== 'google_calendar');
    const newAppointments = events.map((e: any) => googleEventToAppointment(e, person));
    await dbSet('familyos_appointments', householdId, [...newAppointments, ...nonGcal]);
    return j({ ok: true, synced: newAppointments.length });
  } catch (e: any) {
    return j({ error: e?.message || 'Sync failed' }, 500);
  }
}
