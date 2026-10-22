import { describe, it, expect } from 'vitest';
import { guardUnbackedSuccess, UNSAVED_NOTICE } from './_claimGuard.js';

const base = { toolsOffered: true, actionCount: 0, droppedActions: 0 };

describe('guardUnbackedSuccess', () => {
  it('replaces a success claim that has no action behind it', () => {
    for (const t of ['✅ Task Added!\n\n**Who:** Abriana', 'Got it! I\'ve added that for Abriana.', 'Chore added for dick tomorrow morning']) {
      expect(guardUnbackedSuccess(t, base)).toEqual({ text: UNSAVED_NOTICE, guarded: true });
    }
  });
  it('leaves the text alone when an action backs it up', () => {
    expect(guardUnbackedSuccess('✅ Added!', { ...base, actionCount: 1 }).guarded).toBe(false);
  });
  it('leaves the text alone when tools were not offered or actions were dropped (other notices apply)', () => {
    expect(guardUnbackedSuccess('✅ Added!', { ...base, toolsOffered: false }).guarded).toBe(false);
    expect(guardUnbackedSuccess('✅ Added!', { ...base, droppedActions: 1 }).guarded).toBe(false);
  });
  it('does not flag ordinary answers', () => {
    for (const t of ["Here's what's on your plate today: take out the trash.", 'Abriana has 2 open tasks.', "I couldn't find a member called dick."]) {
      expect(guardUnbackedSuccess(t, base).guarded).toBe(false);
    }
  });
});
