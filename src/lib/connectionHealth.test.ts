import { describe, expect, it } from 'vitest';
import {
  HA_STALE_AFTER_MS,
  assessHaFreshness,
  interpretHaHealth,
  resolveSettingsOpenRequest,
} from './connectionHealth';

const NOW = 1_700_000_000_000;

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alexa',
    label: 'Alexa Media Player',
    status: 'up',
    unavailable: 0,
    unknown: 0,
    total: 2,
    ...overrides,
  };
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    updatedAt: NOW - 60_000,
    overall: 'green',
    integrations: [row()],
    ...overrides,
  };
}

describe('assessHaFreshness', () => {
  it('treats missing, non-finite, blank, and non-timestamp values as unknown', () => {
    expect(assessHaFreshness(undefined, NOW)).toBe('unknown');
    expect(assessHaFreshness(null, NOW)).toBe('unknown');
    expect(assessHaFreshness(Number.NaN, NOW)).toBe('unknown');
    expect(assessHaFreshness(Number.POSITIVE_INFINITY, NOW)).toBe('unknown');
    expect(assessHaFreshness('', NOW)).toBe('unknown');
    expect(assessHaFreshness('   ', NOW)).toBe('unknown');
    expect(assessHaFreshness('not-a-date', NOW)).toBe('unknown');
    expect(assessHaFreshness({}, NOW)).toBe('unknown');
  });

  it('accepts an ISO string and stays fresh inside the 5 minute future skew', () => {
    expect(assessHaFreshness(new Date(NOW - 1000).toISOString(), NOW)).toBe('fresh');
    expect(assessHaFreshness(NOW + 4 * 60 * 1000, NOW)).toBe('fresh');
    expect(assessHaFreshness(NOW + 5 * 60 * 1000, NOW)).toBe('fresh');
  });

  it('returns unknown once the timestamp is more than 5 minutes ahead', () => {
    expect(assessHaFreshness(NOW + 6 * 60 * 1000, NOW)).toBe('unknown');
  });

  it('is fresh at exactly 26h and stale one millisecond later', () => {
    expect(assessHaFreshness(NOW - HA_STALE_AFTER_MS, NOW)).toBe('fresh');
    expect(assessHaFreshness(NOW - 25 * 60 * 60 * 1000, NOW)).toBe('fresh');
    expect(assessHaFreshness(NOW - HA_STALE_AFTER_MS - 1, NOW)).toBe('stale');
  });
});

describe('interpretHaHealth', () => {
  it('shows not-checked only when Home Assistant is configured and no snapshot exists', () => {
    expect(interpretHaHealth(null, { configured: true, now: NOW }).kind).toBe('unchecked');
    expect(interpretHaHealth(null, { configured: false, now: NOW }).kind).toBe('hidden');
    expect(interpretHaHealth(null, { configured: null, now: NOW }).kind).toBe('unknown');
    expect(interpretHaHealth(null, { configured: true, awaitingConfig: true, now: NOW }).kind).toBe('hidden');
  });

  it('shows status unknown for a malformed snapshot', () => {
    expect(interpretHaHealth({ updatedAt: NOW, overall: 'green', integrations: 'nope' }, { configured: true, now: NOW }).kind).toBe('unknown');
    expect(interpretHaHealth({ updatedAt: '', overall: 'green', integrations: [] }, { configured: true, now: NOW }).kind).toBe('unknown');
  });

  it('downgrades a stale green snapshot and does not offer settings', () => {
    const view = interpretHaHealth(
      snapshot({ updatedAt: NOW - HA_STALE_AFTER_MS - 1, overall: 'green' }),
      { configured: true, now: NOW },
    );
    expect(view.kind).toBe('snapshot');
    if (view.kind !== 'snapshot') return;
    expect(view.freshness).toBe('stale');
    expect(view.tone).toBe('stale');
    expect(view.showOpenSettings).toBe(false);
    expect(view.checkedLabel).toMatch(/Last checked \d+h ago/);
  });

  it('lets unreachable win over stale and offers settings', () => {
    const view = interpretHaHealth(
      snapshot({ updatedAt: NOW - 27 * 60 * 60 * 1000, overall: 'green', haUnreachable: true }),
      { configured: true, now: NOW },
    );
    expect(view.kind).toBe('snapshot');
    if (view.kind !== 'snapshot') return;
    expect(view.freshness).toBe('stale');
    expect(view.tone).toBe('down');
    expect(view.showOpenSettings).toBe(true);
  });

  it('rejects an empty row list, a fully dropped list, and any partially unreadable row', () => {
    expect(interpretHaHealth(snapshot({ integrations: [] }), { configured: true, now: NOW }).kind).toBe('unknown');
    expect(interpretHaHealth(
      snapshot({ integrations: [row({ id: 'https://evil.example', label: 'bad', status: 'down' })] }),
      { configured: true, now: NOW },
    ).kind).toBe('unknown');
    expect(interpretHaHealth(
      snapshot({
        integrations: [
          row({ id: 'https://evil.example', label: 'bad', status: 'down' }),
          row({ id: 'wyze_bridge', label: 'Wyze', status: 'down', unavailable: 1, total: 1 }),
        ],
      }),
      { configured: true, now: NOW },
    ).kind).toBe('unknown');
  });

  it('allows Fix It only for known integration ids', () => {
    const view = interpretHaHealth(
      snapshot({
        overall: 'red',
        integrations: [
          row({ id: 'wyze_bridge', label: 'Wyze\nCameras', status: 'down', unavailable: 1, total: 1 }),
          row({ id: 'custom_thing', label: 'Other', status: 'down', unavailable: 1, total: 1 }),
        ],
      }),
      { configured: true, now: NOW },
    );
    expect(view.kind).toBe('snapshot');
    if (view.kind !== 'snapshot') return;
    expect(view.integrations.map((i) => [i.id, i.canFix])).toEqual([
      ['wyze_bridge', true],
      ['custom_thing', false],
    ]);
    expect(view.integrations[0].label).toBe('Wyze Cameras');
    expect(view.showOpenSettings).toBe(true);
  });

  it('keeps a real snapshot visible while the configured check is still loading', () => {
    const view = interpretHaHealth(snapshot(), { configured: null, awaitingConfig: true, now: NOW });
    expect(view.kind).toBe('snapshot');
  });

  it('accepts a millisecond digit-string and rejects a seconds timestamp', () => {
    expect(assessHaFreshness(String(NOW - 1000), NOW)).toBe('fresh');
    expect(assessHaFreshness(String(Math.floor(NOW / 1000)), NOW)).toBe('unknown');
    expect(interpretHaHealth(snapshot({ updatedAt: Math.floor(NOW / 1000) }), { configured: true, now: NOW }).kind).toBe('unknown');
  });

  it('asks to check the device clock when the snapshot is too far in the future', () => {
    const view = interpretHaHealth(snapshot({ updatedAt: NOW + 6 * 60 * 1000 }), { configured: true, now: NOW });
    expect(view).toEqual({ kind: 'unknown', hint: 'Check the device clock.' });
  });
});

describe('resolveSettingsOpenRequest', () => {
  it('ignores invalid details and non-admin roles', () => {
    const good = { tab: 'integrations', integration: 'ha' };
    expect(resolveSettingsOpenRequest('child', good)).toBeNull();
    expect(resolveSettingsOpenRequest('pet', good)).toBeNull();
    expect(resolveSettingsOpenRequest(null, good)).toBeNull();
    expect(resolveSettingsOpenRequest('admin', null)).toBeNull();
    expect(resolveSettingsOpenRequest('admin', { tab: 'general' })).toBeNull();
    expect(resolveSettingsOpenRequest('admin', { tab: 'integrations', integration: 'gmail' })).toBeNull();
    expect(resolveSettingsOpenRequest('superadmin', { tab: 'integrations' })).toEqual({ tab: 'integrations' });
    expect(resolveSettingsOpenRequest('admin', good)).toEqual(good);
  });
});
