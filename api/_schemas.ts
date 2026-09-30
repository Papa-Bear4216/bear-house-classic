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

// Upper bounds so a compromised or buggy client can't stuff the model's context
// window. 8k chars bounds any client from stuffing the prompt.
const MAX_PROMPT_CHARS = 8_000;
const MAX_SYSTEM_CHARS = 16_000;

export const ChatBodySchema = z.object({
  prompt: z.string().max(MAX_PROMPT_CHARS).optional(),
  messages: z.array(z.object({ role: z.string(), content: z.string().max(MAX_PROMPT_CHARS) })).max(50).optional(),
  system: z.string().max(MAX_SYSTEM_CHARS).optional(),
  maxTokens: z.number().int().positive().max(4096).optional(),
  model: z.string().optional(), // free-form: passed straight to Anthropic (chat.ts:59), not restricted to a fixed set
  format: z.string().optional(), // 'json' opts the LLM into JSON output mode
  outputSchema: z.string().max(2000).optional(), // advisory JSON shape hint planted in the system prompt
}).refine(d => !!(d.prompt || d.messages), { message: 'Missing prompt or messages' });

export const VisionBodySchema = z.object({
  imageBase64: z.string().min(1),
  mediaType: z.string().optional().default('image/jpeg'), // free-form: Anthropic validates media type itself
  prompt: z.string().min(1),
});

export const ClientMetricBodySchema = z.object({
  event: z.literal('household_load'),
  // Omit timing values above two minutes; raw request size is bounded by the
  // client-metric handler before JSON parsing.
  totalMs: z.number().int().nonnegative().max(120_000),
  detail: z.object({
    sessionMs: z.number().int().nonnegative().max(120_000).optional(),
    pullFromCloudMs: z.number().int().nonnegative().max(120_000).optional(),
  }).strict().optional(),
});

export const DataWriteBodySchema = z.object({
  key: z.string().min(1),
  value: z.unknown().refine(v => v !== undefined, { message: 'Missing value' }),
  // householdId is intentionally NOT accepted here — it must be resolved
  // server-side from the caller's access token (see api/data-write.ts),
  // never trusted from the request body.
  // When set, the write is rejected (409) if the row's current updated_at no
  // longer matches — i.e. someone else wrote this key since the client last
  // read it. Optional so unconditional writes (e.g. first write of a new key)
  // keep working without callers having to special-case "no prior version".
  expectedUpdatedAt: z.string().optional(),
});

export const FinanceBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('connect'), setupToken: z.string().min(1), person: z.string().optional(), token: z.string().optional() }),
  z.object({ action: z.literal('accounts'), token: z.string().optional() }),
  z.object({ action: z.literal('disconnect'), token: z.string().optional() }),
  z.object({ action: z.literal('sync'), days: z.number().int().positive().max(90).default(30), token: z.string().optional() }),
]);

export const BillingActionBodySchema = z.object({ householdId: z.string().min(1) });

export const VoiceUnlockBodySchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export const HermesModelTierBodySchema = z.object({
  tier: z.enum(['haiku', 'sonnet']),
});

// Allowlist of HA service domains/services Hermes can call — deliberately
// narrow (lights/switches/locks/climate on-off-style controls only), no
// domain that could do something destructive (no scripts, no automations,
// no media_player with arbitrary URLs).
export const HaControlBodySchema = z.object({
  domain: z.enum(['light', 'switch', 'lock', 'climate', 'fan', 'cover', 'vacuum']),
  service: z.enum(['turn_on', 'turn_off', 'toggle', 'lock', 'unlock', 'open_cover', 'close_cover', 'start', 'stop', 'return_to_base']),
  entityId: z.string().trim().min(1).max(200),
});

export const TtsBodySchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const MemoryBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), text: z.string().trim().min(1).max(500) }),
  z.object({ action: z.literal('clear') }),
]);

export const ActivityBodySchema = z.object({
  text: z.string().trim().min(1).max(300),
});

export const SettingsKeysBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set'),
    provider: z.enum(['anthropic', 'gemini']),
    apiKey: z.string().trim().min(1).max(500),
  }),
  z.object({
    action: z.literal('clear'),
    provider: z.enum(['anthropic', 'gemini']),
  }),
]);

export const SettingsHaBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set'),
    url: z.string().trim().url().refine(u => u.startsWith('https://'), 'HA URL must use https://'),
    token: z.string().trim().min(1).max(2000),
  }),
  z.object({ action: z.literal('clear') }),
]);

export const CalendarSyncBodySchema = z.object({
  accessToken: z.string().min(1),
  person: z.string().min(1),
  calendarId: z.string().default('primary'),
  token: z.string().optional(),
});

export const ClassroomBodySchema = z.object({
  /** Legacy: a Google access token from the caller's own sign-in. */
  accessToken: z.string().min(1).optional(),
  person: z.string().min(1).optional(),
  /** Preferred: sync this member's linked school account (see classroom-link). */
  memberId: z.string().min(1).optional(),
}).refine(b => (b.memberId || (b.accessToken && b.person)), {
  message: 'Provide memberId, or accessToken and person',
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

// ── Voice trigger / device control schemas (IFTTT-style, Google, Alexa) ──────

export const DeviceControlBodySchema = z.object({
  deviceId: z.string().trim().min(1).max(200),
  action: z.enum(['turn_on', 'turn_off', 'toggle', 'lock', 'unlock', 'open_cover', 'close_cover', 'start', 'stop', 'return_to_base', 'set_brightness', 'set_temperature', 'set_color']),
  params: z.record(z.unknown()).optional(),
});

export const VoiceTriggerWebhookBodySchema = z.object({
  trigger: z.string().trim().min(1).max(100),
  token: z.string().trim().min(1),
});

export const VoiceTriggerActionSchema = z.object({
  type: z.literal('device'),
  deviceId: z.string().trim().min(1).max(200),
  action: z.enum(['turn_on', 'turn_off', 'toggle', 'lock', 'unlock', 'open_cover', 'close_cover', 'start', 'stop', 'return_to_base', 'set_brightness', 'set_temperature', 'set_color']),
  params: z.record(z.unknown()).optional(),
});

export const VoiceTriggerManageBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({
    action: z.literal('add'),
    trigger: z.string().trim().min(1).max(100),
    deviceId: z.string().trim().min(1).max(200),
    deviceAction: z.enum(['turn_on', 'turn_off', 'toggle', 'lock', 'unlock', 'open_cover', 'close_cover', 'start', 'stop', 'return_to_base', 'set_brightness', 'set_temperature', 'set_color']),
    params: z.record(z.unknown()).optional(),
  }),
  z.object({ action: z.literal('remove'), trigger: z.string().trim().min(1).max(100) }),
  z.object({ action: z.literal('rotateToken') }),
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
  z.object({ action: z.literal('removeMember'), memberId: z.string().uuid() }),
  z.object({
    action: z.literal('updateRole'), memberId: z.string().uuid(),
    role: z.enum(['admin', 'child', 'pet']),
  }),
  z.object({
    action: z.literal('setDevicePermission'), memberId: z.string().uuid(),
    canControlDevices: z.boolean(),
  }),
]);

export const BriefingParamsSchema = z.object({
  token: z.string().optional(),
  person: z.string().min(1),
  type: z.enum(['morning', 'evening']).default('morning'),
});

export const WeatherParamsSchema = z.object({
  lat: z.string().refine(v => { const n = Number(v); return Number.isFinite(n) && n >= -90 && n <= 90; }, { message: 'lat must be a number between -90 and 90' }),
  lon: z.string().refine(v => { const n = Number(v); return Number.isFinite(n) && n >= -180 && n <= 180; }, { message: 'lon must be a number between -180 and 180' }),
  token: z.string().optional(),
});

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
// own sub-category). Aliased to `type_` here.
export const WebhookBodySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('nfc'), action: z.string().default('log'), taskId: z.string().optional(),
    tagName: z.string().optional(), person: z.string().default('Family'), text: z.string().optional(), token: z.string().optional(),
  }),
  z.object({
    type: z.literal('task'),
    text: z.string().default('Untitled'), person: z.string().default('General'),
    priority: z.string().default('Medium'), category: z.string().default('General'),
    dueEstimate: z.string().default('No Deadline'), dueDate: z.union([z.string(), z.number()]).optional(),
    notify: z.boolean().optional(), token: z.string().optional(),
  }),
  z.object({
    type: z.literal('reminder'),
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

export const NotifyPersonBodySchema = z.object({
  personId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(1000),
});

// Input shape for briefing JSON-mode requests — validated before the
// structured payload reaches the prompt-construction path. The `start`/`source`
// gate checks data-plane access; `content` is the editor text being briefed;
// `meta` is optional structured context capped at 25 entries.
export const BriefingJsonInputSchema = z.object({
  start: z.string().min(1),
  source: z.string().min(1),
  content: z.string().min(1).max(MAX_PROMPT_CHARS),
  meta: z.array(z.record(z.unknown())).max(25).optional(),
});

// Output shape the LLM must return from secretary enrichment — validated
// against the parsed JSON before trusting its keys. Catches malformed or
// oversized LLM output and prevents injection of unexpected keys into the
// saved item.
export const SecretaryParseSchema = z.object({
  action: z.enum(['save', 'skip']),
  reason: z.string().max(500).optional(),
  enriched: z.object({
    text: z.string().min(1).max(500),
    person: z.string().min(1).max(100),
    priority: z.enum(['High', 'Medium', 'Low']),
    category: z.string().min(1).max(100),
    dueEstimate: z.enum(['Today', 'This Week', 'This Month', 'No Deadline']),
    secretaryNote: z.string().max(500).optional(),
  }),
});

// US state/territory 2-letter codes, matching coparent_disclosure_statutes'
// primary key — kept in sync manually with that table's seed data.
const US_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC',
] as const;

export const CoparentAddressBodySchema = z.object({
  addressStreet: z.string().trim().min(1).max(200).optional(),
  addressCity: z.string().trim().min(1).max(100).optional(),
  addressState: z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), z.enum(US_STATE_CODES)).optional(),
  addressZip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'ZIP must be 5 digits or ZIP+4').optional(),
  contactPhone: z
    .string()
    .trim()
    .regex(/^[\d\s\-().+]{7,20}$/, 'Enter a valid phone number')
    .refine((s) => s.replace(/\D/g, '').length >= 7, { message: 'Phone number must contain at least 7 digits' })
    .optional(),
  // Withhold the address/phone from the other parent (protective order or
  // equivalent). When set, the address fields become optional.
  confidential: z.boolean().optional(),
}).superRefine((v, ctx) => {
  if (v.confidential) return;
  for (const k of ['addressStreet', 'addressCity', 'addressState', 'addressZip', 'contactPhone'] as const) {
    if (v[k] === undefined) ctx.addIssue({ code: 'custom', path: [k], message: 'Required' });
  }
});
