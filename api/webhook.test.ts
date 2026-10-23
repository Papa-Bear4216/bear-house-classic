import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  dbGet: vi.fn(),
  dbSet: vi.fn(),
  dbPrepend: vi.fn(),
  resolveHouseholdIdByWebhookToken: vi.fn(),
}));
vi.mock('./_notify.js', () => ({
  notifyIFTTT: vi.fn(),
  notifyPush: vi.fn(),
}));
vi.mock('./_rateLimit.js', () => ({
  checkRateLimit: vi.fn(),
}));

import handler from './webhook';
import { dbGet, dbSet, dbPrepend, resolveHouseholdIdByWebhookToken } from './_db.js';
import { notifyIFTTT, notifyPush } from './_notify.js';
import { checkRateLimit } from './_rateLimit.js';

function createPostReq(body: unknown, tokenHeader: string | null = 'tok-123') {
  return new Request('https://example.com/api/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(tokenHeader ? { 'x-webhook-token': tokenHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('/api/webhook', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveHouseholdIdByWebhookToken).mockResolvedValue('hh-1');
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
    vi.mocked(dbGet).mockResolvedValue([]);
    vi.mocked(dbSet).mockResolvedValue(undefined);
    vi.mocked(dbPrepend).mockResolvedValue(undefined);
    vi.mocked(notifyIFTTT).mockResolvedValue(undefined);
    vi.mocked(notifyPush).mockResolvedValue(undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('handles GET health/status check', async () => {
    const req = new Request('https://example.com/api/webhook', { method: 'GET' });
    const res = await handler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toContain('Hermes is live');
  });

  it('handles CORS OPTIONS preflight', async () => {
    const req = new Request('https://example.com/api/webhook', {
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
    const req = new Request('https://example.com/api/webhook', { method: 'DELETE' });
    const res = await handler(req);
    expect(res.status).toBe(405);
  });

  it('rejects with 401 when token is missing or invalid', async () => {
    vi.mocked(resolveHouseholdIdByWebhookToken).mockResolvedValue(null);
    const res = await handler(createPostReq({ type: 'task', text: 'Wash car' }, null));
    expect(res.status).toBe(401);
  });

  it('rejects with 429 when rate limit is exceeded', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 45 });
    const res = await handler(createPostReq({ type: 'task', text: 'Take out trash' }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('Rate limit exceeded');
  });

  it('rejects with 400 when body does not match WebhookBodySchema', async () => {
    const res = await handler(createPostReq({ type: 'invalid_type' }));
    expect(res.status).toBe(400);
  });

  it('handles NFC tag logging and task completion', async () => {
    vi.mocked(dbGet).mockResolvedValue([
      { id: 'task-1', text: 'Dishes', completed: false },
    ]);

    const res = await handler(createPostReq({
      type: 'nfc',
      action: 'complete',
      taskId: 'task-1',
      tagName: 'kitchen_sink',
      person: 'Papa Bear',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe('logged');
    expect(body.text).toBe('Dishes done');

    // Checked and updated task completion
    expect(dbSet).toHaveBeenCalledWith('household_tasks', 'hh-1', expect.arrayContaining([
      expect.objectContaining({ id: 'task-1', completed: true, completedBy: 'Papa Bear' }),
    ]));
    // Logged to nfc_completion_log
    expect(dbPrepend).toHaveBeenCalledWith('nfc_completion_log', 'hh-1', expect.objectContaining({
      text: 'Dishes done',
      person: 'Papa Bear',
      tagName: 'kitchen_sink',
    }));
  });

  it('processes incoming task, enriches through secretary, saves to household_tasks and sends notifications', async () => {
    // Mock secretary call
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      action: 'save',
      item: { id: 'item-1', text: 'Buy Groceries (enriched)', person: 'Mama Bear' },
    }), { status: 200 }));

    const res = await handler(createPostReq({
      type: 'task',
      text: 'Buy Groceries',
      person: 'Mama Bear',
      notify: true,
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe('saved');
    expect(body.type).toBe('task');
    expect(dbPrepend).toHaveBeenCalledWith('household_tasks', 'hh-1', expect.objectContaining({
      text: 'Buy Groceries (enriched)',
    }));
    expect(notifyIFTTT).toHaveBeenCalledWith('bearhouse_task', 'Buy Groceries (enriched)', 'Mama Bear');
    expect(notifyPush).toHaveBeenCalledWith('hh-1', 'Bear House — new item', 'Buy Groceries (enriched)');
  });

  it('skips item if secretary flags it as duplicate', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      action: 'skip',
      item: { reason: 'already exists' },
    }), { status: 200 }));

    const res = await handler(createPostReq({
      type: 'shopping',
      name: 'Milk',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe('skip');
    expect(body.reason).toBe('already exists');
    expect(dbPrepend).not.toHaveBeenCalled();
  });
});
