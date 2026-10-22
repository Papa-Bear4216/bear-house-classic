import { afterEach, describe, expect, it, vi } from 'vitest';
import { webhookToken } from './_webhookToken';

const req = (headers: Record<string, string> = {}) => new Request('https://x.test/api/y', { method: 'POST', headers });

describe('webhookToken', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prefers the x-webhook-token header and does not warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(webhookToken(req({ 'x-webhook-token': 'hdr' }), 'body', 'r')).toBe('hdr');
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to the body token with a deprecation warning that never contains the token', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(webhookToken(req(), 'secret-body-token', 'finance')).toBe('secret-body-token');
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0][0]);
    expect(logged).toContain('finance');
    expect(logged).not.toContain('secret-body-token');
  });

  it('returns an empty string when no token is supplied or the body token is not a string', () => {
    expect(webhookToken(req(), undefined, 'r')).toBe('');
    expect(webhookToken(req(), 123, 'r')).toBe('');
  });
});
