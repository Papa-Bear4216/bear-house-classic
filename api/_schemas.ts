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
