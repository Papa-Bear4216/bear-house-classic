/**
 * Tests for server/postChat.ts — pure input-resolution logic.
 *
 * Mocks every side effect (resolveHouseholdId, checkRateLimit, dbGetHermesModelTier,
 * resolveAiKeys, fetch) and asserts the resolved ChatResolution shape.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  resolveHouseholdId: vi.fn(),
  dbGetHermesModelTier: vi.fn(),
}));

vi.mock('./_aiKeys.js', () => ({
  resolveAiKeys: vi.fn(),
}));

vi.mock('./_rateLimit.js', () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('./_aiModels.js', () => ({
  HERMES_SYSTEM_PROMPT: 'You are Hermes, the Bear House family assistant. Hard rules apply.',
  CLAUDE_MODELS: { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-4-6' },
}));

import { resolveChatInput } from './_postChat.js';
import { resolveHouseholdId, dbGetHermesModelTier } from './_db.js';
import { resolveAiKeys } from './_aiKeys.js';
import { checkRateLimit } from './_rateLimit.js';

function req(body: unknown, auth = 'Bearer t') {
  return new Request('https://example.com/api/chat', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + auth,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(dbGetHermesModelTier).mockResolvedValue('haiku');
});

describe('server/postChat.resolveChatInput', () => {
  it('returns 401 when there is no Bearer token', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await resolveChatInput(req({ prompt: 'hi' }, ''));
    expect(res).toMatchObject({ kind: 'error', status: 401 });
  });

  it('returns 401 when the token does not resolve to a household', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await resolveChatInput(req({ prompt: 'hi' }, 'Bearer bad'));
    expect(res).toMatchObject({ kind: 'error', status: 401 });
  });

  it('returns 429 when the household is rate-limited', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 3 });
    const res = await resolveChatInput(req({ prompt: 'hi' }));
    expect(res).toMatchObject({ kind: 'error', status: 429 });
  });

  it('returns 500 when the household has no AI key configured', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: undefined, geminiKey: undefined });
    const res = await resolveChatInput(req({ prompt: 'hi' }));
    expect(res).toMatchObject({ kind: 'error', status: 500 });
  });

  it('resolves AI key resolution to the caller household, not a client-supplied one', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-1', geminiKey: undefined });
    vi.mocked(dbGetHermesModelTier).mockResolvedValue('haiku');

    await resolveChatInput(req({ prompt: 'hi' }));

    expect(resolveAiKeys).toHaveBeenCalledWith('household-1');
  });

  it('returns kind: "ai" with the resolved input on a normal request', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-1', geminiKey: undefined });
    vi.mocked(dbGetHermesModelTier).mockResolvedValue('haiku');

    const res = await resolveChatInput(req({ prompt: 'hello' }));
    expect(res).toMatchObject({
      kind: 'ai',
      input: {
        householdId: 'household-1',
        messages: [{ role: 'user', content: 'hello' }],
        tokens: 512,
        chosenModel: 'claude-haiku-4-5-20251001',
        anthropicKey: 'sk-ant-1',
        geminiKey: undefined,
        isTriadDirect: false,
        triadPrompt: '',
      },
    });
  });

  it('uses the household sonnet tier for the Claude model', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-1', geminiKey: undefined });
    vi.mocked(dbGetHermesModelTier).mockResolvedValue('sonnet');

    const res = await resolveChatInput(req({ prompt: 'hi' }));
    expect((res as any).input.chosenModel).toBe('claude-sonnet-4-6');
  });

  it('defaults to haiku when the tier lookup fails', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-1', geminiKey: undefined });
    vi.mocked(dbGetHermesModelTier).mockRejectedValue(new Error('db down'));

    const res = await resolveChatInput(req({ prompt: 'hi' }));
    expect((res as any).input.chosenModel).toBe('claude-haiku-4-5-20251001');
  });

  it('lets an explicit model param override the household tier', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-1', geminiKey: undefined });
    vi.mocked(dbGetHermesModelTier).mockResolvedValue('haiku');

    const res = await resolveChatInput(req({ prompt: 'hi', model: 'claude-sonnet-4-6' }));
    expect((res as any).input.chosenModel).toBe('claude-sonnet-4-6');
  });

  it('returns kind: "triad" when the prompt is a triad query', async () => {
    process.env.TRIAD_HOUSEHOLD_ID = 'household-1';
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(dbGetHermesModelTier).mockResolvedValue('haiku');

    const res = await resolveChatInput(req({ prompt: 'triad doctor' }));
    expect(res).toMatchObject({ kind: 'triad', prompt: 'doctor' });
  });

  it('returns kind: "triad" when the prompt is /triad', async () => {
    process.env.TRIAD_HOUSEHOLD_ID = 'household-1';
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(dbGetHermesModelTier).mockResolvedValue('haiku');

    const res = await resolveChatInput(req({ prompt: '/triad gate' }));
    expect(res).toMatchObject({ kind: 'triad', prompt: 'gate' });
  });

  it('treats "triad ..." as a normal chat message for a household that is not the Triad household', async () => {
    process.env.TRIAD_HOUSEHOLD_ID = 'someone-else';
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-1', geminiKey: undefined });
    vi.mocked(dbGetHermesModelTier).mockResolvedValue('haiku');

    const res = await resolveChatInput(req({ prompt: 'triad doctor' }));
    expect(res).toMatchObject({ kind: 'ai' });
  });

  it('returns 400 when the body fails ChatBodySchema validation', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    const res = await resolveChatInput(req({}));
    expect(res).toMatchObject({ kind: 'error', status: 400 });
    expect((res as any).body).toHaveProperty('error');
  });

  it('returns 405 on non-POST', async () => {
    const res = await resolveChatInput(new Request('https://example.com/api/chat', { method: 'GET' }));
    expect(res).toMatchObject({ kind: 'error', status: 405 });
  });

  it('passes the effective system prompt through on an AI resolution', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-1', geminiKey: undefined });
    vi.mocked(dbGetHermesModelTier).mockResolvedValue('haiku');

    const res = await resolveChatInput(req({ prompt: 'hi', system: 'my sys' }));
    expect((res as any).input.effectiveSystem).toBe('my sys');
  });

  it('falls back to the Hermes system prompt when no system is supplied', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-1', geminiKey: undefined });
    vi.mocked(dbGetHermesModelTier).mockResolvedValue('haiku');

    const res = await resolveChatInput(req({ prompt: 'hi' }));
    expect((res as any).input.effectiveSystem).toContain('Hermes');
  });
});
