import type { NativeCalendar, NativeCalendarEvent } from './calendar-plugin';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const CAL_API = 'https://www.googleapis.com/calendar/v3';

function loadGIS(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('Server-side'));
    if ((window as any).google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google Sign-In script'));
    document.head.appendChild(s);
  });
}

export async function gcalSignIn(): Promise<string> {
  await loadGIS();
  return new Promise((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp: any) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        resolve(resp.access_token as string);
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}

async function gfetch(token: string, url: string) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Google API ${r.status}`);
  }
  return r.json();
}

export async function gcalGetCalendars(token: string): Promise<NativeCalendar[]> {
  const data = await gfetch(token, `${CAL_API}/users/me/calendarList?minAccessRole=reader`);
  return (data.items || []).map((item: any) => ({
    id: item.id as string,
    name: item.summary as string,
    account: item.id as string,
    color: item.backgroundColor ? parseInt(item.backgroundColor.replace('#', ''), 16) : 0x4285f4,
  }));
}

function isoToDate(iso: string): string {
  return iso.slice(0, 10);
}

function isoToTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export async function gcalGetEvents(token: string, calendarId?: string): Promise<NativeCalendarEvent[]> {
  const id = calendarId || 'primary';
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  });
  const data = await gfetch(token, `${CAL_API}/calendars/${encodeURIComponent(id)}/events?${params}`);
  return (data.items || []).map((item: any) => {
    const allDay = Boolean(item.start?.date && !item.start?.dateTime);
    const date = allDay ? item.start.date : isoToDate(item.start.dateTime);
    const startTime = allDay ? '00:00' : isoToTime(item.start.dateTime);
    const endTime = allDay
      ? '23:59'
      : item.end?.dateTime
      ? isoToTime(item.end.dateTime)
      : startTime;
    return {
      id: item.id as string,
      title: item.summary || '(no title)',
      date,
      startTime,
      endTime,
      calendarId: id,
      allDay,
    } satisfies NativeCalendarEvent;
  });
}
