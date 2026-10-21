import { describe, it, expect } from 'vitest';
import { toDueTimestamp } from './hermesActionExecutor';

describe('toDueTimestamp', () => {
  it('turns YYYY-MM-DD into end of that local day', () => {
    const ts = toDueTimestamp('2026-10-22')!;
    const d = new Date(ts);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()]).toEqual([2026, 10, 22, 23]);
  });
  it('accepts ISO strings and numbers, rejects junk', () => {
    expect(toDueTimestamp('2026-10-22T09:00:00Z')).not.toBeNull();
    expect(toDueTimestamp(1790000000000)).toBe(1790000000000);
    expect(toDueTimestamp('')).toBeNull();
    expect(toDueTimestamp('soonish')).toBeNull();
    expect(toDueTimestamp(undefined)).toBeNull();
  });
});
