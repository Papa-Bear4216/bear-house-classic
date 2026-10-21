export const config = { runtime: 'edge' };

import {
  allHouseholdIds,
  dbArchiveExpiredMemory,
  dbGetHermesRepairSummary,
  dbLogHermesRepair,
  dbUpsertHermesWeeklyFeedback,
} from './_db.js';
import { json as j, serverError } from './_responseHelpers.js';

/** Weekly service-only rollup. Suggestions are developer review notes only. */
export default async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorization = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const supplied = req.headers.get('x-cron-secret') || authorization;
  if (!secret || supplied !== secret) return j({ error: 'Unauthorized' }, 401);
  if (req.method !== 'GET' && req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const householdIds = await allHouseholdIds();
    const globalByType: Record<string, number> = {};
    let repairsMade = 0;
    let repairsFailed = 0;
    let expiredArchived = 0;
    const errors: string[] = [];

    for (const householdId of householdIds) {
      try {
        const archived = await dbArchiveExpiredMemory(householdId, now);
        expiredArchived += archived;
        if (archived) {
          await dbLogHermesRepair(householdId, {
            issueType: 'memory_expired',
            detail: `Archived ${archived} expired memory fact${archived === 1 ? '' : 's'}.`,
            actionTaken: 'Set expired active memory rows to archived',
            success: true,
          });
        }
        const summary = await dbGetHermesRepairSummary(householdId, since);
        repairsMade += summary.repairsMade;
        repairsFailed += summary.repairsFailed;
        for (const [issueType, counts] of Object.entries(summary.byType)) {
          globalByType[issueType] = (globalByType[issueType] || 0) + counts.failed;
        }
        await dbUpsertHermesWeeklyFeedback(householdId, {
          repairsMade: summary.repairsMade,
          repairsFailed: summary.repairsFailed,
          suggestedChanges: Object.entries(summary.byType).filter(([, counts]) => counts.failed > 0).map(([issueType, counts]) => ({
            issueType,
            failures: counts.failed,
            suggestion: `Review the recurring ${issueType} failures in the Hermes repair log.`,
          })),
          performanceNotes: `Weekly rollup over the seven days ending ${now.toISOString()}.`,
        });
      } catch (error) {
        errors.push(householdId);
        console.error('[Hermes feedback] household rollup failed:', householdId, error);
      }
    }

    const suggestedChanges = Object.entries(globalByType)
      .filter(([, failures]) => failures > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([issueType, failures]) => ({
        issueType,
        failures,
        suggestion: `Developer review: inspect ${failures} recent ${issueType} failures.`,
      }));
    await dbUpsertHermesWeeklyFeedback(null, {
      repairsMade,
      repairsFailed,
      suggestedChanges,
      performanceNotes: `${householdIds.length} households processed; ${expiredArchived} expired memories archived; ${errors.length} household rollups failed.`,
    });

    return j({ ok: true, households: householdIds.length, repairsMade, repairsFailed, expiredArchived, errors });
  } catch (error: any) {
    return serverError(error?.message || 'Hermes feedback rollup failed', 'hermes-feedback', error);
  }
}
