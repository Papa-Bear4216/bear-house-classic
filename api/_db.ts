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
 * Resolve the caller's own household_member row (id + role), not just
 * household_id. Use this wherever a route needs to know WHO is calling —
 * e.g. to scope data by owner or branch on role (see finance.ts, which uses
 * this to keep one member's linked bank data from another member's admin
 * view — see the family_data.owner_member_id RLS policy).
 * Returns null if the token is invalid or the user has no household row.
 */
export async function resolveCallerMember(accessToken: string): Promise<{ householdId: string; memberId: string; role: string; canControlDevices: boolean } | null> {
  const anonKey = process.env.SUPABASE_ANON_KEY!;
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json() as any;
  if (!user?.id) return null;

  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const memberRes = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?auth_user_id=eq.${user.id}&select=id,household_id,role,can_control_devices`,
    { headers: headers(serviceKey) }
  );
  if (!memberRes.ok) return null;
  const rows = await memberRes.json() as any[];
  const row = rows[0];
  if (!row) return null;
  return { householdId: row.household_id, memberId: row.id, role: row.role, canControlDevices: !!row.can_control_devices };
}

/** True if this caller may issue device-control commands: admin/superadmin
 * always can; child/pet need the explicit per-member override. */
export function canControlDevices(caller: { role: string; canControlDevices: boolean }): boolean {
  return caller.role === 'admin' || caller.role === 'superadmin' || caller.canControlDevices;
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

/** Upsert a value by key, scoped to one household, into family_data table.
 * Pass ownerMemberId to restrict the row to that member + superadmins (see
 * the owner_member_id RLS policy on family_data) — omit it for
 * household-wide data, which is the default and unchanged behavior for
 * every pre-existing caller of this function. */
export async function dbSet(key: string, householdId: string, value: any, ownerMemberId?: string): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const body: Record<string, unknown> = { key, household_id: householdId, value };
  if (ownerMemberId !== undefined) body.owner_member_id = ownerMemberId;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/family_data`, {
    method: 'POST',
    headers: { ...headers(serviceKey), 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(body),
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

/** Get a household's own Home Assistant connection (URL + still-encrypted token) */
export async function dbGetHouseholdHA(householdId: string): Promise<{
  ha_url: string | null;
  ha_token_encrypted: string | null;
}> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/households?id=eq.${encodeURIComponent(householdId)}&select=ha_url,ha_token_encrypted`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return { ha_url: null, ha_token_encrypted: null };
  const rows = await res.json() as any[];
  return rows[0] ?? { ha_url: null, ha_token_encrypted: null };
}

/** Set (or clear, with both null) a household's own Home Assistant URL + encrypted token */
export async function dbSetHouseholdHA(
  householdId: string,
  url: string | null,
  encryptedToken: string | null
): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/households?id=eq.${encodeURIComponent(householdId)}`,
    {
      method: 'PATCH', headers: headers(serviceKey),
      body: JSON.stringify({
        ha_url: url,
        ha_token_encrypted: encryptedToken,
        ha_configured_at: url ? new Date().toISOString() : null,
      }),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbSetHouseholdHA failed: ${res.status} ${detail}`);
  }
}

export type HouseholdMemoryRow = {
  id: string;
  text: string;
  source: string;
  created_at: string;
  member_id: string | null;
  subject_member_id: string | null;
  kind: 'fact'|'preference'|'routine'|'pattern'|'correction';
  importance: number;
  status: 'active'|'pending_review'|'superseded'|'archived';
  dedupe_hash: string | null;
  last_seen_at: string;
  expires_at: string | null;
};

/** Get ranked active facts for one household; importance >= 8 is pinned first. */
export async function dbGetHouseholdMemory(householdId: string, limit = 100): Promise<HouseholdMemoryRow[]> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_memory?household_id=eq.${encodeURIComponent(householdId)}&status=eq.active&select=id,text,source,created_at,member_id,subject_member_id,kind,importance,status,dedupe_hash,last_seen_at,expires_at&order=importance.desc,last_seen_at.desc,id.asc&limit=500`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return [];
  const rows = await res.json() as HouseholdMemoryRow[];
  const now = Date.now();
  const recency = (row: HouseholdMemoryRow) => 1 / (1 + Math.max(0, now - Date.parse(row.last_seen_at)) / (30 * 24 * 60 * 60 * 1000));
  return rows
    .filter((row) => !row.expires_at || Date.parse(row.expires_at) >= now)
    .sort((a, b) => {
      const aPinned = a.importance >= 8;
      const bPinned = b.importance >= 8;
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      if (aPinned && a.importance !== b.importance) return b.importance - a.importance;
      const score = (b.importance * recency(b)) - (a.importance * recency(a));
      return score || a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}

export function memoryDedupeHash(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

export type HouseholdMemoryWrite = {
  source?: 'auto'|'manual';
  memberId?: string | null;
  subjectMemberId?: string | null;
  kind?: 'fact'|'preference'|'routine'|'pattern'|'correction';
  importance?: number;
  status?: 'active'|'pending_review';
};

/** Dedupe-aware household memory write; existing active facts are bumped. */
async function dbAddHouseholdMemoryImpl(householdId: string, text: string, opts: HouseholdMemoryWrite = {}): Promise<'inserted'|'bumped'> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const dedupeHash = memoryDedupeHash(text);
  const query = `${SUPABASE_URL}/rest/v1/household_memory?household_id=eq.${encodeURIComponent(householdId)}&status=eq.active&select=id,importance&limit=1&dedupe_hash=eq.${encodeURIComponent(dedupeHash)}`;
  const bump = async (id: string, importance: number) => fetch(
    `${SUPABASE_URL}/rest/v1/household_memory?id=eq.${encodeURIComponent(id)}&household_id=eq.${encodeURIComponent(householdId)}`,
    { method: 'PATCH', headers: headers(serviceKey), body: JSON.stringify({ last_seen_at: new Date().toISOString(), importance: Math.min(10, importance + 1) }) }
  );
  let existingRes = await fetch(query, { headers: headers(serviceKey) });
  if (existingRes.ok) {
    const rows = await existingRes.json() as Array<{id:string;importance:number}>;
    if (rows[0]) {
      const bumped = await bump(rows[0].id, rows[0].importance || 1);
      if (!bumped.ok) throw new Error(`dbAddHouseholdMemory bump failed: ${bumped.status}`);
      await dbLogHermesRepair(householdId, { issueType: 'memory_dedupe', detail: `Existing active memory was taught again: ${text.slice(0, 120)}`, actionTaken: 'Updated last_seen_at and importance', success: true });
      return 'bumped';
    }
  }

  const countRes = await fetch(
    `${SUPABASE_URL}/rest/v1/household_memory?household_id=eq.${encodeURIComponent(householdId)}&status=eq.active&select=id&limit=1`,
    { headers: { ...headers(serviceKey), Prefer: 'count=exact', Range: '0-0' } }
  );
  const countHeader = countRes.headers.get('content-range') || '';
  const activeCount = Number(countHeader.split('/')[1] || 0);
  if (activeCount >= 500) {
    const lowRes = await fetch(
      `${SUPABASE_URL}/rest/v1/household_memory?household_id=eq.${encodeURIComponent(householdId)}&status=eq.active&select=id&order=importance.asc,last_seen_at.asc,id.asc&limit=1`,
      { headers: headers(serviceKey) }
    );
    if (lowRes.ok) {
      const lowRows = await lowRes.json() as Array<{id:string}>;
      if (lowRows[0]) await fetch(
        `${SUPABASE_URL}/rest/v1/household_memory?id=eq.${encodeURIComponent(lowRows[0].id)}&household_id=eq.${encodeURIComponent(householdId)}`,
        { method: 'PATCH', headers: headers(serviceKey), body: JSON.stringify({ status: 'archived' }) }
      );
    }
  }

  const insert = async () => fetch(`${SUPABASE_URL}/rest/v1/household_memory`, {
    method: 'POST',
    headers: headers(serviceKey),
    body: JSON.stringify({
      household_id: householdId,
      text,
      source: opts.source || 'auto',
      member_id: opts.memberId ?? null,
      subject_member_id: opts.subjectMemberId ?? null,
      kind: opts.kind || 'fact',
      importance: opts.importance ?? 5,
      status: opts.status || 'active',
      dedupe_hash: dedupeHash,
      last_seen_at: new Date().toISOString(),
    }),
  });
  let res = await insert();
  if (res.status === 409) {
    existingRes = await fetch(query, { headers: headers(serviceKey) });
    if (existingRes.ok) {
      const rows = await existingRes.json() as Array<{id:string;importance:number}>;
      if (rows[0]) {
        const bumped = await bump(rows[0].id, rows[0].importance || 1);
        if (bumped.ok) {
          await dbLogHermesRepair(householdId, { issueType: 'memory_dedupe', detail: `Concurrent duplicate memory write: ${text.slice(0, 120)}`, actionTaken: 'Updated existing active row', success: true });
          return 'bumped';
        }
      }
    }
    res = await insert();
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbAddHouseholdMemory failed: ${res.status} ${detail}`);
  }
  return 'inserted';
}

export async function dbAddHouseholdMemory(householdId: string, text: string, opts: HouseholdMemoryWrite = {}): Promise<'inserted'|'bumped'> {
  try {
    return await dbAddHouseholdMemoryImpl(householdId, text, opts);
  } catch (error) {
    await dbLogHermesRepair(householdId, {
      issueType: 'memory_write_failed',
      detail: String((error as Error)?.message || error).slice(0, 500),
      actionTaken: 'Client outbox retains the write for retry on next load',
      success: false,
    });
    throw error;
  }
}

export async function dbSetMemoryStatus(id: string, householdId: string, status: 'active'|'archived'|'superseded'|'pending_review'): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/household_memory?id=eq.${encodeURIComponent(id)}&household_id=eq.${encodeURIComponent(householdId)}`, {
    method: 'PATCH', headers: headers(process.env.SUPABASE_SERVICE_KEY!), body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`dbSetMemoryStatus failed: ${res.status}`);
}

export async function dbGetPendingMemories(householdId: string): Promise<HouseholdMemoryRow[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/household_memory?household_id=eq.${encodeURIComponent(householdId)}&status=eq.pending_review&select=id,text,source,created_at,member_id,subject_member_id,kind,importance,status,dedupe_hash,last_seen_at,expires_at&order=created_at.desc&limit=100`, {
    headers: headers(process.env.SUPABASE_SERVICE_KEY!),
  });
  if (!res.ok) throw new Error(`dbGetPendingMemories failed: ${res.status}`);
  return await res.json() as HouseholdMemoryRow[];
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

/** Get a household's Hermes chat model tier (service role, bypasses RLS). Defaults to 'haiku'. */
export async function dbGetHermesModelTier(householdId: string): Promise<'haiku' | 'sonnet'> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/households?id=eq.${encodeURIComponent(householdId)}&select=hermes_model_tier`,
      { headers: headers(serviceKey) }
    );
    if (!res.ok) return 'haiku';
    const rows = await res.json() as any[];
    return rows[0]?.hermes_model_tier === 'sonnet' ? 'sonnet' : 'haiku';
  } catch {
    return 'haiku';
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

/** Store a member's Classroom refresh token (encrypted by the caller), or clear it with nulls */
export async function dbSetMemberClassroomToken(
  memberId: string,
  encryptedRefreshToken: string | null,
  connectedEmail: string | null
): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?id=eq.${encodeURIComponent(memberId)}`,
    {
      method: 'PATCH', headers: headers(serviceKey),
      body: JSON.stringify({
        classroom_refresh_token_encrypted: encryptedRefreshToken,
        classroom_connected_email: connectedEmail,
        classroom_connected_at: encryptedRefreshToken ? new Date().toISOString() : null,
      }),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbSetMemberClassroomToken failed: ${res.status} ${detail}`);
  }
}

/** Get connected-email status for Classroom for every member in a household (no tokens) */
export async function dbGetHouseholdClassroomStatus(householdId: string): Promise<Array<{ id: string; classroom_connected_email: string | null }>> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?household_id=eq.${encodeURIComponent(householdId)}&select=id,classroom_connected_email`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return [];
  return await res.json() as any[];
}

/** Get a member's encrypted Classroom refresh token, if any */
export async function dbGetMemberClassroomToken(memberId: string): Promise<{ encryptedRefreshToken: string; connectedEmail: string } | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?id=eq.${encodeURIComponent(memberId)}&select=classroom_refresh_token_encrypted,classroom_connected_email`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return null;
  const row = ((await res.json()) as any[])[0];
  if (!row?.classroom_refresh_token_encrypted) return null;
  return { encryptedRefreshToken: row.classroom_refresh_token_encrypted, connectedEmail: row.classroom_connected_email };
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
export async function dbUpsertPushToken(
  householdId: string, token: string, platform: string = 'android', personId?: string
): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const body: Record<string, unknown> = { household_id: householdId, token, platform, updated_at: new Date().toISOString() };
  if (personId) body.person_id = personId;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/device_tokens`, {
    method: 'POST',
    headers: { ...headers(serviceKey), 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(body),
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

/** Device tokens registered to one specific person within a household.
 * Scoped by both household_id and person_id so a stale/forged personId
 * from another household can never match. */
export async function dbGetDeviceTokensByPersonId(householdId: string, personId: string): Promise<string[]> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/device_tokens?household_id=eq.${encodeURIComponent(householdId)}&person_id=eq.${encodeURIComponent(personId)}&select=token`,
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

/** Get a household's voice trigger webhook token (may be null). */
export async function dbGetHouseholdVoiceToken(householdId: string): Promise<{ voice_trigger_token: string | null }> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/households?id=eq.${encodeURIComponent(householdId)}&select=voice_trigger_token`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return { voice_trigger_token: null };
  const rows = await res.json() as any[];
  return rows[0] ?? { voice_trigger_token: null };
}

/** Set (or clear) a household's voice trigger webhook token. */
export async function dbSetHouseholdVoiceToken(householdId: string, token: string | null): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/households?id=eq.${encodeURIComponent(householdId)}`,
    {
      method: 'PATCH', headers: headers(serviceKey),
      body: JSON.stringify({ voice_trigger_token: token }),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbSetHouseholdVoiceToken failed: ${res.status} ${detail}`);
  }
}

/** Resolve a household from its voice trigger webhook token. */
export async function resolveHouseholdIdByVoiceTriggerToken(token: string): Promise<string | null> {
  if (!token) return null;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/households?voice_trigger_token=eq.${encodeURIComponent(token)}&select=id`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return null;
  const rows = await res.json() as any[];
  return rows[0]?.id ?? null;
}

export type HermesRepairIssue = 'memory_write_failed'|'memory_dedupe'|'memory_supersede'|'memory_expired'|'cache_stale'|'tool_degraded'|'snapshot_missing'|'context_overflow'|'other';
export interface HermesRepairRow {
  surface?: string;
  issueType: HermesRepairIssue;
  detail: string;
  actionTaken: string;
  success: boolean;
}

function hermesWeekOf(date = new Date()): string {
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - day + 1);
  return monday.toISOString().slice(0, 10);
}

async function dbUpsertHermesFeedback(householdId: string | null, patch: Record<string, unknown>): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const weekOf = hermesWeekOf();
  const householdFilter = householdId
    ? `&household_id=eq.${encodeURIComponent(householdId)}`
    : '&household_id=is.null';
  const url = `${SUPABASE_URL}/rest/v1/hermes_dev_feedback?week_of=eq.${weekOf}${householdFilter}&select=id&limit=1`;
  const existingRes = await fetch(url, { headers: headers(serviceKey) });
  if (!existingRes.ok) throw new Error(`dbUpsertHermesFeedback lookup failed: ${existingRes.status}`);
  const existing = await existingRes.json() as Array<{id:string}>;
  const body = { ...patch, week_of: weekOf, household_id: householdId };
  const res = existing[0]
    ? await fetch(`${SUPABASE_URL}/rest/v1/hermes_dev_feedback?id=eq.${encodeURIComponent(existing[0].id)}`, {
      method: 'PATCH', headers: headers(serviceKey), body: JSON.stringify(patch),
    })
    : await fetch(`${SUPABASE_URL}/rest/v1/hermes_dev_feedback`, {
      method: 'POST', headers: headers(serviceKey), body: JSON.stringify(body),
    });
  if (res.ok) return;
  if (res.status === 409) {
    const retryLookup = await fetch(url, { headers: headers(serviceKey) });
    const retryRows = retryLookup.ok ? await retryLookup.json() as Array<{id:string}> : [];
    if (retryRows[0]) {
      const retry = await fetch(`${SUPABASE_URL}/rest/v1/hermes_dev_feedback?id=eq.${encodeURIComponent(retryRows[0].id)}`, {
        method: 'PATCH', headers: headers(serviceKey), body: JSON.stringify(patch),
      });
      if (retry.ok) return;
    }
  }
  const detail = await res.text().catch(() => '');
  throw new Error(`dbUpsertHermesFeedback failed: ${res.status} ${detail}`);
}

/** Count recent failed repairs for one issue type. Success rows never count toward escalation. */
export async function dbCountRecentRepairs(householdId: string, issueType: HermesRepairIssue, hours: number): Promise<number> {
  const since = new Date(Date.now() - Math.max(0, hours) * 60 * 60 * 1000).toISOString();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/hermes_repair_log?household_id=eq.${encodeURIComponent(householdId)}&issue_type=eq.${encodeURIComponent(issueType)}&success=eq.false&created_at=gte.${encodeURIComponent(since)}&select=id&limit=1`,
    { headers: { ...headers(process.env.SUPABASE_SERVICE_KEY!), Prefer: 'count=exact', Range: '0-0' } }
  );
  if (!res.ok) throw new Error(`dbCountRecentRepairs failed: ${res.status}`);
  const total = (res.headers.get('content-range') || '').split('/')[1];
  return Number(total || 0);
}

/** Logging is best-effort and must never break the request being observed. */
export async function dbLogHermesRepair(householdId: string, row: HermesRepairRow): Promise<void> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/hermes_repair_log`, {
      method: 'POST',
      headers: headers(process.env.SUPABASE_SERVICE_KEY!),
      body: JSON.stringify({
        household_id: householdId,
        surface: row.surface || null,
        issue_type: row.issueType,
        detail: row.detail.slice(0, 1000),
        action_taken: row.actionTaken.slice(0, 500),
        success: row.success,
      }),
    });
    if (!res.ok) return;
    if (!row.success) {
      const failures = await dbCountRecentRepairs(householdId, row.issueType, 24);
      if (failures >= 3) await dbUpsertHermesFeedback(householdId, { flagged_for_review: true });
    }
  } catch {
    // Repair telemetry is deliberately non-fatal.
  }
}

export interface HermesRepairSummary {
  repairsMade: number;
  repairsFailed: number;
  byType: Record<string, { made: number; failed: number }>;
}

export async function dbGetHermesRepairSummary(householdId: string, since: string): Promise<HermesRepairSummary> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/hermes_repair_log?household_id=eq.${encodeURIComponent(householdId)}&created_at=gte.${encodeURIComponent(since)}&select=issue_type,success&limit=5000`,
    { headers: headers(process.env.SUPABASE_SERVICE_KEY!) }
  );
  if (!res.ok) throw new Error(`dbGetHermesRepairSummary failed: ${res.status}`);
  const rows = await res.json() as Array<{issue_type:string;success:boolean}>;
  const summary: HermesRepairSummary = { repairsMade: 0, repairsFailed: 0, byType: {} };
  for (const row of rows) {
    const counts = summary.byType[row.issue_type] ||= { made: 0, failed: 0 };
    if (row.success) { counts.made++; summary.repairsMade++; }
    else { counts.failed++; summary.repairsFailed++; }
  }
  return summary;
}

export async function dbArchiveExpiredMemory(householdId: string, now = new Date()): Promise<number> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_memory?household_id=eq.${encodeURIComponent(householdId)}&status=eq.active&expires_at=lt.${encodeURIComponent(now.toISOString())}`,
    { method: 'PATCH', headers: { ...headers(process.env.SUPABASE_SERVICE_KEY!), Prefer: 'return=representation' }, body: JSON.stringify({ status: 'archived' }) }
  );
  if (!res.ok) throw new Error(`dbArchiveExpiredMemory failed: ${res.status}`);
  const rows = await res.json().catch(() => []) as unknown[];
  return rows.length;
}

export async function dbUpsertHermesWeeklyFeedback(householdId: string | null, data: {
  repairsMade: number; repairsFailed: number; suggestedChanges: unknown[]; performanceNotes?: string | null; flaggedForReview?: boolean;
}): Promise<void> {
  await dbUpsertHermesFeedback(householdId, {
    repairs_made: data.repairsMade,
    repairs_failed: data.repairsFailed,
    suggested_changes: data.suggestedChanges,
    performance_notes: data.performanceNotes ?? null,
    ...(data.flaggedForReview !== undefined ? { flagged_for_review: data.flaggedForReview } : {}),
  });
}

export async function dbCountHermesRepairsBySuccess(hours = 24): Promise<{ made: number; failed: number }> {
  const since = new Date(Date.now() - Math.max(0, hours) * 60 * 60 * 1000).toISOString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/hermes_repair_log?created_at=gte.${encodeURIComponent(since)}&select=success&limit=5000`, {
    headers: headers(process.env.SUPABASE_SERVICE_KEY!),
  });
  if (!res.ok) throw new Error(`dbCountHermesRepairsBySuccess failed: ${res.status}`);
  const rows = await res.json() as Array<{success:boolean}>;
  return rows.reduce((counts, row) => { row.success ? counts.made++ : counts.failed++; return counts; }, { made: 0, failed: 0 });
}

export async function dbCountFlaggedHermesHouseholds(): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/hermes_dev_feedback?flagged_for_review=eq.true&household_id=not.is.null&select=household_id&limit=5000`, {
    headers: headers(process.env.SUPABASE_SERVICE_KEY!),
  });
  if (!res.ok) throw new Error(`dbCountFlaggedHermesHouseholds failed: ${res.status}`);
  const rows = await res.json() as Array<{household_id:string}>;
  return new Set(rows.map((row) => row.household_id)).size;
}

export async function dbCountPendingMemoryReview(): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/household_memory?status=eq.pending_review&select=id&limit=1`, {
    headers: { ...headers(process.env.SUPABASE_SERVICE_KEY!), Prefer: 'count=exact', Range: '0-0' },
  });
  if (!res.ok) throw new Error(`dbCountPendingMemoryReview failed: ${res.status}`);
  return Number((res.headers.get('content-range') || '').split('/')[1] || 0);
}
