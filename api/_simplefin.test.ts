import { describe, it, expect, vi, beforeEach } from 'vitest';
import { claimAccessUrl, fetchAccounts } from './_simplefin.js';

function asSetupToken(claimUrl: string): string {
  return btoa(claimUrl);
}

describe('SimpleFIN hostname allowlist', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
});
