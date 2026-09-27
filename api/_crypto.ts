/**
 * AES-GCM encrypt/decrypt for household-supplied API keys at rest.
 * Uses Web Crypto (available in Vercel Edge Functions, no Node crypto needed).
 * ENCRYPTION_KEY must be a 32-byte value, base64-encoded, set via env var.
 */
async function getCryptoKey(): Promise<CryptoKey> {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY is not configured');
  const keyBytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

/** Returns "<iv-base64>:<ciphertext-base64>" — stored as-is in the DB. */
export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(stored: string): Promise<string> {
  const [ivB64, ctB64] = stored.split(':');
  if (!ivB64 || !ctB64) throw new Error('Malformed encrypted secret');
  const key = await getCryptoKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivB64) },
    key,
    fromBase64(ctB64)
  );
  return new TextDecoder().decode(plaintext);
}

/** For display only — never send the real key back to the browser. */
export function maskKey(key: string): string {
  if (key.length <= 8) return '••••••';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

/**
 * HMAC-SHA256 sign/verify for the Gmail OAuth `state` param — a separate
 * secret from ENCRYPTION_KEY since signing and encryption are different
 * security domains. GMAIL_STATE_SECRET can be any length (HMAC, unlike
 * AES-GCM, doesn't require a fixed key size).
 */
async function getHmacKey(): Promise<CryptoKey> {
  const raw = process.env.GMAIL_STATE_SECRET;
  if (!raw) throw new Error('GMAIL_STATE_SECRET is not configured');
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(raw), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

/** Signs a short-lived (10 min) state payload for the Gmail OAuth flow. */
export async function signGmailState(payload: { memberId: string; householdId: string }): Promise<string> {
  const body = JSON.stringify({ ...payload, exp: Date.now() + 10 * 60 * 1000 });
  const key = await getHmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const sigB64 = toBase64(new Uint8Array(sig));
  return `${toBase64(new TextEncoder().encode(body))}.${sigB64}`;
}

/**
 * Verifies and decodes a signed Gmail OAuth state. Takes the RAW
 * (still URL-encoded) token and decodes internally — a malformed % escape
 * in a tampered/truncated token throws URIError, which must land inside
 * this try, not at the caller's call site, or "invalid state" becomes an
 * unhandled 500 instead of a clean redirect. Returns null if invalid,
 * tampered, expired, or malformed.
 */
export async function verifyGmailState(rawToken: string): Promise<{ memberId: string; householdId: string } | null> {
  try {
    const token = decodeURIComponent(rawToken);
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [bodyB64, sigB64] = parts;
    const key = await getHmacKey();
    const bodyBytes = fromBase64(bodyB64);
    const valid = await crypto.subtle.verify('HMAC', key, fromBase64(sigB64), bodyBytes);
    if (!valid) return null;
    const parsed = JSON.parse(new TextDecoder().decode(bodyBytes));
    if (typeof parsed.exp !== 'number' || Date.now() > parsed.exp) return null;
    if (!parsed.memberId || !parsed.householdId) return null;
    return { memberId: parsed.memberId, householdId: parsed.householdId };
  } catch {
    return null;
  }
}
