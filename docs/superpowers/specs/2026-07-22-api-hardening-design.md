# API Hardening: Rate Limiting + Input Validation

## Problem

A Hermes-generated audit (`AUDIT.md`, `PLAN.md`, both untracked in the repo root) recommended 4 "P0 critical" fixes. Independent verification against the real code found:

- **Service_role key overuse**: **false**. `api/_db.ts` documents exactly why service_role is required (RLS is on, anon key can't write, this is server-only code) — this is a prior intentional decision, not a bug. Following the audit's recommendation here would have been a regression.
- **Inconsistent error handling**: **false**. All 8 sampled endpoints (`chat.ts`, `vision.ts`, `finance.ts`, `weather.ts`, `health-check.ts`, `setup.ts`, `billing-checkout.ts`, `data-write.ts`) use the same `j(data, status)` helper and consistent status codes.
- **No rate limiting**: **confirmed**. Zero rate-limiting code exists anywhere in `api/*.ts` or `vercel.json`. `chat.ts` and `vision.ts` call paid Anthropic/Gemini APIs gated only by a valid session token — no cap on call frequency or `maxTokens`.
- **Minimal input validation**: **partially true**. Zod is an installed dependency but used by zero endpoints. Most endpoints do ad-hoc truthiness checks (some good — `data-write.ts` has explicit `typeof` checks; some weak — `chat.ts`'s `maxTokens`/`model` are fully untrusted pass-through to a paid API).

This spec covers the two confirmed-real gaps only.

## Scope

- **In scope:** a shared rate-limit helper applied to `chat.ts` and `vision.ts` (the only endpoints with real cost/abuse exposure — they're the sole callers of paid external AI APIs); Zod validation schemas for all 17 POST-accepting endpoints except `stripe-webhook.ts`.
- **Out of scope:** the two debunked audit claims (service_role usage, error-handling standardization) — not touched, since they're not real problems. `stripe-webhook.ts` — see rationale below. Fixing the `recurring === 'true'` string-comparison quirk in `webhook.ts` (see Open Questions) — preserved as-is, not silently changed.
- **Threat model:** this is a household app (few users per deployment), not a public SaaS. Rate limiting here is cost-control against a runaway loop, stuck retry, or compromised session — not defense against high-volume adversarial traffic. Limits should be generous, not aggressive.

## Architecture

### Rate limiting: `api/_rateLimit.ts`

No Redis/Upstash exists in this project — it's Supabase Postgres only, with the existing `family_data` key-value table used for everything else (pantry, meals, weather cache, etc.). Reusing that pattern avoids adding new infrastructure for a small-scale app.

```ts
// api/_rateLimit.ts
import { dbGet, dbSet } from './_db.js';

const WINDOW_MS = 60_000; // 1 minute sliding window

interface RateLimitState { count: number; windowStart: number; }

/** Returns {allowed, retryAfterSeconds}. Keyed by householdId+endpoint so
 * one household's chat usage doesn't affect another's, and chat/vision
 * have independent budgets. */
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

Applied at the top of `chat.ts` and `vision.ts`, immediately after `householdId` resolution (so the limit is per-household, not per-anonymous-request):

```ts
const rl = await checkRateLimit(householdId, 'chat', 30); // 30/min
if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);
```

`vision.ts` gets its own independent budget (`checkRateLimit(householdId, 'vision', 15)` — lower than chat since vision calls are typically larger/more expensive per-request, e.g. receipt/chore scanning).

No other endpoint gets rate limiting — `weather.ts` is already cached hourly, `finance.ts` calls external services but isn't user-spammable in the same way (one sync per user action), and the rest are low-frequency admin/setup operations.

### Input validation: `api/_schemas.ts` + `parseBody` helper

```ts
// api/_schemas.ts (excerpt — full file has one schema per endpoint below)
import { z } from 'zod';

export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    return { ok: false, error: `${first.path.join('.')}: ${first.message}` };
  }
  return { ok: true, data: result.data };
}
```

Each endpoint calls this once, right after `req.json()`, replacing its current ad-hoc checks:

```ts
const body = await req.json().catch(() => ({}));
const parsed = parseBody(ChatBodySchema, body);
if (!parsed.ok) return j({ error: parsed.error }, 400);
const { prompt, messages, system, maxTokens, model } = parsed.data;
```

### Per-endpoint schemas (16 of 17 — excludes `stripe-webhook.ts`)

Grounded in the exact fields cataloged from reading each file (not guessed):

```ts
export const ChatBodySchema = z.object({
  prompt: z.string().optional(),
  messages: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
  system: z.string().optional(),
  maxTokens: z.number().int().positive().max(4096).optional(),
  model: z.enum(['claude-haiku-4-5-20251001', 'claude-sonnet-4-6']).optional(),
}).refine(d => d.prompt || d.messages, { message: 'Missing prompt or messages' });

export const VisionBodySchema = z.object({
  imageBase64: z.string().min(1),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']).default('image/jpeg'),
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

// ha-webhook.ts: discriminated union keyed on `event`, matching its
// actual if/else chain exactly (fixed set of 7 recognized event values).
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
  d => (d.action === 'add' && d.items) || d.accessToken,
  { message: 'Provide accessToken (Gmail scan) or action:add with items' }
);

// webhook.ts: `type` is the top-level discriminator (fixed KEY_MAP enum).
// The `recurring: 'true'` string-literal comparison in the current bill
// branch is preserved exactly — z.string() here, NOT z.boolean(), since
// "fixing" it would change behavior for existing callers of this webhook.
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
    recurring: z.string().optional(), // preserved as string — see note above
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

**Note on `webhook.ts`'s appointment branch field-name collision:** the request body reuses the key name `type` for two different meanings — the top-level discriminator (`type: 'appointment'`) and the appointment's own sub-category (also read as `body.type`, e.g. "Vet"). Zod's discriminated union requires the discriminator key to be literal per-branch, so the inner field is aliased to `type_` in the schema above; the endpoint's implementation will need `parsed.data.type_` where it currently reads the inner `body.type` — a one-line rename at the call site, not a body-shape change for callers (the wire format is unchanged, only the destructured variable name inside the handler shifts).

### `stripe-webhook.ts` — excluded, not silently skipped

This endpoint requires the **raw request body bytes** for `stripe.webhooks.constructEventAsync(rawBody, signature, secret)` — parsing it as JSON first (which `parseBody`/Zod would require) breaks Stripe's signature verification, since Stripe signs the exact byte sequence. Stripe's own SDK already guarantees the verified event's shape; adding Zod on top would validate a type the SDK has already validated, for no real safety gain, at the cost of a schema that could silently drift from Stripe's actual event shape over time. Left untouched.

## Data flow / error handling

- Rate limit check happens first, before any Zod validation or business logic — a rate-limited request shouldn't pay the cost of full body parsing/validation.
- `parseBody` failures return `400` with a single human-readable field-path + message (Zod's own error, not a generic "bad request") — matches the existing `j(data, status)` response shape every endpoint already uses, so no client-side changes are needed to consume the new error format.
- All existing in-code fallback defaults (`person || 'General'`, `days = 30`, etc.) are preserved as Zod `.default()` values — this is a validation-hardening pass, not a behavior-change pass. The one exception is documented above (`recurring` stays a string, not coerced to boolean).

## Testing

- `api/_rateLimit.test.ts`: unit tests for `checkRateLimit` — allows under limit, blocks at limit, resets after window expires, independent households don't share a budget. Mocks `dbGet`/`dbSet` the same way `api/_db.test.ts` already does (confirmed this pattern exists in the repo).
- `api/_schemas.test.ts`: for each of the 16 schemas, at least one valid-input pass and one invalid-input rejection test, focused on the fields with real ambiguity (finance's discriminated union, webhook's discriminated union, chat's refine-based either/or).
- Full existing test suite (currently 80 passing tests) must stay green — no endpoint's currently-working request shape should start failing validation.

## Open Questions (flagged, not blocking)

1. **`webhook.ts`'s `recurring === 'true'` string-literal bug** — a real latent bug (a JSON `true` boolean is silently treated as falsy), left unfixed here since fixing it is a behavior change for existing callers, not a validation-hardening change. Worth a follow-up decision on whether external callers can be safely migrated to send a real boolean.
2. **Rate limit window granularity** — a fixed 60-second sliding window resets liberally (a burst right at the window boundary can allow up to ~2x the nominal limit in worst case). Acceptable given the stated threat model (catching runaway loops, not precise quota enforcement); a token-bucket algorithm would be more precise but is unnecessary complexity for this use case.
