import { describe, it, expect, vi } from 'vitest';
import {
  DisallowedUrlError,
  assertAllowedUrl,
  canonicalHaBase,
  fetchHomeAssistant,
  SIMPLEFIN_CLAIM_POLICY,
  SIMPLEFIN_ACCESS_POLICY,
  HOME_ASSISTANT_POLICY,
  type UrlAllowPolicy,
} from './_urlAllowlist';

/** Blocks private ranges but still allows public IP literals, so those branches stay tested. */
const PRIVATE_IP_POLICY: UrlAllowPolicy = {
  httpsOnly: true,
  allowUserinfo: false,
  allowedPorts: [443],
  blockPrivateAndReserved: true,
};

function expectDenied(raw: string, policy: Parameters<typeof assertAllowedUrl>[1]) {
  expect(() => assertAllowedUrl(raw, policy)).toThrow(DisallowedUrlError);
}

describe('assertAllowedUrl — SimpleFIN claim URLs', () => {
  it('accepts an official https claim URL', () => {
    const url = assertAllowedUrl(
      'https://beta-bridge.simplefin.org/simplefin/claim/abc',
      SIMPLEFIN_CLAIM_POLICY,
    );
    expect(url.hostname).toBe('beta-bridge.simplefin.org');
    expect(url.protocol).toBe('https:');
  });

  it('accepts bridge.simplefin.org', () => {
    const url = assertAllowedUrl(
      'https://bridge.simplefin.org/simplefin/claim/abc',
      SIMPLEFIN_CLAIM_POLICY,
    );
    expect(url.hostname).toBe('bridge.simplefin.org');
  });

  it('rejects http even on an official host', () => {
    expectDenied('http://beta-bridge.simplefin.org/simplefin/claim/abc', SIMPLEFIN_CLAIM_POLICY);
  });

  it('rejects a lookalike host that is not under simplefin.org', () => {
    expectDenied('https://beta-bridge.simplefin.org.evil.com/claim', SIMPLEFIN_CLAIM_POLICY);
  });

  it('rejects an arbitrary https host (SSRF via setup token)', () => {
    expectDenied('https://127.0.0.1/', SIMPLEFIN_CLAIM_POLICY);
    expectDenied('https://169.254.169.254/latest/meta-data/', SIMPLEFIN_CLAIM_POLICY);
    expectDenied('https://attacker.example/steal', SIMPLEFIN_CLAIM_POLICY);
  });

  it('rejects userinfo on the claim URL', () => {
    expectDenied('https://user:pass@beta-bridge.simplefin.org/simplefin/claim/abc', SIMPLEFIN_CLAIM_POLICY);
  });
});

describe('assertAllowedUrl — SimpleFIN access URLs', () => {
  it('accepts an official access URL with embedded basic-auth userinfo', () => {
    const url = assertAllowedUrl(
      'https://user:secret@beta-bridge.simplefin.org/simplefin',
      SIMPLEFIN_ACCESS_POLICY,
    );
    expect(url.username).toBe('user');
    expect(url.password).toBe('secret');
    expect(url.hostname).toBe('beta-bridge.simplefin.org');
  });

  it('rejects an access URL whose host is not SimpleFIN', () => {
    expectDenied('https://user:secret@evil.example/simplefin', SIMPLEFIN_ACCESS_POLICY);
  });
});

describe('assertAllowedUrl — Home Assistant URLs', () => {
  it('accepts a public https HA URL on 443', () => {
    const url = assertAllowedUrl('https://ha.example.com', HOME_ASSISTANT_POLICY);
    expect(url.hostname).toBe('ha.example.com');
  });

  it('accepts a Nabu Casa URL', () => {
    const url = assertAllowedUrl('https://abcdef.ui.nabu.casa', HOME_ASSISTANT_POLICY);
    expect(url.hostname).toBe('abcdef.ui.nabu.casa');
  });

  it('accepts public HA on port 8123', () => {
    const url = assertAllowedUrl('https://ha.example.com:8123', HOME_ASSISTANT_POLICY);
    expect(url.port).toBe('8123');
  });

  it('rejects http', () => {
    expectDenied('http://ha.example.com', HOME_ASSISTANT_POLICY);
  });

  it('rejects loopback, link-local, and RFC1918 destinations', () => {
    expectDenied('https://127.0.0.1/', HOME_ASSISTANT_POLICY);
    expectDenied('https://localhost/api/', HOME_ASSISTANT_POLICY);
    expectDenied('https://10.0.0.5:8123', HOME_ASSISTANT_POLICY);
    expectDenied('https://192.168.1.50:8123', HOME_ASSISTANT_POLICY);
    expectDenied('https://172.16.0.9/', HOME_ASSISTANT_POLICY);
    expectDenied('https://169.254.169.254/', HOME_ASSISTANT_POLICY);
  });

  it('rejects mDNS and internal hostnames', () => {
    expectDenied('https://homeassistant.local:8123', HOME_ASSISTANT_POLICY);
    expectDenied('https://ha.internal', HOME_ASSISTANT_POLICY);
  });

  it('rejects IPv6 loopback, unique-local, and IPv4-mapped loopback', () => {
    expectDenied('https://[::1]/', HOME_ASSISTANT_POLICY);
    expectDenied('https://[fd12:3456:789a::1]/', HOME_ASSISTANT_POLICY);
    expectDenied('https://[::ffff:127.0.0.1]/', HOME_ASSISTANT_POLICY);
  });

  it('rejects userinfo (credential smuggling)', () => {
    expectDenied('https://google.com@192.168.1.1/', HOME_ASSISTANT_POLICY);
  });

  it('rejects a non-HA port on an otherwise public host', () => {
    expectDenied('https://ha.example.com:22', HOME_ASSISTANT_POLICY);
  });

  it('rejects trailing-dot bypasses of the name blocklist', () => {
    expectDenied('https://localhost./', HOME_ASSISTANT_POLICY);
    expectDenied('https://foo.internal./', HOME_ASSISTANT_POLICY);
    expectDenied('https://ha.local.:8123', HOME_ASSISTANT_POLICY);
  });

  it('rejects single-label names and wildcard DNS suffixes', () => {
    expectDenied('https://metadata/', HOME_ASSISTANT_POLICY);
    expectDenied('https://kubernetes/', HOME_ASSISTANT_POLICY);
    expectDenied('https://127.0.0.1.nip.io/', HOME_ASSISTANT_POLICY);
    expectDenied('https://169.254.169.254.sslip.io/', HOME_ASSISTANT_POLICY);
  });

  it('rejects IP literals on the Home Assistant policy', () => {
    expectDenied('https://8.8.8.8/', HOME_ASSISTANT_POLICY);
    expectDenied('https://[2001:4860:4860::8888]/', HOME_ASSISTANT_POLICY);
  });

  it('strips query, hash, and a trailing dot from a saved base', () => {
    expect(canonicalHaBase('https://ha.example.com./api?x=1#frag')).toBe('https://ha.example.com/api');
  });

  it('refuses redirects when fetching Home Assistant', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    await fetchHomeAssistant('https://ha.example.com/', '/api/states', {
      headers: { Authorization: 'Bearer t' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ha.example.com/api/states',
      expect.objectContaining({ redirect: 'error', headers: { Authorization: 'Bearer t' } }),
    );
    vi.unstubAllGlobals();
  });
});

describe('assertAllowedUrl — private IP literals when literals are allowed', () => {
  it('allows a public address and blocks embedded-private transition addresses', () => {
    expect(assertAllowedUrl('https://8.8.8.8/', PRIVATE_IP_POLICY).hostname).toBe('8.8.8.8');
    expect(assertAllowedUrl('https://[2001:4860:4860::8888]/', PRIVATE_IP_POLICY).hostname).toContain('2001:4860:4860');
    expectDenied('https://198.18.0.1/', PRIVATE_IP_POLICY);
    expectDenied('https://[::7f00:1]/', PRIVATE_IP_POLICY);
    expectDenied('https://[2002:7f00:1::]/', PRIVATE_IP_POLICY);
    expectDenied('https://[64:ff9b::7f00:1]/', PRIVATE_IP_POLICY);
    expectDenied('https://[fec0::1]/', PRIVATE_IP_POLICY);
    expectDenied('https://[2001:0::80ff:fffe]/', PRIVATE_IP_POLICY);
  });
});
