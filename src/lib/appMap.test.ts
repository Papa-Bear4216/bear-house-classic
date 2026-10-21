import { describe, expect, it } from 'vitest';
import { APP_MAP, BENTO_MODULE_CATALOG } from './appMap';
import { APP_MAP_DIGEST as SERVER_APP_MAP_DIGEST, MOUNTED_SURFACES as SERVER_MOUNTED_SURFACES } from '../../api/_appMap';

const EXPECTED_BENTO_IDS = [
  'dashboard','household','kids','family','health','finance','rewards','quality','promises','emotions',
  'custody','hermes-chat','run-of-show','pantry-shopping','meal-planner','maintenance',
  'legal-privacy','legal-terms','brain-battery','system-health',
];

describe('APP_MAP', () => {
  it('covers each live BentoModuleId, including modules outside the Directory', () => {
    expect(Object.keys(BENTO_MODULE_CATALOG).sort()).toEqual([...EXPECTED_BENTO_IDS].sort());
  });

  it('maps Directory labels to the actual expandModule targets exactly once', () => {
    const directoryRows = APP_MAP.filter((row) => row.directoryActionId);
    expect(directoryRows.map((row) => row.directoryActionId)).toEqual([
      'household','meal-planner','pantry-shopping','maintenance','emotions','kids','rewards',
      'promises','custody','quality','hermes-chat','finance','legal-privacy','legal-terms',
    ]);
    expect(new Set(directoryRows.map((row) => row.id)).size).toBe(directoryRows.length);
    expect(APP_MAP.find((row) => row.id === 'family-squad')?.directoryActionId).toBe('emotions');
    expect(APP_MAP.find((row) => row.id === 'run-of-show')?.directoryActionId).toBe('quality');
  });

  it('lists the real storage/table names for the audited Directory rows', () => {
    expect(APP_MAP.find((row) => row.id === 'maintenance')?.dataKeys).toContain('familyos_cars');
    expect(APP_MAP.find((row) => row.id === 'run-of-show')?.dataKeys).toEqual([
      'familyos_appointments','familyos_bills','quality_activities',
    ]);
    expect(APP_MAP.find((row) => row.id === 'family-squad')?.dataKeys).toContain('household_members (table)');
    expect(APP_MAP.some((row) => row.dataKeys.includes('familyos_car_maintenance'))).toBe(false);
  });

  it('keeps the edge server digest and mounted-surface manifest in sync', () => {
    expect(SERVER_APP_MAP_DIGEST).toBe(APP_MAP.map((module) =>
      `${module.title} [${module.id}; ${module.where}; data: ${module.dataKeys.join(', ') || 'none'}; Hermes: ${module.hermesAccess}]`
    ).join('; '));
    expect(SERVER_MOUNTED_SURFACES).toBe('floating Hermes button on signed-in pages; Bento Hermes copilot; Directory copilot entry');
  });
});
