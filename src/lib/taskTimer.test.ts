import { describe, it, expect } from 'vitest';
import { getTimerState } from './taskTimer';

describe('getTimerState', () => {
  it('is green when more than half the estimated time remains', () => {
    // 10 min estimate, 2 min elapsed = 80% remaining
    const state = getTimerState(10, 120);
    expect(state.zone).toBe('green');
    expect(state.overtime).toBe(false);
    expect(state.remainingSeconds).toBe(480);
  });

  it('is yellow between 20% and 50% remaining', () => {
    // 10 min estimate, 7 min elapsed = 30% remaining
    const state = getTimerState(10, 420);
    expect(state.zone).toBe('yellow');
    expect(state.overtime).toBe(false);
  });

  it('is red when less than 20% remains', () => {
    // 10 min estimate, 9 min elapsed = 10% remaining
    const state = getTimerState(10, 540);
    expect(state.zone).toBe('red');
    expect(state.overtime).toBe(false);
  });

  it('is red and marked overtime once elapsed exceeds the estimate, with negative remainingSeconds', () => {
    // 10 min estimate, 12 min elapsed = 2 min overtime
    const state = getTimerState(10, 720);
    expect(state.zone).toBe('red');
    expect(state.overtime).toBe(true);
    expect(state.remainingSeconds).toBe(-120);
  });

  it('is green at exactly zero elapsed', () => {
    const state = getTimerState(15, 0);
    expect(state.zone).toBe('green');
    expect(state.remainingSeconds).toBe(900);
  });
});
