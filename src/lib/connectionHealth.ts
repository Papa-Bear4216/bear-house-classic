// Freshness for the Home Assistant health snapshot written by api/health-check.ts.
// The daily cron is `0 7 * * *`; 26h avoids a false stale alarm on a slightly late run.
// updatedAt is Date.now() milliseconds. family_data key `system_health` is what sync.ts caches.

import { isAdmin, type UserRole } from './familyos';

export const OPEN_SETTINGS_EVENT = 'familyos:open-settings';
export const HA_STALE_AFTER_MS = 26 * 60 * 60 * 1000;
export const HA_FUTURE_SKEW_MS = 5 * 60 * 1000;

/**
 * Client allowlist for Fix It. These are the FIX_MAP keys in api/_integrationFixMap.ts.
 * api/ha-fix.ts still accepts any non-empty integration string and falls back to a
 * generic tier-3 fix, so this list is what stops a snapshot id from becoming a target.
 */
export const HA_FIX_IDS = ['wyze_bridge', 'google_ai', 'alexa'] as const;

/** Timestamps below this are seconds or garbage, not Date.now() milliseconds. */
const MIN_UPDATED_AT_MS = 1_000_000_000_000;

export const SETTINGS_TABS = ['integrations'] as const;
export const SETTINGS_INTEGRATIONS = ['ha'] as const;

export type SettingsTabIntent = (typeof SETTINGS_TABS)[number];
export type SettingsIntegrationIntent = (typeof SETTINGS_INTEGRATIONS)[number];
export type SettingsIntent = { tab: SettingsTabIntent; integration?: SettingsIntegrationIntent };

export type Freshness = 'fresh' | 'stale' | 'unknown';
export type HaIntegrationStatus = 'up' | 'degraded' | 'down';
export type HaTone = 'down' | 'stale' | 'degraded' | 'up';

export type SafeHaIntegration = {
  id: string;
  label: string;
  status: HaIntegrationStatus;
  unavailable: number;
  unknown: number;
  total: number;
  autoHealed: boolean;
  canFix: boolean;
};

export type HaHealthView =
  | { kind: 'hidden' }
  | { kind: 'unchecked' }
  | { kind: 'unknown'; hint?: string }
  | {
      kind: 'snapshot';
      freshness: 'fresh' | 'stale';
      tone: HaTone;
      haUnreachable: boolean;
      integrations: SafeHaIntegration[];
      updatedAt: number;
      ageMs: number;
      showOpenSettings: boolean;
      checkedLabel: string;
    };

const STATUSES = new Set<HaIntegrationStatus>(['up', 'degraded', 'down']);
const OVERALLS = new Set(['green', 'yellow', 'red']);

export function assessHaFreshness(
  updatedAt: unknown,
  now = Date.now(),
  staleAfterMs = HA_STALE_AFTER_MS,
): Freshness {
  const ts = coerceTimestamp(updatedAt);
  if (ts === null || ts < MIN_UPDATED_AT_MS) return 'unknown';
  if (ts > now + HA_FUTURE_SKEW_MS) return 'unknown';
  if (now - ts > staleAfterMs) return 'stale';
  return 'fresh';
}

export function formatAge(ageMs: number): string {
  if (ageMs < 60_000) return 'just now';
  const mins = Math.floor(ageMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function formatCheckedAgo(ageMs: number): string {
  const age = formatAge(ageMs);
  return age === 'just now' ? 'Last checked just now' : `Last checked ${age}`;
}

export function parseSettingsIntent(detail: unknown): SettingsIntent | null {
  if (!detail || typeof detail !== 'object') return null;
  const d = detail as Record<string, unknown>;
  if (typeof d.tab !== 'string' || !(SETTINGS_TABS as readonly string[]).includes(d.tab)) return null;
  if (d.integration === undefined) return { tab: d.tab as SettingsTabIntent };
  if (typeof d.integration !== 'string' || !(SETTINGS_INTEGRATIONS as readonly string[]).includes(d.integration)) {
    return null;
  }
  return { tab: d.tab as SettingsTabIntent, integration: d.integration as SettingsIntegrationIntent };
}

/** Fail closed: same admin gate as Settings → Integrations, and only a whitelisted target. */
export function resolveSettingsOpenRequest(role: UserRole | null | undefined, detail: unknown): SettingsIntent | null {
  if (!role || !isAdmin(role)) return null;
  return parseSettingsIntent(detail);
}

export function requestOpenHaSettings(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, {
    detail: { tab: 'integrations', integration: 'ha' } satisfies SettingsIntent,
  }));
}

export function interpretHaHealth(
  raw: unknown,
  options: { configured: boolean | null; awaitingConfig?: boolean; now?: number },
): HaHealthView {
  const now = options.now ?? Date.now();
  const parsed = parseSnapshot(raw, now);
  if (parsed === 'empty') {
    if (options.awaitingConfig) return { kind: 'hidden' };
    if (options.configured === false) return { kind: 'hidden' };
    if (options.configured === true) return { kind: 'unchecked' };
    return { kind: 'unknown' };
  }
  if (parsed === 'malformed') return { kind: 'unknown' };
  if (parsed.freshness === 'unknown') {
    return parsed.clockSkew ? { kind: 'unknown', hint: 'Check the device clock.' } : { kind: 'unknown' };
  }

  const anyDown = parsed.haUnreachable || parsed.overall === 'red' || parsed.integrations.some((i) => i.status === 'down');
  const anyDegraded = parsed.overall === 'yellow' || parsed.integrations.some((i) => i.status === 'degraded');
  const tone: HaTone = anyDown ? 'down' : parsed.freshness === 'stale' ? 'stale' : anyDegraded ? 'degraded' : 'up';

  return {
    kind: 'snapshot',
    freshness: parsed.freshness,
    tone,
    haUnreachable: parsed.haUnreachable,
    integrations: parsed.integrations,
    updatedAt: parsed.updatedAt,
    ageMs: parsed.ageMs,
    showOpenSettings: tone === 'down',
    checkedLabel: formatCheckedAgo(parsed.ageMs),
  };
}

function coerceTimestamp(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const asNumber = Number(trimmed);
      return Number.isFinite(asNumber) ? asNumber : null;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nonNegInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1_000_000) return null;
  return value;
}

function parseIntegration(raw: unknown): SafeHaIntegration | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string' || !/^[a-z0-9_]{1,64}$/.test(row.id)) return null;
  if (typeof row.label !== 'string') return null;
  const label = row.label.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!label || label.length > 80) return null;
  if (typeof row.status !== 'string' || !STATUSES.has(row.status as HaIntegrationStatus)) return null;
  const unavailable = nonNegInt(row.unavailable);
  const unknown = nonNegInt(row.unknown);
  const total = nonNegInt(row.total);
  if (unavailable === null || unknown === null || total === null) return null;
  const status = row.status as HaIntegrationStatus;
  const canFix = status !== 'up' && (HA_FIX_IDS as readonly string[]).includes(row.id);
  return {
    id: row.id,
    label,
    status,
    unavailable,
    unknown,
    total,
    autoHealed: row.autoHealed === true,
    canFix,
  };
}

type ParsedSnapshot = {
  freshness: Freshness;
  clockSkew: boolean;
  updatedAt: number;
  ageMs: number;
  overall: 'green' | 'yellow' | 'red';
  haUnreachable: boolean;
  integrations: SafeHaIntegration[];
};

function parseSnapshot(raw: unknown, now: number): ParsedSnapshot | 'empty' | 'malformed' {
  if (raw == null) return 'empty';
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'malformed';
  const snap = raw as Record<string, unknown>;
  const updatedAt = coerceTimestamp(snap.updatedAt);
  if (updatedAt === null) return 'malformed';
  if (typeof snap.overall !== 'string' || !OVERALLS.has(snap.overall)) return 'malformed';
  if (!Array.isArray(snap.integrations)) return 'malformed';
  const rows = snap.integrations.map(parseIntegration);
  const integrations = rows.filter((row): row is SafeHaIntegration => row !== null);
  // An empty list, or any row we had to drop, is not a healthy snapshot.
  if (integrations.length === 0 || integrations.length < rows.length) return 'malformed';
  const freshness = assessHaFreshness(updatedAt, now);
  const ageMs = Math.max(0, now - updatedAt);
  return {
    freshness,
    clockSkew: updatedAt > now + HA_FUTURE_SKEW_MS,
    updatedAt,
    ageMs,
    overall: snap.overall as 'green' | 'yellow' | 'red',
    haUnreachable: snap.haUnreachable === true,
    integrations,
  };
}
