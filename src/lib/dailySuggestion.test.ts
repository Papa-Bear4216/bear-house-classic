import { describe, expect, it } from 'vitest';
import { getDailySuggestion } from './dailySuggestion';

const now = new Date('2026-09-24T12:00:00Z').getTime();
const baseline = { tasks: [], activities: [], promises: [], memberName: 'Maya', now };

describe('getDailySuggestion', () => {
  it('starts with a high-priority chore assigned to this member', () => {
    const result = getDailySuggestion({ ...baseline, tasks: [{ person: 'Maya', text: 'Pay the bill', priority: 'High' }], activities: [{ name: 'Family dinner', scheduledAt: now + 3600000 }] });
    expect(result.module).toBe('household');
    expect(result.reason).toContain('Pay the bill');
  });

  it('ignores other members’ chores and suggests a near-term plan', () => {
    const result = getDailySuggestion({ ...baseline, tasks: [{ person: 'Jordan', priority: 'High' }], activities: [{ name: 'Movie night', scheduledAt: now + 86400000 }] });
    expect(result.module).toBe('quality');
  });

  it('surfaces an overdue promise when there is no urgent plan', () => {
    const result = getDailySuggestion({ ...baseline, promises: [{ text: 'Call grandma', dueDate: now - 1000 }] });
    expect(result.module).toBe('promises');
  });

  it('only surfaces promises belonging to this member or the household', () => {
    const promises = [{ person: 'Jordan', text: 'Pick up supplies', dueDate: now - 1000 }];
    expect(getDailySuggestion({ ...baseline, promises }).module).toBe('emotions');
    expect(getDailySuggestion({ ...baseline, promises: [...promises, { text: 'Call grandma', dueDate: now - 1000 }] }).module).toBe('promises');
  });

  it('never suggests a restricted module to a child', () => {
    const result = getDailySuggestion({ ...baseline, isChild: true, activities: [{ name: 'Movie night', scheduledAt: now + 3600000 }], promises: [{ dueDate: now - 1000 }] });
    expect(result.module).toBe('family');
  });

  it('falls back to a check-in when everything is clear', () => {
    expect(getDailySuggestion(baseline).module).toBe('emotions');
  });
});
