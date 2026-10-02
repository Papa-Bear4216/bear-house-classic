import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { claimAccessUrl, fetchAccounts } from './_simplefin.js';

function asSetupToken(claimUrl: string): string {
  return btoa(claimUrl);
}

describe('SimpleFIN hostname allowlist', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('claimAccessUrl rejects a non-simplefin.org claim URL', async () => {
    // claimAccessUrl decodes the setup token then asserts the hostname.
    await expect(claimAccessUrl(asSetupToken('https://evil.internal/claim/abc')))
      .rejects.toThrow('not a SimpleFIN host');
  });

  it('claimAccessUrl rejects a setup token whose claim URL is localhost', async () => {
    await expect(claimAccessUrl(asSetupToken('https://localhost/claim/abc')))
      .rejects.toThrow('not a SimpleFIN host');
  });

  it('claimAccessUrl rejects a setup token whose returned access URL is not simplefin.org', async () => {
    const claimUrl = 'https://beta-bridge.simplefin.org/claim/abc';
    const badAccessUrl = 'https://user:pass@evil.internal/access/xyz';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(badAccessUrl)));
    await expect(claimAccessUrl(asSetupToken(claimUrl)))
      .rejects.toThrow('not a SimpleFIN host');
  });

  it('claimAccessUrl accepts a valid simplefin.org setup token', async () => {
    const claimUrl = 'https://beta-bridge.simplefin.org/claim/abc';
    const accessUrl = 'https://user:pass@beta-bridge.simplefin.org/access/xyz';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(accessUrl)));
    const result = await claimAccessUrl(asSetupToken(claimUrl));
    expect(result).toBe(accessUrl);
  });

  it('fetchAccounts rejects a non-simplefin.org access URL', async () => {
    await expect(
      fetchAccounts('https://user:pass@evil.internal/access/xyz', new Date(), new Date())
    ).rejects.toThrow('not a SimpleFIN host');
  });

  it('fetchAccounts rejects a localhost access URL', async () => {
    await expect(
      fetchAccounts('https://user:pass@localhost/access/xyz', new Date(), new Date())
    ).rejects.toThrow('not a SimpleFIN host');
  });

  it('fetchAccounts rejects a simplefin.com access URL (wrong TLD)', async () => {
    await expect(
      fetchAccounts('https://user:pass@simplefin.com/access/xyz', new Date(), new Date())
    ).rejects.toThrow('not a SimpleFIN host');
  });

  it('fetchAccounts accepts a valid simplefin.org access URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ accounts: [] }))));
    const result = await fetchAccounts(
      'https://user:pass@beta-bridge.simplefin.org/access/xyz',
      new Date('2024-01-01'),
      new Date('2024-02-01')
    );
    expect(result).toEqual([]);
  });

  it('claimAccessUrl rejects HTTP protocol', async () => {
    await expect(claimAccessUrl(asSetupToken('http://beta-bridge.simplefin.org/claim/abc')))
      .rejects.toThrow('must use HTTPS');
  });

  it('claimAccessUrl rejects embedded user credentials in claim URL', async () => {
    await expect(claimAccessUrl(asSetupToken('https://user:pass@beta-bridge.simplefin.org/claim/abc')))
      .rejects.toThrow('must not contain embedded user credentials');
  });

  it('claimAccessUrl rejects domains suffix-spoofing simplefin.org', async () => {
    await expect(claimAccessUrl(asSetupToken('https://attacker-simplefin.org/claim/abc')))
      .rejects.toThrow('not a SimpleFIN host');
  });

  it('claimAccessUrl rejects HTTP 302 redirects', async () => {
    const claimUrl = 'https://beta-bridge.simplefin.org/claim/abc';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/' } })));
    await expect(claimAccessUrl(asSetupToken(claimUrl)))
      .rejects.toThrow('SimpleFIN claim endpoint returned an illegal redirect');
  });

  it('claimAccessUrl rejects non-standard ports to prevent port scanning', async () => {
    await expect(claimAccessUrl(asSetupToken('https://beta-bridge.simplefin.org:6379/claim/abc')))
      .rejects.toThrow('must use default HTTPS port');
  });

  it('claimAccessUrl rejects opaqueredirect responses', async () => {
    const claimUrl = 'https://beta-bridge.simplefin.org/claim/abc';
    const fakeOpaque = { ok: false, status: 0, type: 'opaqueredirect' } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn(async () => fakeOpaque));
    await expect(claimAccessUrl(asSetupToken(claimUrl)))
      .rejects.toThrow('SimpleFIN claim endpoint returned an illegal redirect');
  });

  it('fetchAccounts rejects HTTP 301 redirects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 301, headers: { Location: 'http://169.254.169.254/' } })));
    await expect(
      fetchAccounts('https://user:pass@beta-bridge.simplefin.org/access/xyz', new Date(), new Date())
    ).rejects.toThrow('SimpleFIN accounts endpoint returned an illegal redirect');
  });

  it('claimAccessUrl rejects invalid base64 setup tokens', async () => {
    await expect(claimAccessUrl('not_valid_base64!!!'))
      .rejects.toThrow('Setup token is not valid base64');
  });

  it('claimAccessUrl rejects domains that contain simplefin.org as a subdomain or prefix', async () => {
    await expect(claimAccessUrl(asSetupToken('https://simplefin.org.evil.com/claim/abc')))
      .rejects.toThrow('not a SimpleFIN host');
    await expect(claimAccessUrl(asSetupToken('https://evilsimplefin.org/claim/abc')))
      .rejects.toThrow('not a SimpleFIN host');
  });
});

