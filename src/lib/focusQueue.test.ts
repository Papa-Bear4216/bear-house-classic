import { describe, it, expect } from 'vitest';
import { buildFocusQueue, type FocusQueueTask } from './focusQueue';

describe('buildFocusQueue', () => {
  it('sorts High priority before Medium before Low', () => {
    const tasks: FocusQueueTask[] = [
      { id: '1', priority: 'Low', dueDate: null },
      { id: '2', priority: 'High', dueDate: null },
      { id: '3', priority: 'Medium', dueDate: null },
    ];
    expect(buildFocusQueue(tasks).map(t => t.id)).toEqual(['2', '3', '1']);
  });

  it('within the same priority, sorts soonest dueDate first', () => {
    const tasks: FocusQueueTask[] = [
      { id: 'later', priority: 'Medium', dueDate: 2000 },
      { id: 'sooner', priority: 'Medium', dueDate: 1000 },
    ];
    expect(buildFocusQueue(tasks).map(t => t.id)).toEqual(['sooner', 'later']);
  });

  it('sorts tasks with no dueDate after tasks with a dueDate, within the same priority', () => {
    const tasks: FocusQueueTask[] = [
      { id: 'no-date', priority: 'Medium', dueDate: null },
      { id: 'has-date', priority: 'Medium', dueDate: 5000 },
    ];
    expect(buildFocusQueue(tasks).map(t => t.id)).toEqual(['has-date', 'no-date']);
  });

  it('does not mutate the input array', () => {
    const tasks: FocusQueueTask[] = [
      { id: '1', priority: 'Low', dueDate: null },
      { id: '2', priority: 'High', dueDate: null },
    ];
    const original = [...tasks];
    buildFocusQueue(tasks);
    expect(tasks).toEqual(original);
  });

  it('returns an empty array for an empty input', () => {
    expect(buildFocusQueue([])).toEqual([]);
  });
});
