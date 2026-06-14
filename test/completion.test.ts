import { describe, it } from 'vitest';
import { runCompletion } from '../src/lib/completion';
import { sampleHouse } from '../src/lib/sampleHouse';

describe('completion', () => {
  it('awards points when all steps verified', () => {
    const chore = sampleHouse.rooms[0].zones[0].chores[0];
    const res = runCompletion(chore as any, [true, true, true]);
    if (!res.success || res.awardedPoints <= 0) throw new Error('completion failed');
  });
  
  it('returns failure when not all steps verified', () => {
    const chore = sampleHouse.rooms[0].zones[0].chores[0];
    const res = runCompletion(chore as any, [true, false, true]);
    if (res.success || res.awardedPoints !== 0) throw new Error('should fail');
  });
});
