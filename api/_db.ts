/**
 * Supabase REST helpers — no SDK, pure fetch, works in Edge Functions.
 * Underscore prefix means Vercel won't expose this as a route.
 *
 * Server-only code (never bundled to the browser), so this uses the
 * service_role key to bypass RLS — same trust boundary as api/data-write.ts.
 * The anon key can no longer write since RLS was locked down (see
 * docs/fix-family-data-rls.sql).
 */
const SUPABASE_URL = 'https://zjialvdolbkccduuwsck.supabase.co';

function headers(key: string) {
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Resolve the caller's household_id from a verified Supabase access token.
 * NEVER trust a client-supplied household_id — service_role writes bypass
 * RLS, so the household_id is the only thing enforcing tenant isolation.
 * Returns null if the token is invalid or the user has no household row.
 */
export async function resolveHouseholdId(accessToken: string): Promise<string | null> {
  const anonKey = process.env.SUPABASE_ANON_KEY!;
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json() as any;
  if (!user?.id) return null;

  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const memberRes = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?auth_user_id=eq.${user.id}&select=household_id`,
    { headers: headers(serviceKey) }
  );
  if (!memberRes.ok) return null;
  const rows = await memberRes.json() as any[];
  return rows[0]?.household_id ?? null;
}

/**
 * For true background jobs (crons, external webhooks) with no per-request
 * auth session. Deliberate scope-reduction: assumes exactly one household
 * exists today and throws loudly otherwise, rather than silently guessing.
 * Revisit before a second household needs cron/webhook support.
 *
 * @deprecated Superseded by resolveHouseholdIdByWebhookToken() (per-household
 * webhook callers) and allHouseholdIds() (true crons that must run for every
 * household). Kept only for any caller not yet migrated.
 */
export async function soleHouseholdId(): Promise<string> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/households?select=id&limit=2`, {
    headers: headers(serviceKey),
  });
  if (!res.ok) throw new Error(`soleHouseholdId: households lookup failed: ${res.status}`);
  const rows = await res.json() as any[];
  if (rows.length === 0) throw new Error('soleHouseholdId: no households exist');
  if (rows.length > 1) throw new Error('soleHouseholdId: more than one household exists — background jobs need real household_id threading now');
  return rows[0].id;
}

/**
 * Resolve which household owns a given webhook token. Each household has its
 * own households.webhook_token (set once via Settings, rotatable), so a
 * shared secret no longer implies a single household — the token itself
 * IS the tenant identifier for external callers (Tasker/IFTTT/HA/NFC) that
 * have no Supabase Auth session to resolve a user from.
 * Returns null if the token doesn't match any household.
 */
export async function resolveHouseholdIdByWebhookToken(token: string): Promise<string | null> {
  if (!token) return null;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/households?webhook_token=eq.${encodeURIComponent(token)}&select=id`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return null;
  const rows = await res.json() as any[];
  return rows[0]?.id ?? null;
}

/** Every household id — for true crons that must process each household independently. */
export async function allHouseholdIds(): Promise<string[]> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/households?select=id`, {
    headers: headers(serviceKey),
  });
  if (!res.ok) throw new Error(`allHouseholdIds: households lookup failed: ${res.status}`);
  const rows = await res.json() as any[];
  return rows.map((r) => r.id);
}

/** Read a value by key, scoped to one household, from family_data table */
export async function dbGet(key: string, householdId: string): Promise<any> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/family_data?key=eq.${encodeURIComponent(key)}&household_id=eq.${encodeURIComponent(householdId)}&select=value`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return null;
  const rows = await res.json() as any[];
  return rows[0]?.value ?? null;
}

/** Upsert a value by key, scoped to one household, into family_data table */
export async function dbSet(key: string, householdId: string, value: any): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/family_data`, {
    method: 'POST',
    headers: { ...headers(serviceKey), 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ key, household_id: householdId, value }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbSet(${key}) failed: ${res.status} ${detail}`);
  }
}

/** Prepend one item to an array stored at key (read-modify-write), scoped to one household */
export async function dbPrepend(key: string, householdId: string, item: object): Promise<void> {
  const existing: any[] = (await dbGet(key, householdId)) ?? [];
  const arr = Array.isArray(existing) ? existing : [];
  await dbSet(key, householdId, [item, ...arr]);
}

/** Get a household member by email (uses service role to bypass RLS) */
export async function dbGetHouseholdMemberByEmail(email: string): Promise<{id: string; name: string; email: string; role: string; color: string} | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?email=eq.${encodeURIComponent(email)}&select=id,name,email,role,color`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return null;
  const rows = await res.json() as any[];
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    color: row.color,
  };
}

/** Get a household member by id (uses service role to bypass RLS) */
export async function dbGetHouseholdMemberById(id: string): Promise<{id: string; name: string; email: string | null; role: string; color: string; pin_hash: string | null; household_id: string} | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?id=eq.${encodeURIComponent(id)}&select=id,name,email,role,color,pin_hash,household_id`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return null;
  const rows = await res.json() as any[];
  return rows[0] ?? null;
}

/** Get all household members for a given household_id (uses service role to bypass RLS) */
export async function dbGetHouseholdMembersByHouseholdId(householdId: string): Promise<Array<{id: string; name: string; email: string | null; role: string; color: string; pin_hash: string | null; household_id: string}> | []> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?household_id=eq.${encodeURIComponent(householdId)}&select=id,name,email,role,color,pin_hash,household_id`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return [];
  return await res.json() as any[];
}

/** Get a household's own encrypted BYO API keys (raw, still encrypted) */
export async function dbGetHouseholdKeys(householdId: string): Promise<{
  byo_anthropic_key_encrypted: string | null;
  byo_gemini_key_encrypted: string | null;
}> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/households?id=eq.${encodeURIComponent(householdId)}&select=byo_anthropic_key_encrypted,byo_gemini_key_encrypted`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return { byo_anthropic_key_encrypted: null, byo_gemini_key_encrypted: null };
  const rows = await res.json() as any[];
  return rows[0] ?? { byo_anthropic_key_encrypted: null, byo_gemini_key_encrypted: null };
}

/** Set (or clear, with value=null) a household's own encrypted API key for one provider */
export async function dbSetHouseholdKey(
  householdId: string,
  provider: 'anthropic' | 'gemini',
  encryptedValue: string | null
): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const column = provider === 'anthropic' ? 'byo_anthropic_key_encrypted' : 'byo_gemini_key_encrypted';
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/households?id=eq.${encodeURIComponent(householdId)}`,
    { method: 'PATCH', headers: headers(serviceKey), body: JSON.stringify({ [column]: encryptedValue }) }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbSetHouseholdKey(${provider}) failed: ${res.status} ${detail}`);
  }
}

/** Get a household's recent Hermes memory notes, newest first (service role) */
export async function dbGetHouseholdMemory(householdId: string, limit = 100): Promise<Array<{id: string; text: string; source: string; created_at: string}>> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_memory?household_id=eq.${encodeURIComponent(householdId)}&select=id,text,source,created_at&order=created_at.desc&limit=${limit}`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return [];
  return await res.json() as any[];
}

/** Append one memory note for a household (service role) */
export async function dbAddHouseholdMemory(householdId: string, text: string, source: 'auto' | 'manual' = 'auto'): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/household_memory`, {
    method: 'POST',
    headers: headers(serviceKey),
    body: JSON.stringify({ household_id: householdId, text, source }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbAddHouseholdMemory failed: ${res.status} ${detail}`);
  }
}

/** Clear all memory notes for a household (service role) */
export async function dbClearHouseholdMemory(householdId: string): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_memory?household_id=eq.${encodeURIComponent(householdId)}`,
    { method: 'DELETE', headers: headers(serviceKey) }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbClearHouseholdMemory failed: ${res.status} ${detail}`);
  }
}

/** Recent activity feed entries for a household (service role) */
export async function dbGetHouseholdActivity(householdId: string, limit = 50): Promise<Array<{id: string; actor_name: string; text: string; created_at: string}>> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_activity?household_id=eq.${encodeURIComponent(householdId)}&select=id,actor_name,text,created_at&order=created_at.desc&limit=${limit}`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return [];
  return await res.json() as any[];
}

/** Append one activity entry for a household (service role) */
export async function dbAddHouseholdActivity(householdId: string, actorName: string, text: string): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/household_activity`, {
    method: 'POST',
    headers: headers(serviceKey),
    body: JSON.stringify({ household_id: householdId, actor_name: actorName, text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbAddHouseholdActivity failed: ${res.status} ${detail}`);
  }
}

/** Set a household's Hermes chat model tier (service role, bypasses RLS) */
export async function dbSetHermesModelTier(householdId: string, tier: 'haiku' | 'sonnet'): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/households?id=eq.${encodeURIComponent(householdId)}`,
    { method: 'PATCH', headers: headers(serviceKey), body: JSON.stringify({ hermes_model_tier: tier }) }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbSetHermesModelTier failed: ${res.status} ${detail}`);
  }
}

/** Store a member's Gmail server-side refresh token (encrypted by the caller) */
export async function dbSetMemberGmailToken(
  memberId: string,
  encryptedRefreshToken: string,
  connectedEmail: string
): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?id=eq.${encodeURIComponent(memberId)}`,
    {
      method: 'PATCH', headers: headers(serviceKey),
      body: JSON.stringify({
        gmail_refresh_token_encrypted: encryptedRefreshToken,
        gmail_connected_email: connectedEmail,
        gmail_connected_at: new Date().toISOString(),
      }),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbSetMemberGmailToken failed: ${res.status} ${detail}`);
  }
}

/** Clear a member's stored Gmail token (disconnect) */
export async function dbClearMemberGmailToken(memberId: string): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?id=eq.${encodeURIComponent(memberId)}`,
    {
      method: 'PATCH', headers: headers(serviceKey),
      body: JSON.stringify({ gmail_refresh_token_encrypted: null, gmail_connected_email: null, gmail_connected_at: null }),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbClearMemberGmailToken failed: ${res.status} ${detail}`);
  }
}

/** Get connected-email status for every member in a household (no tokens) */
export async function dbGetHouseholdGmailStatus(householdId: string): Promise<Array<{ id: string; gmail_connected_email: string | null }>> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?household_id=eq.${encodeURIComponent(householdId)}&select=id,gmail_connected_email`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return [];
  return await res.json() as any[];
}

/** Get a member's encrypted Gmail refresh token + connected email, if any */
export async function dbGetMemberGmailToken(memberId: string): Promise<{ encryptedRefreshToken: string; connectedEmail: string } | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?id=eq.${encodeURIComponent(memberId)}&select=gmail_refresh_token_encrypted,gmail_connected_email`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return null;
  const rows = await res.json() as any[];
  const row = rows[0];
  if (!row?.gmail_refresh_token_encrypted) return null;
  return { encryptedRefreshToken: row.gmail_refresh_token_encrypted, connectedEmail: row.gmail_connected_email };
}

/** Mark a household's premium voice as unlocked (service role, bypasses RLS) */
export async function dbSetVoiceUnlocked(householdId: string): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/households?id=eq.${encodeURIComponent(householdId)}`,
    { method: 'PATCH', headers: headers(serviceKey), body: JSON.stringify({ voice_unlocked: true }) }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbSetVoiceUnlocked failed: ${res.status} ${detail}`);
  }
}

/** Create a new household member */
export async function dbCreateHouseholdMember(member: {
  id: string;
  name: string;
  email: string;
  role: string;
  color: string;
  household_id: string;
}): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/household_members`, {
    method: 'POST',
    headers: { ...headers(serviceKey), 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(member),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbCreateHouseholdMember failed: ${res.status} ${detail}`);
  }
}

/** Upsert one FCM device token for a household. token is unique → ON CONFLICT
 * updates household_id/platform/updated_at (re-registrations, re-installs,
 * account switches). Service role only; browser never touches this table. */
export async function dbUpsertPushToken(householdId: string, token: string, platform: string = 'android'): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/device_tokens`, {
    method: 'POST',
    headers: { ...headers(serviceKey), 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ household_id: householdId, token, platform, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbUpsertPushToken failed: ${res.status} ${detail}`);
  }
}

/** All device tokens registered for a household (for notifyPush). */
export async function dbGetPushTokensByHouseholdId(householdId: string): Promise<string[]> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/device_tokens?household_id=eq.${encodeURIComponent(householdId)}&select=token`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return [];
  const rows = await res.json() as any[];
  return rows.map((r) => r.token);
}

/** Delete one device token (pruned when FCM reports it dead). */
export async function dbDeletePushToken(token: string): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  await fetch(`${SUPABASE_URL}/rest/v1/device_tokens?token=eq.${encodeURIComponent(token)}`, {
    method: 'DELETE',
    headers: headers(serviceKey),
  });
}
