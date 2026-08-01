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
