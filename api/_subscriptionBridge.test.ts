import { describe, it, expect, afterEach, vi } from 'vitest';
import { bridgeAllowed, tryBridge } from './_subscriptionBridge.js';

const set = () => {
  process.env.SUBSCRIPTION_BRIDGE_URL = 'https://bridge.example/';
  process.env.SUBSCRIPTION_BRIDGE_TOKEN = 't'.repeat(30);
  process.env.SUBSCRIPTION_BRIDGE_HOUSEHOLDS = 'h1, h2';
};
afterEach(() => {
  for (const k of ['URL', 'TOKEN', 'HOUSEHOLDS', 'PROVIDER']) delete process.env[`SUBSCRIPTION_BRIDGE_${k}`];
  vi.unstubAllGlobals();
});

describe('subscription bridge client', () => {
  it('is off unless configured and the household is listed', () => {
    expect(bridgeAllowed('h1')).toBe(false);
    set();
    expect(bridgeAllowed('h1')).toBe(true);
    expect(bridgeAllowed('other')).toBe(false);
    expect(bridgeAllowed(undefined)).toBe(false);
  });

  it('never calls out for an unlisted household', async () => {
    set();
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await tryBridge('other', 'hi')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('returns text, and null on failure', async () => {
    set();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'ok' }))));
    expect(await tryBridge('h1', 'hi')).toBe('ok');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 502 })));
    expect(await tryBridge('h1', 'hi')).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect(await tryBridge('h1', 'hi')).toBeNull();
  });
});
