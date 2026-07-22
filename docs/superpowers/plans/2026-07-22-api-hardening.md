# API Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared rate limiter to `chat.ts`/`vision.ts` (the only paid-AI-calling endpoints) and Zod-based body validation to all 17 POST-accepting API endpoints except `stripe-webhook.ts`.

**Architecture:** A new `api/_rateLimit.ts` reuses the existing `family_data`-table pattern (`dbGet`/`dbSet` from `_db.ts`) for a per-household sliding-window counter — no new infrastructure. A new `api/_schemas.ts` exports one Zod schema per endpoint plus a `parseBody()` helper that both `chat.ts`/`vision.ts` and all other endpoints call right after `req.json()`, replacing their current ad-hoc truthy checks while preserving every existing fallback default exactly.

**Tech Stack:** TypeScript, Zod (already an installed dependency, currently unused anywhere in `api/`), Vitest (`environment: 'node'`, existing `vi.stubGlobal('fetch', ...)` mocking convention from `api/_db.test.ts`).

## Global Constraints

- Rate limiting applies ONLY to `chat.ts` and `vision.ts` — no other endpoint gets a rate limiter (confirmed in the design spec: `weather.ts` is already cached hourly, everything else is low-frequency).
- Rate limit window: 60 seconds, sliding. Limits: chat 30/min per household, vision 15/min per household (vision calls are typically larger/costlier). This is cost-control against a runaway bug, not adversarial-traffic defense — keep limits generous, not strict.
- `api/stripe-webhook.ts` is explicitly EXCLUDED from Zod validation — it requires raw body bytes (`req.text()`) for Stripe signature verification (`stripe.webhooks.constructEventAsync`); parsing as JSON first would break signature verification. Do not touch this file.
- Every schema must preserve EXACTLY the current fallback defaults and accepted value ranges already in the code (e.g. `person || 'General'` becomes `.default('General')`, not a required field). This is a validation-hardening pass, not a behavior-change pass.
- Two intentional widenings vs. the design spec's draft schemas (discovered during plan-writing by re-reading the actual code, not present in the original spec text — see Task 2's notes): `ChatBodySchema.model` must be `z.string().optional()`, NOT an enum of two literal model names — the real code accepts any model string and passes it straight to Anthropic (chat.ts:59); an enum would silently 400-reject valid future model names. Likewise `VisionBodySchema.mediaType` must be `z.string().optional().default('image/jpeg')`, NOT an enum of 4 literal MIME types — Anthropic's own API already validates media type and returns its own clear error; a hardcoded enum here would just be a second, more brittle copy of that validation.
- `webhook.ts`'s `recurring` field must stay `z.string().optional()` (matching the current literal `body.recurring === 'true'` string comparison) — do NOT change it to `z.boolean()`. That's a real latent bug (a JSON `true` boolean is currently silently treated as falsy) but fixing it is a behavior change for existing callers, explicitly out of scope per the design spec's Open Questions.
- `webhook.ts`'s appointment branch reuses the body field name `type` for two different meanings (top-level discriminator AND the appointment's own sub-category, e.g. "Vet"). The schema aliases the inner field to `type_`; the endpoint's implementation must destructure `parsed.data.type_` where it currently reads the inner `body.type` inside the appointment branch only — a rename of a local variable, not a wire-format change for callers.

---

## File Structure

- **Create:** `api/_rateLimit.ts` — `checkRateLimit(householdId, endpoint, limit)`.
- **Create:** `api/_rateLimit.test.ts` — unit tests mocking `dbGet`/`dbSet`.
- **Create:** `api/_schemas.ts` — 16 Zod schemas (all endpoints except `stripe-webhook.ts`) + `parseBody()` helper.
- **Create:** `api/_schemas.test.ts` — valid/invalid tests per schema, focused on the two discriminated unions (`finance.ts`, `setup.ts`, `webhook.ts`, `ha-webhook.ts`) and the chat.ts either/or refine.
- **Modify:** `api/chat.ts` — add rate limit check + `ChatBodySchema` validation.
- **Modify:** `api/vision.ts` — add rate limit check + `VisionBodySchema` validation.
- **Modify:** `api/data-write.ts`, `api/finance.ts`, `api/billing-checkout.ts`, `api/billing-portal.ts`, `api/billing-seats.ts`, `api/calendar-sync.ts`, `api/classroom.ts`, `api/gmail-suggestions.ts`, `api/ha-fix.ts`, `api/ha-webhook.ts`, `api/secretary.ts`, `api/setup.ts`, `api/walmart.ts`, `api/webhook.ts` — swap manual validation for `parseBody()` + the matching schema.

---

## Task 1: Rate limiter

**Files:**
- Create: `api/_rateLimit.ts`
- Test: `api/_rateLimit.test.ts`

**Interfaces:**
- Produces: `checkRateLimit(householdId: string, endpoint: string, limit: number): Promise<{allowed: true} | {allowed: false; retryAfterSeconds: number}>` — consumed by Task 2 (`chat.ts`, `vision.ts`).
- Consumes: `dbGet(key: string, householdId: string): Promise<any>`, `dbSet(key: string, householdId: string, value: any): Promise<void>` from `./_db.js` (exact signatures confirmed at `api/_db.ts:99,111`).

- [ ] **Step 1: Write the failing tests**

```ts
// api/_rateLimit.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, any>();

vi.mock('./_db.js', () => ({
  dbGet: vi.fn(async (key: string, householdId: string) => store.get(`${key}:${householdId}`) ?? null),
  dbSet: vi.fn(async (key: string, householdId: string, value: any) => { store.set(`${key}:${householdId}`, value); }),
}));

import { checkRateLimit } from './_rateLimit';

beforeEach(() => {
  store.clear();
  vi.useRealTimers();
});

describe('checkRateLimit', () => {
  it('allows the first request in a new window', async () => {
    const result = await checkRateLimit('household-1', 'chat', 30);
    expect(result.allowed).toBe(true);
  });

  it('allows requests under the limit', async () => {
    for (let i = 0; i < 29; i++) await checkRateLimit('household-1', 'chat', 30);
    const result = await checkRateLimit('household-1', 'chat', 30);
    expect(result.allowed).toBe(true);
  });

  it('blocks the request that would exceed the limit', async () => {
    for (let i = 0; i < 30; i++) await checkRateLimit('household-1', 'chat', 30);
    const result = await checkRateLimit('household-1', 'chat', 30);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('does not share a budget between different households', async () => {
    for (let i = 0; i < 30; i++) await checkRateLimit('household-1', 'chat', 30);
    const blocked = await checkRateLimit('household-1', 'chat', 30);
    expect(blocked.allowed).toBe(false);

    const other = await checkRateLimit('household-2', 'chat', 30);
    expect(other.allowed).toBe(true);
  });

  it('does not share a budget between different endpoints for the same household', async () => {
    for (let i = 0; i < 30; i++) await checkRateLimit('household-1', 'chat', 30);
    const chatBlocked = await checkRateLimit('household-1', 'chat', 30);
    expect(chatBlocked.allowed).toBe(false);

    const visionAllowed = await checkRateLimit('household-1', 'vision', 15);
    expect(visionAllowed.allowed).toBe(true);
  });

  it('resets the window after it expires', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    for (let i = 0; i < 30; i++) await checkRateLimit('household-1', 'chat', 30);
    const blocked = await checkRateLimit('household-1', 'chat', 30);
    expect(blocked.allowed).toBe(false);

    vi.setSystemTime(now + 61_000); // 1 second past the 60s window
    const result = await checkRateLimit('household-1', 'chat', 30);
    expect(result.allowed).toBe(true);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run api/_rateLimit.test.ts`
Expected: FAIL — `Cannot find module './_rateLimit'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// api/_rateLimit.ts
import { dbGet, dbSet } from './_db.js';

const WINDOW_MS = 60_000; // 1 minute sliding window

interface RateLimitState { count: number; windowStart: number; }

/** Returns {allowed:true} or {allowed:false, retryAfterSeconds}. Keyed by
 * householdId+endpoint so one household's usage doesn't affect another's,
 * and chat/vision have fully independent budgets. This is cost-control
 * against a runaway loop or compromised session, not adversarial-traffic
 * defense — limits are intentionally generous (see plan Global Constraints). */
export async function checkRateLimit(
  householdId: string, endpoint: string, limit: number
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  const key = `ratelimit_${endpoint}`;
  const state = (await dbGet(key, householdId)) as RateLimitState | null;
  const now = Date.now();

  if (!state || now - state.windowStart > WINDOW_MS) {
    await dbSet(key, householdId, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (state.count >= limit) {
    const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - state.windowStart)) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  await dbSet(key, householdId, { count: state.count + 1, windowStart: state.windowStart });
  return { allowed: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run api/_rateLimit.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add api/_rateLimit.ts api/_rateLimit.test.ts
git commit -m "feat(api): add Supabase-backed rate limiter for chat/vision endpoints"
```

---

## Task 2: Schemas module + parseBody helper

**Files:**
- Create: `api/_schemas.ts`
- Test: `api/_schemas.test.ts`

**Interfaces:**
- Produces: `parseBody<T>(schema: z.ZodSchema<T>, body: unknown): {ok: true; data: T} | {ok: false; error: string}` — consumed by every endpoint task below.
- Produces: 16 exported schemas (see below) — one per non-stripe-webhook endpoint.

This task is pure TypeScript, fully testable without any endpoint file needing changes yet.

- [ ] **Step 1: Write the failing tests**

```ts
// api/_schemas.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseBody, ChatBodySchema, VisionBodySchema, DataWriteBodySchema, FinanceBodySchema,
  BillingActionBodySchema, CalendarSyncBodySchema, ClassroomBodySchema, GmailSuggestionsBodySchema,
  HaFixBodySchema, HaWebhookBodySchema, SecretaryBodySchema, SetupBodySchema, WalmartBodySchema,
  WebhookBodySchema,
} from './_schemas';

describe('parseBody', () => {
  it('returns ok:true with parsed data on valid input', () => {
    const result = parseBody(ChatBodySchema, { prompt: 'hello' });
    expect(result.ok).toBe(true);
  });

  it('returns ok:false with a field-path error on invalid input', () => {
    const result = parseBody(DataWriteBodySchema, { key: 123, value: 'x', householdId: 'h1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('key');
  });
});

describe('ChatBodySchema', () => {
  it('accepts prompt-only mode', () => {
    expect(ChatBodySchema.safeParse({ prompt: 'hi' }).success).toBe(true);
  });

  it('accepts messages-array mode without prompt', () => {
    expect(ChatBodySchema.safeParse({ messages: [{ role: 'user', content: 'hi' }] }).success).toBe(true);
  });

  it('rejects when neither prompt nor messages is provided', () => {
    expect(ChatBodySchema.safeParse({ system: 'be nice' }).success).toBe(false);
  });

  it('accepts an arbitrary model string (not restricted to an enum)', () => {
    // Real code (chat.ts:59) passes model straight through to Anthropic —
    // a future model name must not be silently 400-rejected here.
    expect(ChatBodySchema.safeParse({ prompt: 'hi', model: 'claude-opus-5-1' }).success).toBe(true);
  });

  it('rejects a non-number maxTokens', () => {
    expect(ChatBodySchema.safeParse({ prompt: 'hi', maxTokens: 'lots' }).success).toBe(false);
  });
});

describe('VisionBodySchema', () => {
  it('requires imageBase64 and prompt', () => {
    expect(VisionBodySchema.safeParse({ imageBase64: 'abc', prompt: 'what is this' }).success).toBe(true);
    expect(VisionBodySchema.safeParse({ imageBase64: 'abc' }).success).toBe(false);
  });

  it('defaults mediaType to image/jpeg when omitted', () => {
    const result = VisionBodySchema.safeParse({ imageBase64: 'abc', prompt: 'x' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.mediaType).toBe('image/jpeg');
  });

  it('accepts an arbitrary mediaType string (not restricted to an enum)', () => {
    expect(VisionBodySchema.safeParse({ imageBase64: 'abc', prompt: 'x', mediaType: 'image/heic' }).success).toBe(true);
  });
});

describe('DataWriteBodySchema', () => {
  it('accepts a valid write', () => {
    expect(DataWriteBodySchema.safeParse({ key: 'k', value: { a: 1 }, householdId: 'h1' }).success).toBe(true);
  });

  it('rejects a missing householdId', () => {
    expect(DataWriteBodySchema.safeParse({ key: 'k', value: 1 }).success).toBe(false);
  });

  it('accepts any value type including null and false, only rejects undefined', () => {
    expect(DataWriteBodySchema.safeParse({ key: 'k', value: null, householdId: 'h1' }).success).toBe(true);
    expect(DataWriteBodySchema.safeParse({ key: 'k', value: false, householdId: 'h1' }).success).toBe(true);
  });
});

describe('FinanceBodySchema (discriminated union on action)', () => {
  it('validates the connect action', () => {
    expect(FinanceBodySchema.safeParse({ action: 'connect', setupToken: 'tok' }).success).toBe(true);
    expect(FinanceBodySchema.safeParse({ action: 'connect' }).success).toBe(false);
  });

  it('validates the sync action with a default days value', () => {
    const result = FinanceBodySchema.safeParse({ action: 'sync' });
    expect(result.success).toBe(true);
    if (result.success && result.data.action === 'sync') expect(result.data.days).toBe(30);
  });

  it('rejects an unknown action', () => {
    expect(FinanceBodySchema.safeParse({ action: 'nonexistent' }).success).toBe(false);
  });
});

describe('SetupBodySchema (discriminated union on action)', () => {
  it('validates createHousehold', () => {
    expect(SetupBodySchema.safeParse({ action: 'createHousehold', householdName: 'Smiths', memberName: 'Alice' }).success).toBe(true);
  });

  it('defaults inviteMember role to child', () => {
    const result = SetupBodySchema.safeParse({ action: 'inviteMember', memberName: 'Bob', email: 'b@x.com' });
    expect(result.success).toBe(true);
    if (result.success && result.data.action === 'inviteMember') expect(result.data.role).toBe('child');
  });

  it('claimInvite requires no body fields beyond action', () => {
    expect(SetupBodySchema.safeParse({ action: 'claimInvite' }).success).toBe(true);
  });
});

describe('WebhookBodySchema (discriminated union on type)', () => {
  it('validates a task webhook', () => {
    expect(WebhookBodySchema.safeParse({ type: 'task', text: 'do the thing' }).success).toBe(true);
  });

  it('keeps recurring as a string, matching the current === "true" comparison in webhook.ts', () => {
    const result = WebhookBodySchema.safeParse({ type: 'bill', name: 'Rent', recurring: 'true' });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'bill') expect(result.data.recurring).toBe('true');
  });

  it('rejects an unrecognized type', () => {
    expect(WebhookBodySchema.safeParse({ type: 'not-a-real-type' }).success).toBe(false);
  });

  it('accepts the appointment branch with its inner type_ field aliased', () => {
    const result = WebhookBodySchema.safeParse({ type: 'appointment', type_: 'Vet', person: 'Alice' });
    expect(result.success).toBe(true);
  });
});

describe('HaWebhookBodySchema (discriminated union on event)', () => {
  it('validates person_arrived with optional fields', () => {
    expect(HaWebhookBodySchema.safeParse({ event: 'person_arrived' }).success).toBe(true);
  });

  it('requires text for the custom event', () => {
    expect(HaWebhookBodySchema.safeParse({ event: 'custom' }).success).toBe(false);
    expect(HaWebhookBodySchema.safeParse({ event: 'custom', text: 'something happened' }).success).toBe(true);
  });
});

describe('WalmartBodySchema', () => {
  it('accepts action:add with items', () => {
    expect(WalmartBodySchema.safeParse({ action: 'add', items: ['milk', 'eggs'] }).success).toBe(true);
  });

  it('accepts a gmail-scan request via accessToken alone', () => {
    expect(WalmartBodySchema.safeParse({ accessToken: 'tok' }).success).toBe(true);
  });

  it('rejects a body with neither action:add+items nor accessToken', () => {
    expect(WalmartBodySchema.safeParse({ person: 'Alice' }).success).toBe(false);
  });
});

describe('remaining flat schemas', () => {
  it('BillingActionBodySchema requires householdId', () => {
    expect(BillingActionBodySchema.safeParse({ householdId: 'h1' }).success).toBe(true);
    expect(BillingActionBodySchema.safeParse({}).success).toBe(false);
  });

  it('CalendarSyncBodySchema requires accessToken and person, defaults calendarId', () => {
    const result = CalendarSyncBodySchema.safeParse({ accessToken: 'tok', person: 'Alice' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.calendarId).toBe('primary');
    expect(CalendarSyncBodySchema.safeParse({ accessToken: 'tok' }).success).toBe(false);
  });

  it('ClassroomBodySchema requires accessToken and person', () => {
    expect(ClassroomBodySchema.safeParse({ accessToken: 'tok', person: 'Alice' }).success).toBe(true);
    expect(ClassroomBodySchema.safeParse({ accessToken: 'tok' }).success).toBe(false);
  });

  it('GmailSuggestionsBodySchema requires accessToken, defaults person', () => {
    const result = GmailSuggestionsBodySchema.safeParse({ accessToken: 'tok' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.person).toBe('General');
  });

  it('HaFixBodySchema requires integration', () => {
    expect(HaFixBodySchema.safeParse({ integration: 'wyze_bridge' }).success).toBe(true);
    expect(HaFixBodySchema.safeParse({}).success).toBe(false);
  });

  it('SecretaryBodySchema requires item and type', () => {
    expect(SecretaryBodySchema.safeParse({ item: { text: 'x' }, type: 'task' }).success).toBe(true);
    expect(SecretaryBodySchema.safeParse({ item: { text: 'x' } }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run api/_schemas.test.ts`
Expected: FAIL — `Cannot find module './_schemas'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// api/_schemas.ts
import { z } from 'zod';

export function parseBody<T>(
  schema: z.ZodSchema<T>, body: unknown
): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    return { ok: false, error: `${first.path.join('.')}: ${first.message}` };
  }
  return { ok: true, data: result.data };
}

export const ChatBodySchema = z.object({
  prompt: z.string().optional(),
  messages: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
  system: z.string().optional(),
  maxTokens: z.number().int().positive().max(4096).optional(),
  model: z.string().optional(), // free-form: passed straight to Anthropic (chat.ts:59), not restricted to a fixed set
}).refine(d => !!(d.prompt || d.messages), { message: 'Missing prompt or messages' });

export const VisionBodySchema = z.object({
  imageBase64: z.string().min(1),
  mediaType: z.string().optional().default('image/jpeg'), // free-form: Anthropic validates media type itself
  prompt: z.string().min(1),
});

export const DataWriteBodySchema = z.object({
  key: z.string().min(1),
  value: z.unknown().refine(v => v !== undefined, { message: 'Missing value' }),
  householdId: z.string().min(1),
});

export const FinanceBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('connect'), setupToken: z.string().min(1), person: z.string().optional(), token: z.string().optional() }),
  z.object({ action: z.literal('accounts'), token: z.string().optional() }),
  z.object({ action: z.literal('disconnect'), token: z.string().optional() }),
  z.object({ action: z.literal('sync'), days: z.number().int().positive().max(90).default(30), token: z.string().optional() }),
]);

export const BillingActionBodySchema = z.object({ householdId: z.string().min(1) });

export const CalendarSyncBodySchema = z.object({
  accessToken: z.string().min(1),
  person: z.string().min(1),
  calendarId: z.string().default('primary'),
  token: z.string().optional(),
});

export const ClassroomBodySchema = z.object({
  accessToken: z.string().min(1),
  person: z.string().min(1),
});

export const GmailSuggestionsBodySchema = z.object({
  accessToken: z.string().min(1),
  person: z.string().default('General'),
});

export const HaFixBodySchema = z.object({
  integration: z.string().min(1),
  key: z.string().optional(),
});

export const HaWebhookBodySchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('person_arrived'), person: z.string().optional(), area: z.string().optional(), token: z.string().optional() }),
  z.object({ event: z.literal('person_left'), person: z.string().optional(), area: z.string().optional(), token: z.string().optional() }),
  z.object({ event: z.literal('package_delivered'), token: z.string().optional() }),
  z.object({ event: z.literal('door_left_open'), area: z.string().optional(), token: z.string().optional() }),
  z.object({ event: z.literal('low_battery'), device: z.string().optional(), token: z.string().optional() }),
  z.object({ event: z.literal('motion_detected'), area: z.string().optional(), device: z.string().optional(), token: z.string().optional() }),
  z.object({ event: z.literal('wyze_alert'), alert_type: z.string().optional(), token: z.string().optional() }),
  z.object({
    event: z.literal('custom'), text: z.string().min(1), person: z.string().default('General'),
    priority: z.string().default('Medium'), category: z.string().default('General'),
    dueEstimate: z.string().default('Today'), token: z.string().optional(),
  }),
]);

export const SecretaryBodySchema = z.object({
  item: z.record(z.unknown()),
  type: z.string().min(1),
  familyMembers: z.array(z.string()).optional(),
  token: z.string().optional(),
});

export const SetupBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('createHousehold'), householdName: z.string().trim().min(1), memberName: z.string().trim().min(1) }),
  z.object({
    action: z.literal('inviteMember'), memberName: z.string().trim().min(1),
    email: z.string().trim().toLowerCase().min(1), role: z.enum(['admin', 'child']).default('child'),
    color: z.string().trim().default('slate'),
  }),
  z.object({ action: z.literal('claimInvite') }),
]);

export const WalmartBodySchema = z.object({
  action: z.string().optional(),
  items: z.union([z.string(), z.array(z.string())]).optional(),
  person: z.string().optional(),
  accessToken: z.string().optional(),
  token: z.string().optional(),
}).refine(
  d => (d.action === 'add' && !!d.items) || !!d.accessToken,
  { message: 'Provide accessToken (Gmail scan) or action:add with items' }
);

// webhook.ts's appointment branch reuses the body field name `type` for
// two different meanings (top-level discriminator vs. the appointment's
// own sub-category). Aliased to `type_` here — see plan Global Constraints.
export const WebhookBodySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('nfc'), action: z.string().default('log'), taskId: z.string().optional(),
    tagName: z.string().optional(), person: z.string().default('Family'), text: z.string().optional(), token: z.string().optional(),
  }),
  z.object({
    type: z.union([z.literal('task'), z.literal('reminder')]),
    text: z.string().default('Untitled'), person: z.string().default('General'),
    priority: z.string().default('Medium'), category: z.string().default('General'),
    dueEstimate: z.string().default('No Deadline'), dueDate: z.union([z.string(), z.number()]).optional(),
    notify: z.boolean().optional(), token: z.string().optional(),
  }),
  z.object({
    type: z.literal('bill'), text: z.string().optional(), name: z.string().optional(),
    amount: z.union([z.string(), z.number()]).optional(), dueDate: z.union([z.string(), z.number()]).optional(),
    recurring: z.string().optional(), // kept as string — matches webhook.ts's `=== 'true'` comparison exactly
    notify: z.boolean().optional(), token: z.string().optional(),
  }),
  z.object({
    type: z.literal('shopping'), text: z.string().optional(), name: z.string().optional(),
    category: z.string().default('General'), assignedTo: z.string().default('General'),
    quantity: z.string().default('1'), notify: z.boolean().optional(), token: z.string().optional(),
  }),
  z.object({
    type: z.literal('appointment'), person: z.string().default('General'), type_: z.string().optional(),
    doctor: z.string().default(''), date: z.union([z.string(), z.number()]).optional(),
    notes: z.string().default(''), notify: z.boolean().optional(), token: z.string().optional(),
  }),
]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run api/_schemas.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add api/_schemas.ts api/_schemas.test.ts
git commit -m "feat(api): add Zod schemas + parseBody helper for all endpoints except stripe-webhook"
```

---

## Task 3: Wire rate limiting + validation into chat.ts and vision.ts

**Files:**
- Modify: `api/chat.ts`
- Modify: `api/vision.ts`

**Interfaces:**
- Consumes: `checkRateLimit` from `./_rateLimit.js` (Task 1), `parseBody`/`ChatBodySchema`/`VisionBodySchema` from `./_schemas.js` (Task 2).

No new test file — these two endpoints' business logic (Anthropic/Gemini calls) is unchanged; only the validation/rate-limit gate at the top changes, and both new pieces are already unit-tested in Tasks 1-2. Verified via `npm run build` (type-check) and the full existing test suite staying green.

- [ ] **Step 1: Update `api/chat.ts`**

Replace lines 1-5 (imports) with:

```ts
export const config = { runtime: 'edge' };

import { resolveHouseholdId } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, ChatBodySchema } from './_schemas.js';

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
```

Replace the current body of `handler` from line 38 through line 53 (`export default async function handler...` through `if (!prompt && !msgArray) return j(...)`) with:

```ts
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'chat', 30);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!anthropicKey && !geminiKey) return j({ error: 'API key not configured.' }, 500);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(ChatBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { prompt, messages: msgArray, system, maxTokens, model } = parsed.data;
```

(The rest of the function — `const messages = msgArray || ...` through the end — is unchanged; it already reads `prompt`/`msgArray`/`system`/`maxTokens`/`model` from local variables, which now come from `parsed.data` instead of the old raw `body` destructure.)

- [ ] **Step 2: Update `api/vision.ts`**

Replace lines 1-5 with:

```ts
export const config = { runtime: 'edge' };

import { resolveHouseholdId } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, VisionBodySchema } from './_schemas.js';

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
```

Replace lines 7-20 (`export default async function handler...` through `if (!imageBase64 || !prompt) return j(...)`) with:

```ts
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'vision', 15);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return j({ error: 'API key not configured.' }, 500);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(VisionBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { imageBase64, mediaType, prompt } = parsed.data;
```

(The rest — the Anthropic fetch call — is unchanged.)

- [ ] **Step 3: Build to verify no type errors**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all existing tests pass (no test exercises chat.ts/vision.ts's HTTP behavior directly, so this confirms no unrelated regression from the import/type changes).

- [ ] **Step 5: Commit**

```bash
git add api/chat.ts api/vision.ts
git commit -m "feat(api): apply rate limiting and Zod validation to chat.ts and vision.ts"
```

---

## Task 4: Apply validation to billing + simple single-shape endpoints

**Files:**
- Modify: `api/billing-checkout.ts:12-14`
- Modify: `api/billing-portal.ts:14-16`
- Modify: `api/billing-seats.ts:34-36`
- Modify: `api/classroom.ts:47-49`
- Modify: `api/gmail-suggestions.ts:125-127`
- Modify: `api/ha-fix.ts:111-113`

**Interfaces:**
- Consumes: `parseBody`, `BillingActionBodySchema`, `ClassroomBodySchema`, `GmailSuggestionsBodySchema`, `HaFixBodySchema` from `./_schemas.js` (Task 2).

These six files share the same "single flat schema, replace one destructure + one manual check" shape. No new tests — each schema is already tested in Task 2; verified here via build + full test suite.

- [ ] **Step 1: Update `api/billing-checkout.ts`**

At the top of the file, add the import (alongside existing imports):

```ts
import { parseBody, BillingActionBodySchema } from './_schemas.js';
```

Replace line 12 (`const body = ...`) through line 14 (the `if (!householdId)` check) with:

```ts
  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(BillingActionBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { householdId } = parsed.data;
```

- [ ] **Step 2: Update `api/billing-portal.ts`** (identical pattern)

Add the import:

```ts
import { parseBody, BillingActionBodySchema } from './_schemas.js';
```

Replace line 14 through line 16 with:

```ts
  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(BillingActionBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { householdId } = parsed.data;
```

- [ ] **Step 3: Update `api/billing-seats.ts`** (identical pattern)

Add the import:

```ts
import { parseBody, BillingActionBodySchema } from './_schemas.js';
```

Replace line 34 through line 36 with:

```ts
  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(BillingActionBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { householdId } = parsed.data;
```

- [ ] **Step 4: Update `api/classroom.ts`**

Add the import:

```ts
import { parseBody, ClassroomBodySchema } from './_schemas.js';
```

Replace line 47 through line 49 with:

```ts
  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(ClassroomBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { accessToken, person } = parsed.data;
```

- [ ] **Step 5: Update `api/gmail-suggestions.ts`**

Add the import:

```ts
import { parseBody, GmailSuggestionsBodySchema } from './_schemas.js';
```

Replace line 125 through line 127 with:

```ts
  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(GmailSuggestionsBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { accessToken, person } = parsed.data;
```

- [ ] **Step 6: Update `api/ha-fix.ts`**

Add the import:

```ts
import { parseBody, HaFixBodySchema } from './_schemas.js';
```

Replace line 111 through line 113 with:

```ts
  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(HaFixBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { integration, key } = parsed.data;
```

- [ ] **Step 7: Build and run tests**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

Run: `npm test`
Expected: all existing tests pass.

- [ ] **Step 8: Commit**

```bash
git add api/billing-checkout.ts api/billing-portal.ts api/billing-seats.ts api/classroom.ts api/gmail-suggestions.ts api/ha-fix.ts
git commit -m "feat(api): apply Zod validation to billing, classroom, gmail, and ha-fix endpoints"
```

---

## Task 5: Apply validation to data-write.ts and calendar-sync.ts

**Files:**
- Modify: `api/data-write.ts:36-40`
- Modify: `api/calendar-sync.ts:42-49`

**Interfaces:**
- Consumes: `parseBody`, `DataWriteBodySchema`, `CalendarSyncBodySchema` from `./_schemas.js` (Task 2).

- [ ] **Step 1: Update `api/data-write.ts`**

Add the import:

```ts
import { parseBody, DataWriteBodySchema } from './_schemas.js';
```

Replace line 36 (`const body = ...`) through line 40 (the last manual check) with:

```ts
  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(DataWriteBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { key, value, householdId } = parsed.data;
```

- [ ] **Step 2: Update `api/calendar-sync.ts`**

Add the import:

```ts
import { parseBody, CalendarSyncBodySchema } from './_schemas.js';
```

Replace line 42 (`const body = ...`) through line 49 (the last manual check) with:

```ts
  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(CalendarSyncBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { accessToken, person, calendarId } = parsed.data;
```

- [ ] **Step 3: Build and run tests**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

Run: `npm test`
Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add api/data-write.ts api/calendar-sync.ts
git commit -m "feat(api): apply Zod validation to data-write and calendar-sync endpoints"
```

---

## Task 6: Apply validation to finance.ts and setup.ts (discriminated unions)

**Files:**
- Modify: `api/finance.ts:17-18,30-31,78`
- Modify: `api/setup.ts:34-41,92-97,163`

**Interfaces:**
- Consumes: `parseBody`, `FinanceBodySchema`, `SetupBodySchema` from `./_schemas.js` (Task 2).

These two files branch on an `action` field into different expected body shapes — the schema is a discriminated union, so `parsed.data` is narrowed per-branch by TypeScript once the action is checked, same pattern as the existing `if (action === 'connect')` branches.

- [ ] **Step 1: Update `api/finance.ts`**

Add the import:

```ts
import { parseBody, FinanceBodySchema } from './_schemas.js';
```

Replace line 17 (`const baseUrl = ...`) and line 18 (`const body = ...`) — keep `baseUrl` as-is, replace only the body parsing:

```ts
  const baseUrl = new URL(req.url).origin; // for self-call to /api/chat in categorize()
  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(FinanceBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const params = parsed.data;
  const { action } = params;
```

(This replaces the old `const { action, ...params } = body;` — `params` is now the full discriminated-union member itself, e.g. `{action: 'connect', setupToken, person, token}`, not a spread-rest object. Every field the existing code destructures from `params` inside each action branch — `setupToken`/`person` in `connect`, `days` in `sync` — is present directly on `params` with the same names, so the per-branch destructuring lines like `const { setupToken, person } = params;` at line 30 and `const { days = 30 } = params;` at line 78 continue to work unchanged — just delete the `= 30` default from line 78 since the schema's `.default(30)` already guarantees `days` is present.)

At line 78, replace:

```ts
    const { days = 30 } = params;
```

with:

```ts
    const { days } = params;
```

(Since this line only runs inside the `if (action === 'sync')` branch, TypeScript narrows `params` to the `sync` union member there, which the schema guarantees always has a `days: number` — no default needed at the call site anymore.)

- [ ] **Step 2: Update `api/setup.ts`**

Add the import:

```ts
import { parseBody, SetupBodySchema } from './_schemas.js';
```

Replace line 34 (`const body = ...`) and line 35 (`const { action } = body;`) with:

```ts
  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(SetupBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const body = parsed.data;
  const { action } = body;
```

At lines 38-41 (inside the `createHousehold` branch), replace:

```ts
    const householdName = (body.householdName || '').trim();
    const memberName = (body.memberName || '').trim();
    if (!householdName) return j({ error: '...' }, 400);
    if (!memberName) return j({ error: '...' }, 400);
```

with (the schema already guarantees both are non-empty trimmed strings):

```ts
    const { householdName, memberName } = body;
```

(Keep whatever the original error messages said if you need to preserve exact wording elsewhere in the file — this step only removes the now-redundant manual checks, since `SetupBodySchema`'s `createHousehold` branch already requires `householdName`/`memberName` via `.trim().min(1)`.)

At lines 92-97 (inside the `inviteMember` branch), replace:

```ts
    const memberName = (body.memberName || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const role = body.role === 'admin' || body.role === 'child' ? body.role : 'child';
    const color = (body.color || 'slate').trim();
    if (!memberName) return j({ error: '...' }, 400);
    if (!email) return j({ error: '...' }, 400);
```

with:

```ts
    const { memberName, email, role, color } = body;
```

- [ ] **Step 3: Build and run tests**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors. If TypeScript complains about narrowing `params`/`body` inside an action branch, confirm the `if (action === '...')` check happens before the destructure — discriminated unions only narrow after the literal comparison.

Run: `npm test`
Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add api/finance.ts api/setup.ts
git commit -m "feat(api): apply Zod discriminated-union validation to finance and setup endpoints"
```

---

## Task 7: Apply validation to secretary.ts and walmart.ts

**Files:**
- Modify: `api/secretary.ts:104,109-110`
- Modify: `api/walmart.ts:75,80,82,102`

**Interfaces:**
- Consumes: `parseBody`, `SecretaryBodySchema`, `WalmartBodySchema` from `./_schemas.js` (Task 2).

- [ ] **Step 1: Update `api/secretary.ts`**

Add the import:

```ts
import { parseBody, SecretaryBodySchema } from './_schemas.js';
```

Replace line 104 (`const body = ...`) through line 110 (`if (!item || !type) return...`) with:

```ts
  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(SecretaryBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { item, type, familyMembers } = parsed.data;
```

- [ ] **Step 2: Update `api/walmart.ts`**

Add the import:

```ts
import { parseBody, WalmartBodySchema } from './_schemas.js';
```

Replace line 75 (`const body = ...`) through line 80 (the destructure) with:

```ts
  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(WalmartBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { action, accessToken, person, items: incomingItems } = parsed.data;
```

The existing line 82 check (`if (action === 'add' && incomingItems)`) and the line 102 fallback error can both stay exactly as-is — the schema's `.refine()` already guarantees at parse time that either `action === 'add' && items` or `accessToken` is present, so those lines remain correct as the branch-selection logic they already were (not redundant validation — they route between the two already-guaranteed-valid shapes, they don't re-check validity).

- [ ] **Step 3: Build and run tests**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

Run: `npm test`
Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add api/secretary.ts api/walmart.ts
git commit -m "feat(api): apply Zod validation to secretary and walmart endpoints"
```

---

## Task 8: Apply validation to ha-webhook.ts and webhook.ts (discriminated unions)

**Files:**
- Modify: `api/ha-webhook.ts:30-36,78`
- Modify: `api/webhook.ts:58,63-64,67`

**Interfaces:**
- Consumes: `parseBody`, `HaWebhookBodySchema`, `WebhookBodySchema` from `./_schemas.js` (Task 2).

- [ ] **Step 1: Update `api/ha-webhook.ts`**

Add the import:

```ts
import { parseBody, HaWebhookBodySchema } from './_schemas.js';
```

Replace line 30 (`const body = ...`) through line 36 (`if (!event) return...`) with:

```ts
  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(HaWebhookBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const body = parsed.data;
  const { event } = body;
```

At line 78 (the `custom` event branch's `if (!customText) return...` check, paired with reading `text: customText` from `body`), this check is now redundant — the schema's `custom` branch already requires `text: z.string().min(1)`. Remove the manual check; the destructure that follows it should read `body.text` instead of the old `customText` local name (rename usages inside the `custom` branch accordingly, e.g. `const customText = body.text;` if the rest of the branch's code still refers to a `customText` variable, to minimize the diff).

- [ ] **Step 2: Update `api/webhook.ts`**

Add the import:

```ts
import { parseBody, WebhookBodySchema } from './_schemas.js';
```

Replace line 58 (`const body = ...`) through line 64 (`if (!type || !KEY_MAP[type]) return...`) with:

```ts
  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(WebhookBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const body = parsed.data;
  const { type } = body;
```

(The schema's discriminated union already guarantees `type` is one of the 5 recognized literals per plan Global Constraints, so the old `!KEY_MAP[type]` check is redundant and removed — the schema's rejection message on an unrecognized `type` replaces it.)

Inside the `appointment` branch specifically (wherever the code currently reads the inner sub-category via `body.type`), rename that one read to `body.type_` — this is the only place affected by the field-name alias from Task 2's `WebhookBodySchema` (see plan Global Constraints for why).

At line 67 (the nfc-branch destructure `const { action: nfcAction = 'log', taskId, tagName, person = 'Family', text: nfcText } = body;`), this can stay as a destructure from `body` unchanged — the schema's `nfc` branch already provides `action` (default `'log'`), `taskId`, `tagName`, `person` (default `'Family'`), and `text` with the same names and defaults, so no rename is needed here, only removing the now-redundant `= 'log'`/`= 'Family'` fallbacks if you want to avoid double-defaulting (harmless either way, but for clarity remove them since the schema already guarantees the defaults):

```ts
  const { action: nfcAction, taskId, tagName, person, text: nfcText } = body;
```

- [ ] **Step 3: Build and run tests**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

Run: `npm test`
Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add api/ha-webhook.ts api/webhook.ts
git commit -m "feat(api): apply Zod discriminated-union validation to ha-webhook and webhook endpoints"
```

---

## Task 9: Full verification

**Files:** none (verification-only task).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass — the pre-existing suite (80 tests as of the last full run in this repo) plus the new `_rateLimit.test.ts` (6 tests) and `_schemas.test.ts` (~25 tests).

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: `vite build` succeeds, no TypeScript errors across all 14 modified endpoint files plus the 2 new `_rateLimit.ts`/`_schemas.ts` files.

- [ ] **Step 3: Confirm `stripe-webhook.ts` was never touched**

Run: `git diff --stat master -- api/stripe-webhook.ts` (or check `git log` for this task's commits)
Expected: no changes to this file across the whole plan — confirms the raw-body constraint was respected throughout.

- [ ] **Step 4: Manual smoke test (cannot be automated)**

This requires a live deployment with real credentials — cannot be run from a local dev environment alone since most of these endpoints call real external APIs (Anthropic, Gemini, Stripe, Google Calendar/Classroom/Gmail, SimpleFIN, Home Assistant). Once deployed:
1. Send a normal chat request from the app's Hermes chat — confirm it still works end-to-end.
2. Send 31 rapid chat requests from the same household within a minute — confirm the 31st returns `429` with a `retryAfterSeconds` message.
3. Trigger a receipt/chore scan (vision.ts) — confirm it still works.
4. Send a malformed webhook (e.g. `POST /api/webhook` with `{type: "not-real"}`) — confirm it returns `400` with a specific field-path error instead of the old generic message.

- [ ] **Step 5: No commit needed**

Verification-only; nothing to commit if all checks pass.

---

## Self-Review Notes

- **Spec coverage:** rate limiter (Task 1) → applied to chat/vision (Task 3). Schemas for all 16 non-stripe-webhook endpoints (Task 2) → wired into every endpoint across Tasks 3-8. `stripe-webhook.ts` exclusion → explicitly never touched, verified in Task 9 Step 3.
- **Type consistency:** `checkRateLimit`'s signature (Task 1) matches its two call sites in Task 3 exactly (`householdId, 'chat', 30` / `householdId, 'vision', 15`). `parseBody`'s generic signature (Task 2) is called identically across all 14 endpoint tasks. Schema names match between their definition (Task 2) and every import site (Tasks 3-8).
- **Corrections made during plan-writing, not present in the original spec text:** the spec's draft schemas used `z.enum(...)` for `ChatBodySchema.model` and `VisionBodySchema.mediaType` — re-reading `chat.ts:59` and `vision.ts:32` directly showed both fields are genuinely free-form pass-through values to the AI provider's own API, so an enum would silently reject valid inputs the current code accepts. Widened both to `z.string()` in Task 2, documented in Global Constraints so this isn't lost or re-narrowed by whoever implements the plan.
- **Known follow-up, not fixed here:** `webhook.ts`'s `recurring === 'true'` string-comparison bug (a JSON boolean `true` is silently falsy) is preserved exactly, per the design spec's explicit Open Question — flagged again here so it doesn't get "helpfully" fixed as a side effect during implementation.
