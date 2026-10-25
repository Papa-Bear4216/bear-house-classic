// Shared destination policy for server-side fetches of caller-controlled URLs.
// Edge-safe: hostname/IP checks only (no Node dns). Residual risk: an ordinary
// public name whose A/AAAA record points at a private address (including a
// record that changes after the URL is saved). Known wildcard-DNS suffixes are
// rejected. Callers must also set redirect: 'error' so a 3xx cannot hop onto
// an internal host. Home Assistant fetches go through fetchHomeAssistant.

export class DisallowedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DisallowedUrlError';
  }
}

export type UrlAllowPolicy = {
  httpsOnly: boolean;
  /** Host must equal one of these, or be a subdomain of one (suffix match). */
  allowedHostSuffixes?: readonly string[];
  allowUserinfo: boolean;
  /** Empty / default https port is treated as 443. */
  allowedPorts: readonly number[];
  blockPrivateAndReserved: boolean;
  /** Reject every IP literal. Used for Home Assistant, where real hosts are names. */
  rejectIpLiterals?: boolean;
};

export const SIMPLEFIN_CLAIM_POLICY: UrlAllowPolicy = {
  httpsOnly: true,
  allowedHostSuffixes: ['simplefin.org'],
  allowUserinfo: false,
  allowedPorts: [443],
  blockPrivateAndReserved: true,
};

export const SIMPLEFIN_ACCESS_POLICY: UrlAllowPolicy = {
  ...SIMPLEFIN_CLAIM_POLICY,
  allowUserinfo: true,
};

export const HOME_ASSISTANT_POLICY: UrlAllowPolicy = {
  httpsOnly: true,
  allowUserinfo: false,
  allowedPorts: [443, 8123],
  blockPrivateAndReserved: true,
  rejectIpLiterals: true,
};

/** Saved and probed HA base: https, allowlisted, no query/hash, no trailing slash. */
export function canonicalHaBase(raw: string): string {
  const url = assertAllowedUrl(raw, HOME_ASSISTANT_POLICY);
  url.hostname = url.hostname.toLowerCase().replace(/\.+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

/** Use on every fetch of a URL that passed assertAllowedUrl. */
export const DENY_REDIRECTS: RequestInit = { redirect: 'error' };

const HA_FETCH_TIMEOUT_MS = 8_000;

/**
 * Fetch a path on an already-resolved HA base. Redirects are refused so a
 * public host cannot 302 onto an internal address. Household-saved URLs are
 * checked in resolveHaConfig; this helper covers every later request.
 */
export function fetchHomeAssistant(haUrl: string | undefined, path: string, init: RequestInit = {}): Promise<Response> {
  const { signal, ...rest } = init;
  const base = (haUrl ?? '').replace(/\/$/, '');
  return fetch(`${base}${path}`, {
    ...rest,
    redirect: 'error',
    signal: signal ?? AbortSignal.timeout(HA_FETCH_TIMEOUT_MS),
  });
}

const BLOCKED_HOST_LABELS = new Set(['localhost', 'localhost.localdomain']);
const BLOCKED_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home', '.home.arpa', '.corp'];
const WILDCARD_DNS_SUFFIXES = ['.nip.io', '.sslip.io', '.xip.io', '.localtest.me'];

export function assertAllowedUrl(raw: string, policy: UrlAllowPolicy): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DisallowedUrlError('Invalid URL');
  }

  if (policy.httpsOnly && url.protocol !== 'https:') {
    throw new DisallowedUrlError('URL must use https');
  }
  if (!policy.httpsOnly && url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new DisallowedUrlError('URL must use http or https');
  }

  if (!policy.allowUserinfo && (url.username || url.password)) {
    throw new DisallowedUrlError('URL must not include credentials');
  }

  // WHATWG keeps a trailing dot, so "localhost." would miss the label blocklist.
  const host = url.hostname.toLowerCase().replace(/\.+$/, '');
  if (!host || host.split('.').some((label) => label === '')) {
    throw new DisallowedUrlError('Invalid hostname');
  }

  if (policy.allowedHostSuffixes && !hostMatchesSuffixes(host, policy.allowedHostSuffixes)) {
    throw new DisallowedUrlError('URL host is not on the allowlist');
  }

  const port = url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80);
  if (!policy.allowedPorts.includes(port)) {
    throw new DisallowedUrlError('URL port is not allowed');
  }

  if (WILDCARD_DNS_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix))) {
    throw new DisallowedUrlError('URL host is not a permitted destination');
  }

  const literal = isIpLiteral(host);
  if (!literal && !host.includes('.')) {
    throw new DisallowedUrlError('Hostname must be fully qualified');
  }
  if (policy.rejectIpLiterals && literal) {
    throw new DisallowedUrlError('IP literals are not allowed');
  }

  if (policy.blockPrivateAndReserved && isBlockedHost(host)) {
    throw new DisallowedUrlError('URL host is not a permitted destination');
  }

  return url;
}

function hostMatchesSuffixes(host: string, suffixes: readonly string[]): boolean {
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function isBlockedHost(host: string): boolean {
  if (BLOCKED_HOST_LABELS.has(host)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return true;

  const ipHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

  if (ipHost.includes(':')) {
    const ipv6 = parseIpv6(ipHost);
    // Unparseable colon-form hosts fail closed. A name never contains ':'.
    if (!ipv6) return true;
    return isBlockedIpv6(ipv6);
  }

  const ipv4 = parseIpv4(ipHost);
  if (ipv4 !== null) return isBlockedIpv4(ipv4);

  return false;
}

/** Strict dotted-decimal IPv4 (rejects octal/hex/decimal-integer forms). */
function parseIpv4(host: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const octets = m.slice(1, 5).map(Number);
  if (octets.some((n) => n > 255)) return null;
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

function isBlockedIpv4(addr: number): boolean {
  const inRange = (base: number, maskBits: number) => {
    const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
    return (addr & mask) === (base & mask);
  };
  return (
    inRange(0x00000000, 8) ||   // 0.0.0.0/8
    inRange(0x0a000000, 8) ||   // 10.0.0.0/8
    inRange(0x7f000000, 8) ||   // 127.0.0.0/8
    inRange(0xa9fe0000, 16) ||  // 169.254.0.0/16
    inRange(0xac100000, 12) ||  // 172.16.0.0/12
    inRange(0xc0a80000, 16) ||  // 192.168.0.0/16
    inRange(0x64400000, 10) ||  // 100.64.0.0/10 CGNAT
    inRange(0xc0000000, 24) ||  // 192.0.0.0/24
    inRange(0xc0000200, 24) ||  // 192.0.2.0/24 TEST-NET-1
    inRange(0xc6336400, 24) ||  // 198.51.100.0/24 TEST-NET-2
    inRange(0xcb007100, 24) ||  // 203.0.113.0/24 TEST-NET-3
    inRange(0xc6120000, 15) ||  // 198.18.0.0/15 benchmarking
    inRange(0xe0000000, 4) ||   // 224.0.0.0/4 multicast
    inRange(0xf0000000, 4)      // 240.0.0.0/4 reserved
  );
}

function isIpLiteral(host: string): boolean {
  const ipHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (ipHost.includes(':')) return true;
  return parseIpv4(ipHost) !== null;
}

function parseIpv6(host: string): number[] | null {
  // WHATWG hostname for IPv6 is unbracketed, e.g. "::1" or "::ffff:192.168.1.1"
  if (!host.includes(':')) return null;
  const lastColon = host.lastIndexOf(':');
  const dotted = host.slice(lastColon + 1);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(dotted)) {
    const v4 = parseIpv4(dotted);
    if (v4 === null) return null;
    const mapped = [
      (v4 >>> 16) & 0xffff,
      v4 & 0xffff,
    ];
    const head = host.slice(0, lastColon);
    const expanded = expandIpv6(head, 6);
    if (!expanded) return null;
    return [...expanded, ...mapped];
  }
  return expandIpv6(host, 8);
}

function expandIpv6(host: string, groupCount: number): number[] | null {
  if (host.includes('.')) return null;
  const halves = host.split('::');
  if (halves.length > 2) return null;
  const parseGroup = (s: string): number[] | null => {
    if (s === '') return [];
    const parts = s.split(':');
    const nums: number[] = [];
    for (const p of parts) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(p)) return null;
      nums.push(parseInt(p, 16));
    }
    return nums;
  };
  if (halves.length === 1) {
    const groups = parseGroup(halves[0]);
    return groups && groups.length === groupCount ? groups : null;
  }
  const left = parseGroup(halves[0]);
  const right = parseGroup(halves[1]);
  if (!left || !right) return null;
  const missing = groupCount - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...Array(missing).fill(0), ...right];
}

function isBlockedIpv6(groups: number[]): boolean {
  if (groups.length !== 8) return true;
  const allZero = groups.every((g) => g === 0);
  if (allZero) return true; // ::
  if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0
    && groups[4] === 0 && groups[5] === 0 && groups[6] === 0 && groups[7] === 1) {
    return true; // ::1
  }
  const v4FromTail = () => ((groups[6] << 16) | groups[7]) >>> 0;

  // IPv4-mapped ::ffff:x.x.x.x (parser emits ::ffff:7f00:1, not dotted form)
  if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0
    && groups[4] === 0 && groups[5] === 0xffff) {
    return isBlockedIpv4(v4FromTail());
  }
  // IPv4-compatible ::x.x.x.x, plus :: and ::1
  if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0
    && groups[4] === 0 && groups[5] === 0) {
    return isBlockedIpv4(v4FromTail());
  }
  const prefix = groups[0];
  if ((prefix & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((prefix & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((prefix & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local
  if ((prefix & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (prefix === 0x2001 && groups[1] === 0xdb8) return true; // documentation
  // 6to4 2002::/16 embeds IPv4 in groups 1-2
  if (prefix === 0x2002) {
    const v4 = ((groups[1] << 16) | groups[2]) >>> 0;
    return isBlockedIpv4(v4);
  }
  // NAT64 well-known prefix 64:ff9b::/96 embeds IPv4 in the last 32 bits
  if (prefix === 0x64 && groups[1] === 0xff9b && groups[2] === 0 && groups[3] === 0
    && groups[4] === 0 && groups[5] === 0) {
    return isBlockedIpv4(v4FromTail());
  }
  // Teredo 2001:0::/32 hides the client IPv4 as the inverse of the last 32 bits
  if (prefix === 0x2001 && groups[1] === 0) {
    const v4 = (~v4FromTail()) >>> 0;
    return isBlockedIpv4(v4);
  }
  return false;
}
