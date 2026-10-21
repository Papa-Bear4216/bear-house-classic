import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbCountFlaggedHermesHouseholds = vi.fn();
const dbCountHermesRepairsBySuccess = vi.fn();
const dbCountPendingMemoryReview = vi.fn();
const dbGet = vi.fn();
const dbSet = vi.fn();
const resolveHouseholdIdByWebhookToken = vi.fn();
const notifyIFTTT = vi.fn();
const notifyPush = vi.fn();
const runFix = vi.fn();
vi.mock('./_db.js', () => ({
  dbCountFlaggedHermesHouseholds: (...args: unknown[]) => dbCountFlaggedHermesHouseholds(...args),
  dbCountHermesRepairsBySuccess: (...args: unknown[]) => dbCountHermesRepairsBySuccess(...args),
  dbCountPendingMemoryReview: (...args: unknown[]) => dbCountPendingMemoryReview(...args),
  dbGet: (...args: unknown[]) => dbGet(...args),
  dbSet: (...args: unknown[]) => dbSet(...args),
  resolveHouseholdIdByWebhookToken: (...args: unknown[]) => resolveHouseholdIdByWebhookToken(...args),
}));
vi.mock('./_haConfig.js', () => ({ resolveHaConfig: vi.fn(async () => ({ haUrl: 'http://ha.test', haToken: 'token' })) }));
vi.mock('./_notify.js', () => ({ notifyIFTTT: (...args: unknown[]) => notifyIFTTT(...args), notifyPush: (...args: unknown[]) => notifyPush(...args) }));
vi.mock('./ha-fix.js', () => ({ runFix: (...args: unknown[]) => runFix(...args) }));
vi.mock('./_integrationFixMap.js', () => ({ FIX_MAP: {}, resolveFix: () => ({ tier: 1, label: 'Integration', keyUrl: '', haReconfigPath: '' }) }));

import handler from './health-check';

describe('health-check Hermes section', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret';
    process.env.HOME_ASSISTANT_HOUSEHOLD_ID = 'ha-house';
    vi.resetAllMocks();
    dbCountHermesRepairsBySuccess.mockResolvedValue({ made: 4, failed: 1 });
    dbCountFlaggedHermesHouseholds.mockResolvedValue(2);
    dbCountPendingMemoryReview.mockResolvedValue(3);
    dbGet.mockResolvedValue({});
    dbSet.mockResolvedValue(undefined);
    runFix.mockResolvedValue({ ok: true });
  });

  it('reports global Hermes metrics alongside the HA health snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
    const res = await handler(new Request('https://example.test/api/health-check', { headers: { authorization: 'Bearer cron-secret' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hermes).toEqual({
      repairs24h: { made: 4, failed: 1 },
      flaggedHouseholds: 2,
      pendingReviewMemories: 3,
    });
  });

  it('keeps Hermes metrics visible when Home Assistant is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('HA offline'); }));
    const res = await handler(new Request('https://example.test/api/health-check', { headers: { authorization: 'Bearer cron-secret' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ haUnreachable: true, hermes: { pendingReviewMemories: 3 } });
  });
});
