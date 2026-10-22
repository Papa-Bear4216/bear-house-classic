import { afterEach, describe, expect, it } from 'vitest';
import { isAllowedOrigin } from './middleware';

describe('middleware CORS allowlist', () => {
  afterEach(() => {
    delete process.env.CORS_ALLOWED_ORIGINS;
  });

  it('allows the production and Capacitor origins', () => {
    expect(isAllowedOrigin('https://hotmessexpress.lol')).toBe(true);
    expect(isAllowedOrigin('https://www.hotmessexpress.lol')).toBe(true);
    expect(isAllowedOrigin('https://localhost')).toBe(true);
  });

  it('rejects arbitrary *.vercel.app origins', () => {
    expect(isAllowedOrigin('https://evil.vercel.app')).toBe(false);
    expect(isAllowedOrigin('https://bearhouseos.vercel.app')).toBe(false);
  });

  it('allows only exact origins listed in CORS_ALLOWED_ORIGINS', () => {
    process.env.CORS_ALLOWED_ORIGINS = ' https://preview-1.vercel.app , https://preview-2.vercel.app ';
    expect(isAllowedOrigin('https://preview-1.vercel.app')).toBe(true);
    expect(isAllowedOrigin('https://preview-2.vercel.app')).toBe(true);
    expect(isAllowedOrigin('https://preview-3.vercel.app')).toBe(false);
    expect(isAllowedOrigin('https://preview-1.vercel.app.evil.com')).toBe(false);
  });
});
