import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  dbGet: vi.fn(),
  resolveHouseholdIdByWebhookToken: vi.fn(),
}));
vi.mock('./_aiKeys.js', () => ({
  resolveAiKeys: vi.fn(),
}));
vi.mock('./_rateLimit.js', () => ({
  checkRateLimit: vi.fn(),
}));
vi.mock('./_cheapModel.js', () => ({
  tryCheapModel: vi.fn(),
}));
vi.mock('./_subscriptionBridge.js', () => ({
  tryBridge: vi.fn(),
}));

import handler from './secretary';
import { dbGet, resolveHouseholdIdByWebhookToken } from './_db.js';
import { resolveAiKeys } from './_aiKeys.js';
import { checkRateLimit } from './_rateLimit.js';
import { tryCheapModel } from './_cheapModel.js';
import { tryBridge } from './_subscriptionBridge.js';

function createPostReq(body: unknown, tokenHeader: string | null = 'tok-123') {
  return new Request('https://example.com/api/secretary', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(tokenHeader ? { 'x-webhook-token': tokenHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('/api/secretary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveHouseholdIdByWebhookToken).mockResolvedValue('hh-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-test', geminiKey: 'gemini-test' });
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
    vi.mocked(dbGet).mockResolvedValue([]);
    vi.mocked(tryBridge).mockResolvedValue(null);
    vi.mocked(tryCheapModel).mockResolvedValue(null);
  });

  it('handles GET readiness check', async () => {
    const req = new Request('https://example.com/api/secretary', { method: 'GET' });
    const res = await handler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.agent).toBe('Hermes');
  });

  it('handles CORS OPTIONS preflight', async () => {
    const req = new Request('https://example.com/api/secretary', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://www.hotmessexpress.lol',
        'Access-Control-Request-Method': 'POST',
      },
    });
    const res = await handler(req);
    expect(res.status).toBe(204);
  });

  it('rejects unsupported HTTP methods with 405', async () => {
    const req = new Request('https://example.com/api/secretary', { method: 'PUT' });
    const res = await handler(req);
    expect(res.status).toBe(405);
  });

  it('rejects with 401 when webhook token is missing or unresolved', async () => {
    vi.mocked(resolveHouseholdIdByWebhookToken).mockResolvedValue(null);
    const res = await handler(createPostReq({ item: { text: 'Feed cat' }, type: 'task' }, null));
    expect(res.status).toBe(401);
  });

  it('rejects with 429 when rate limit exceeded', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 20 });
    const res = await handler(createPostReq({ item: { text: 'Feed cat' }, type: 'task' }));
    expect(res.status).toBe(429);
  });

  it('rejects with 400 on invalid body schema', async () => {
    const res = await handler(createPostReq({ item: 'not an object', type: 'task' }));
    expect(res.status).toBe(400);
  });

  it('skips item if duplicate of existing task is detected locally without calling AI', async () => {
    vi.mocked(dbGet).mockResolvedValue([
      { text: 'Feed the dog', completed: false },
    ]);

    const res = await handler(createPostReq({
      item: { text: 'Feed the dog' },
      type: 'task',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe('skip');
    expect(body.reason).toContain('Duplicate');
    expect(tryCheapModel).not.toHaveBeenCalled();
  });

  it('enriches item successfully when AI returns structured JSON', async () => {
    const aiOutput = JSON.stringify({
      action: 'save',
      enriched: {
        text: 'Feed the cat dinner',
        person: 'Papa Bear',
        priority: 'High',
        category: 'Pet',
        dueEstimate: 'Today',
        secretaryNote: 'Cats need food twice a day',
      },
    });
    vi.mocked(tryCheapModel).mockResolvedValue(aiOutput);

    const res = await handler(createPostReq({
      item: { text: 'feed cat' },
      type: 'task',
      familyMembers: ['Papa Bear', 'Mama Bear'],
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe('save');
    expect(body.item.text).toBe('Feed the cat dinner');
    expect(body.item.person).toBe('Papa Bear');
    expect(body.item.priority).toBe('High');
    expect(body.item.category).toBe('Pet');
    expect(body.item.secretaryNote).toBe('Cats need food twice a day');
  });

  it('gracefully falls back to action: save if AI response fails schema validation', async () => {
    vi.mocked(tryCheapModel).mockResolvedValue('{"action": "invalid_action"}');

    const res = await handler(createPostReq({
      item: { text: 'Clean garage' },
      type: 'task',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe('save');
    expect(body.item.text).toBe('Clean garage');
    expect(body.secretaryError).toBeDefined();
  });
});
