/**
 * Best-effort SSRF defense for outbound fetches to caller-influenced URLs
 * (self-hosted Home Assistant instances, SimpleFIN bridge access URLs).
 *
 * Edge runtime has no node:net / raw-socket access, so this can only
 * validate the hostname/IP-literal string before the request, not pin the
 * resolved IP at TCP-connect time — it does NOT close a DNS-rebinding
 * attack (a hostname that resolves to a public IP now and a private IP at
 * request time). This is "mitigated", not "fixed": treat it as raising the
 * bar against casual/automated SSRF probes, not a hard guarantee, and pair
 * it with role-gating wherever the caller isn't already trusted.
 */

const PRIVATE_IPV4_RANGES: Array<[number, number]> = [
  [ipToInt(10, 0, 0, 0), ipToInt(10, 255, 255, 255)],       // 10.0.0.0/8
  [ipToInt(172, 16, 0, 0), ipToInt(172, 31, 255, 255)],     // 172.16.0.0/12
  [ipToInt(192, 168, 0, 0), ipToInt(192, 168, 255, 255)],   // 192.168.0.0/16
  [ipToInt(127, 0, 0, 0), ipToInt(127, 255, 255, 255)],     // 127.0.0.0/8 loopback
  [ipToInt(169, 254, 0, 0), ipToInt(169, 254, 255, 255)],   // 169.254.0.0/16 link-local + cloud metadata
  [ipToInt(100, 64, 0, 0), ipToInt(100, 127, 255, 255)],    // 100.64.0.0/10 CGNAT
  [ipToInt(0, 0, 0, 0), ipToInt(0, 255, 255, 255)],         // 0.0.0.0/8 "this network"
];

function ipToInt(a: number, b: number, c: number, d: number): number {
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function parseIPv4(host: string): number | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1, 5).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ipToInt(parts[0], parts[1], parts[2], parts[3]);
}

function isPrivateIPv4(host: string): boolean {
  const ip = parseIPv4(host);
  if (ip === null) return false;
  return PRIVATE_IPV4_RANGES.some(([lo, hi]) => ip >= lo && ip <= hi);
}

function isPrivateIPv6(host: string): boolean {
  // host from new URL().hostname is already stripped of the [ ] brackets.
  const h = host.toLowerCase();
  if (h === '::1') return true; // loopback
  if (h === '::') return true; // unspecified
  if (h.startsWith('fe80:') || h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')) return true; // fe80::/10 link-local
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // fc00::/7 unique local
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — check the embedded IPv4.
  const mapped = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

/**
 * True if the hostname is a bare IP literal in a private/reserved/loopback/
 * link-local/CGNAT/metadata range, or an obviously internal-only hostname
 * (localhost, .local, .internal). Does NOT resolve DNS — a public hostname
 * that resolves to a private IP at fetch time is not caught here (DNS
 * rebinding); see the module doc comment.
 */
export function isPrivateOrInternalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (isPrivateIPv4(host)) return true;
  if (isPrivateIPv6(host)) return true;
  return false;
}

/**
 * Validates a caller-supplied URL before an outbound server-side fetch.
 * Requires HTTPS and rejects private/internal hosts. Returns an error
 * message if unsafe, or null if it passes this (best-effort) check.
 */
export function validateOutboundUrl(rawUrl: string, opts?: { requireHttps?: boolean }): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return 'Not a valid URL';
  }
  const requireHttps = opts?.requireHttps ?? true;
  if (requireHttps && url.protocol !== 'https:') return 'URL must use https://';
  if (!requireHttps && url.protocol !== 'https:' && url.protocol !== 'http:') return 'URL must use http:// or https://';
  if (isPrivateOrInternalHost(url.hostname)) return 'URL must not point to a private, loopback, or internal address';
  return null;
}
