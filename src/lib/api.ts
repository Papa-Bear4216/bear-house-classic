// Single source of truth for which backend the app talks to.
//
// On the web (www.hotmessexpress.lol) the frontend and the /api/* serverless
// functions share an origin, so relative fetch('/api/...') calls "just work".
// Inside the packaged native app (Capacitor), the webview has its own local
// origin and no /api of its own — every request has to be pointed explicitly
// at the one deployed backend, or it 404s.
//
// VITE_API_BASE_URL lets you override this per-build (e.g. a staging
// deployment) without touching code; it defaults to the production backend.
export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://www.hotmessexpress.lol';

/** Builds an absolute URL for a backend API route, e.g. apiUrl('/api/chat'). */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
