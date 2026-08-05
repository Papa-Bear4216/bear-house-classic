/**
 * Server-side Gmail access helper. Exchanges a member's stored (encrypted)
 * refresh token for a short-lived access token on demand — refresh tokens
 * don't expire (until revoked), so this is what lets a background job or
 * Hermes route read a member's Gmail without their browser being open.
 *
 * PRIVACY: this token belongs to ONE member. Anything read using it is that
 * member's personal inbox data — never fan it out to household-shared
 * storage (household_memory, etc). See gmail-server-scan.ts's header for
 * the full boundary.
 */
import { dbGetMemberGmailToken } from './_db.js';
import { decryptSecret } from './_crypto.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Returns a fresh access token for this member, or null if not connected
 * or the grant has been revoked (caller should treat null as "not connected"). */
export async function getMemberGmailAccessToken(memberId: string): Promise<string | null> {
  const stored = await dbGetMemberGmailToken(memberId);
  if (!stored) return null;

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  let refreshToken: string;
  try {
    refreshToken = await decryptSecret(stored.encryptedRefreshToken);
  } catch {
    return null;
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) return null; // revoked or expired — caller treats as disconnected

  const data = await res.json() as any;
  return data.access_token || null;
}
