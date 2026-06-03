import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pbiffzdcythkwtwxtqlu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN!;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function getSupabaseKey(supabase: ReturnType<typeof createClient>, key: string) {
  const { data, error } = await supabase.from('family_data').select('value').eq('key', key).single();
  if (error || !data) return null;
  return data.value;
}

async function setSupabaseKey(supabase: ReturnType<typeof createClient>, key: string, value: unknown) {
  await supabase.from('family_data').upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, message: 'Bear House calendar sync endpoint.' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers['x-webhook-token'] as string) || req.body?.token;
  if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const person = req.body?.person || 'Daddy';

  // Expect client to pass a short-lived Google access token
  // (obtained via OAuth in the browser and POSTed here)
  const { accessToken, calendarId } = req.body;
  if (!accessToken) return res.status(400).json({ error: 'accessToken required' });

  try {
    const events = await fetchCalendarEvents(accessToken, calendarId);

    // Load existing appointments, filter out old gcal ones, merge new
    const existing: any[] = (await getSupabaseKey(supabase, 'familyos_appointments')) || [];
    const nonGcal = existing.filter((a: any) => a.source !== 'google_calendar');
    const newAppointments = events.map((e: any) => googleEventToAppointment(e, person));
    const merged = [...newAppointments, ...nonGcal];

    await setSupabaseKey(supabase, 'familyos_appointments', merged);
    return res.status(200).json({ ok: true, synced: newAppointments.length });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Sync failed' });
  }
}
