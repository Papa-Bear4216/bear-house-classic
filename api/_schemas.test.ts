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
