import { describe, it, expect, afterEach, vi } from 'vitest';
import { tryCheapModel, cheapModelEnabled } from './_cheapModel.js';

afterEach(() => {
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.VERCEL_OIDC_TOKEN;
  delete process.env.HERMES_CHEAP_MODEL;
  vi.unstubAllGlobals();
});

describe('cheap model tier', () => {
  it('is off without a gateway key and never calls out', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(cheapModelEnabled()).toBe(false);
    expect(await tryCheapModel('hi')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('falls back to the deployment OIDC token when no key is set', async () => {
    process.env.VERCEL_OIDC_TOKEN = 'oidc.jwt.token';
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })));
    vi.stubGlobal('fetch', f);
    expect(cheapModelEnabled()).toBe(true);
    expect(await tryCheapModel('hi')).toBe('ok');
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer oidc.jwt.token');
  });

  it('can be switched off explicitly', () => {
    process.env.AI_GATEWAY_API_KEY = 'vck_x';
    process.env.HERMES_CHEAP_MODEL = 'off';
    expect(cheapModelEnabled()).toBe(false);
  });

  it('calls the gateway with the default model and returns the text', async () => {
    process.env.AI_GATEWAY_API_KEY = 'vck_x';
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })));
    vi.stubGlobal('fetch', f);
    expect(await tryCheapModel('hi', 100)).toBe('ok');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://ai-gateway.vercel.sh/v1/chat/completions');
    expect(JSON.parse(init.body).model).toBe('anthropic/claude-haiku-5.5');
    expect(init.headers.Authorization).toBe('Bearer vck_x');
  });

  it('returns null on HTTP errors, empty text and network failures', async () => {
    process.env.AI_GATEWAY_API_KEY = 'vck_x';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    expect(await tryCheapModel('hi')).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: ' ' } }] }))));
    expect(await tryCheapModel('hi')).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect(await tryCheapModel('hi')).toBeNull();
  });
});
