'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';
const CACHE_KEY = 'bearhouse_gcal_events';
const TOKEN_KEY = 'bearhouse_gcal_token';
const TOKEN_EXPIRY_KEY = 'bearhouse_gcal_token_expiry';
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

export interface GCalEvent {
  id: string;
  title: string;
  date: string;       // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string;   // HH:mm
  calendarColor: string;
  calendarName: string;
  allDay: boolean;
}

function loadCached(): GCalEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const s = localStorage.getItem(CACHE_KEY);
    return s ? JSON.parse(s) : [];
  } catch { return []; }
}

function loadToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
    if (!token || !expiry) return null;
    if (Date.now() > parseInt(expiry)) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
      return null;
    }
    return token;
  } catch { return null; }
}

function saveToken(token: string, expiresIn: number) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_EXPIRY_KEY, (Date.now() + expiresIn * 1000 - 60000).toString());
}

export function useGoogleCalendar() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [gisReady, setGisReady] = useState(false);
  const [events, setEvents] = useState<GCalEvent[]>(() => loadCached());
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenClientRef = useRef<any>(null);
  const accessTokenRef = useRef<string | null>(null);

  const fetchAndStore = useCallback(async (token: string) => {
    setIsSyncing(true);
    setError(null);
    try {
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + 60);

      const listRes = await fetch(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=25',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (listRes.status === 401) {
        accessTokenRef.current = null;
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOKEN_EXPIRY_KEY);
        setIsSignedIn(false);
        setError('Session expired — please reconnect Google Calendar.');
        setIsSyncing(false);
        return;
      }
      if (!listRes.ok) throw new Error('Failed to fetch calendar list');
      const listData = await listRes.json();
      const calendars = (listData.items || []).filter((c: any) => c.selected !== false);

      const allEvents: GCalEvent[] = [];

      await Promise.all(
        calendars.map(async (cal: any) => {
          try {
            const res = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?` +
              new URLSearchParams({
                timeMin: now.toISOString(),
                timeMax: end.toISOString(),
                singleEvents: 'true',
                orderBy: 'startTime',
                maxResults: '250',
              }),
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!res.ok) return;
            const data = await res.json();

            for (const item of data.items || []) {
              const isAllDay = !!item.start?.date;
              const dateStr = isAllDay
                ? item.start.date
                : item.start?.dateTime?.split('T')[0];
              if (!dateStr) continue;

              let startTime: string | undefined;
              let endTime: string | undefined;
              if (!isAllDay && item.start?.dateTime) {
                startTime = new Date(item.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                endTime = new Date(item.end?.dateTime || item.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
              }

              allEvents.push({
                id: item.id,
                title: item.summary || '(No title)',
                date: dateStr,
                startTime,
                endTime,
                calendarColor: cal.backgroundColor || '#4285f4',
                calendarName: cal.summary || '',
                allDay: isAllDay,
              });
            }
          } catch { /* skip failing calendars */ }
        })
      );

      allEvents.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.startTime || '00:00').localeCompare(b.startTime || '00:00');
      });

      setEvents(allEvents);
      localStorage.setItem(CACHE_KEY, JSON.stringify(allEvents));
      setLastSynced(new Date());
    } catch (e: any) {
      setError(e.message || 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Load GIS script
  useEffect(() => {
    if (!CLIENT_ID) return;

    const existingToken = loadToken();
    if (existingToken) {
      accessTokenRef.current = existingToken;
      setIsSignedIn(true);
    }

    if ((window as any).google?.accounts?.oauth2) {
      setGisReady(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setGisReady(true);
    document.head.appendChild(script);
  }, []);

  // Init token client once GIS is ready
  useEffect(() => {
    if (!gisReady || !CLIENT_ID) return;
    tokenClientRef.current = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response: any) => {
        if (response.error) {
          setError(`Google auth error: ${response.error}`);
          return;
        }
        accessTokenRef.current = response.access_token;
        saveToken(response.access_token, response.expires_in);
        setIsSignedIn(true);
        fetchAndStore(response.access_token);
      },
    });
  }, [gisReady, fetchAndStore]);

  // Fetch on sign-in and set up auto-refresh interval
  useEffect(() => {
    if (!isSignedIn || !accessTokenRef.current) return;
    fetchAndStore(accessTokenRef.current);

    const interval = setInterval(() => {
      const token = loadToken();
      if (token) fetchAndStore(token);
    }, SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isSignedIn, fetchAndStore]);

  const signIn = useCallback(() => {
    setError(null);
    if (tokenClientRef.current) {
      tokenClientRef.current.requestAccessToken({ prompt: '' });
    }
  }, []);

  const signOut = useCallback(() => {
    if (accessTokenRef.current) {
      (window as any).google?.accounts?.oauth2?.revoke(accessTokenRef.current, () => {});
    }
    accessTokenRef.current = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    localStorage.removeItem(CACHE_KEY);
    setIsSignedIn(false);
    setEvents([]);
    setLastSynced(null);
  }, []);

  const sync = useCallback(() => {
    const token = loadToken();
    if (token) {
      accessTokenRef.current = token;
      fetchAndStore(token);
    } else if (tokenClientRef.current) {
      tokenClientRef.current.requestAccessToken({ prompt: '' });
    }
  }, [fetchAndStore]);

  return { isSignedIn, events, isSyncing, lastSynced, error, signIn, signOut, sync };
}
