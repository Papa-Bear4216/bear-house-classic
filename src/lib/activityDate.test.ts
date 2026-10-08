import { describe, expect, it } from 'vitest';
import { activityTimestamp } from './activityDate';

describe('activityTimestamp', () => {
  it('normalizes ISO and millisecond date values', () => {
    const timestamp = Date.parse('2026-09-26T19:00:00.000Z');
    expect(activityTimestamp('2026-09-26T19:00:00.000Z')).toBe(timestamp);
    expect(activityTimestamp(String(timestamp))).toBe(timestamp);
    expect(activityTimestamp(timestamp)).toBe(timestamp);
    expect(activityTimestamp('2026-09-24')).toBe(new Date(2026, 8, 24).getTime());
  });

  it('rejects invalid and missing times', () => {
    expect(activityTimestamp('tomorrow evening')).toBeNull();
    expect(activityTimestamp('')).toBeNull();
    expect(activityTimestamp(null)).toBeNull();
    expect(activityTimestamp(Number.NaN)).toBeNull();
    expect(activityTimestamp('2026-02-31')).toBeNull();
  });
});
