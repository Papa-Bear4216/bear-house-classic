// Google Smart Home account linking starts with Google sending the user to
// /link/google-home?client_id=…&redirect_uri=…&state=…&response_type=code.
// If they're signed out, the Google sign-in round trip lands them back on "/",
// so the parameters are parked in sessionStorage (same tab) until they're
// signed in and can see the consent screen.
export type GoogleHomeLinkParams = { client_id: string; redirect_uri: string; state: string };

const KEY = 'google_home_link_params';
export const GOOGLE_HOME_LINK_PATH = '/link/google-home';

export function parseLinkParams(search: string): GoogleHomeLinkParams | null {
  const p = new URLSearchParams(search);
  const client_id = p.get('client_id');
  const redirect_uri = p.get('redirect_uri');
  const state = p.get('state');
  if (!client_id || !redirect_uri || !state || (p.get('response_type') ?? 'code') !== 'code') return null;
  return { client_id, redirect_uri, state };
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const defaultStore = (): Store | null => { try { return globalThis.sessionStorage ?? null; } catch { return null; } };

/** Call once at startup: if we're on the link URL, park its parameters. */
export function stashLinkParams(pathname: string, search: string, store: Store | null = defaultStore()): void {
  if (pathname !== GOOGLE_HOME_LINK_PATH || !store) return;
  const params = parseLinkParams(search);
  if (params) store.setItem(KEY, JSON.stringify(params));
}

export function readPendingLink(store: Store | null = defaultStore()): GoogleHomeLinkParams | null {
  try {
    const raw = store?.getItem(KEY);
    return raw ? (JSON.parse(raw) as GoogleHomeLinkParams) : null;
  } catch { return null; }
}

export function clearPendingLink(store: Store | null = defaultStore()): void {
  try { store?.removeItem(KEY); } catch { /* ignore */ }
}
