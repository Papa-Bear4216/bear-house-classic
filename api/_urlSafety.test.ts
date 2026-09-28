import { describe, it, expect } from 'vitest';
import { isPrivateOrInternalHost, validateOutboundUrl } from './_urlSafety';

describe('isPrivateOrInternalHost', () => {
  it('flags RFC 1918 private ranges', () => {
    expect(isPrivateOrInternalHost('10.0.0.1')).toBe(true);
    expect(isPrivateOrInternalHost('172.16.0.1')).toBe(true);
    expect(isPrivateOrInternalHost('172.31.255.255')).toBe(true);
    expect(isPrivateOrInternalHost('192.168.1.1')).toBe(true);
  });

  it('does not flag the 172.x range outside 172.16-172.31', () => {
    expect(isPrivateOrInternalHost('172.32.0.1')).toBe(false);
    expect(isPrivateOrInternalHost('172.15.255.255')).toBe(false);
  });

  it('flags loopback', () => {
    expect(isPrivateOrInternalHost('127.0.0.1')).toBe(true);
    expect(isPrivateOrInternalHost('127.255.255.255')).toBe(true);
    expect(isPrivateOrInternalHost('::1')).toBe(true);
  });

  it('flags link-local and cloud metadata (169.254.169.254)', () => {
    expect(isPrivateOrInternalHost('169.254.169.254')).toBe(true);
    expect(isPrivateOrInternalHost('169.254.0.1')).toBe(true);
  });

  it('flags CGNAT range', () => {
    expect(isPrivateOrInternalHost('100.64.0.1')).toBe(true);
    expect(isPrivateOrInternalHost('100.127.255.255')).toBe(true);
  });

  it('flags localhost and internal-looking hostnames', () => {
    expect(isPrivateOrInternalHost('localhost')).toBe(true);
    expect(isPrivateOrInternalHost('myhost.local')).toBe(true);
    expect(isPrivateOrInternalHost('router.internal')).toBe(true);
  });

  it('flags IPv6 unique-local and link-local', () => {
    expect(isPrivateOrInternalHost('fc00::1')).toBe(true);
    expect(isPrivateOrInternalHost('fd12:3456::1')).toBe(true);
    expect(isPrivateOrInternalHost('fe80::1')).toBe(true);
  });

  it('does not flag ordinary public hosts', () => {
    expect(isPrivateOrInternalHost('example.com')).toBe(false);
    expect(isPrivateOrInternalHost('8.8.8.8')).toBe(false);
    expect(isPrivateOrInternalHost('my-home-assistant.duckdns.org')).toBe(false);
  });
});

describe('validateOutboundUrl', () => {
  it('rejects a private-IP URL', () => {
    expect(validateOutboundUrl('https://169.254.169.254/latest/meta-data/')).toMatch(/private|internal/i);
  });

  it('rejects non-https by default', () => {
    expect(validateOutboundUrl('http://example.com')).toMatch(/https/i);
  });

  it('rejects a malformed URL', () => {
    expect(validateOutboundUrl('not a url')).toBeTruthy();
  });

  it('accepts a normal public https URL', () => {
    expect(validateOutboundUrl('https://my-home-assistant.duckdns.org:8123')).toBeNull();
  });
});
