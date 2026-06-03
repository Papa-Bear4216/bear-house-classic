// Google OAuth helpers for Bear House
// Scopes: identity + Gmail readonly + Calendar readonly

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// ── Token storage (sessionStorage — cleared on tab/app close) ─────────────────

export function setGoogleToken(token: string, expiresIn: number) {
  const exp = Date.now() + expiresIn * 1000;
  sessionStorage.setItem('bearhouse_google_token', token);
  sessionStorage.setItem('bearhouse_google_token_exp', String(exp));
}

export function getGoogleToken(): string | null {
  const token = sessionStorage.getItem('bearhouse_google_token');
  const exp = Number(sessionStorage.getItem('bearhouse_google_token_exp') || '0');
  if (!token || Date.now() > exp) return null;
  return token;
}

export function clearGoogleToken() {
  sessionStorage.removeItem('bearhouse_google_token');
  sessionStorage.removeItem('bearhouse_google_token_exp');
}

// ── JWT decode (no verify — we trust Google's response) ───────────────────────

export function decodeGoogleJWT(credential: string): { email: string; name: string; picture: string } | null {
  try {
    const payload = credential.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return { email: decoded.email || '', name: decoded.name || '', picture: decoded.picture || '' };
  } catch {
    return null;
  }
}

// ── User matching ──────────────────────────────────────────────────────────────

import { USERS } from '@/lib/familyos';

export function matchUserByEmail(email: string) {
  return USERS.find(u => u.email?.toLowerCase() === email.toLowerCase()) || null;
}

// ── Google Token Client (for requesting access token with scopes) ──────────────

export function requestAccessToken(callback: (token: string) => void, errorCallback: (err: any) => void) {
  const google = (window as any).google;
  if (!google?.accounts?.oauth2) {
    errorCallback(new Error('Google Identity Services not loaded'));
    return;
  }
  const client = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: GOOGLE_SCOPES,
    callback: (resp: any) => {
      if (resp.error) { errorCallback(resp); return; }
      setGoogleToken(resp.access_token, resp.expires_in || 3600);
      callback(resp.access_token);
    },
  });
  client.requestAccessToken();
}
