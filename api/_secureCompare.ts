/**
 * Small shared helpers for handling secrets in Edge-compatible code.
 * Kept free of imports so any route can use them without pulling in
 * integration-specific modules.
 */
const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

/** Constant-time comparison for same-length strings; unequal lengths return false without throwing. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Compare two secrets of any length without leaking their length: hash both, then compare the digests. */
export async function secretsEqual(a: string, b: string): Promise<boolean> {
  return timingSafeEqual(await sha256Hex(a), await sha256Hex(b));
}
