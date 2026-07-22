import { describe, it, expect } from 'vitest';
import { applyMealCooked, defaultPlan } from './MealPlanner';

describe('applyMealCooked', () => {
  it('stamps cookedAt for the given day/meal without mutating the input plan', () => {
    const plan = defaultPlan();
    const before = Date.now();
    const result = applyMealCooked(
      plan, 'Monday', 'Dinner',
      [{ name: 'Flour', quantity: 2, unit: 'cups' }],
      4, 4
    );
    expect(result.Monday.cookedAt?.Dinner).toBeGreaterThanOrEqual(before);
    expect(plan.Monday.cookedAt).toBeUndefined(); // original untouched
  });

  it('leaves other days/meals untouched', () => {
    const plan = defaultPlan();
    const result = applyMealCooked(plan, 'Tuesday', 'Lunch', [], 2, 2);
    expect(result.Monday).toEqual(plan.Monday);
    expect(result.Tuesday.cookedAt?.Lunch).toBeTypeOf('number');
  });
});
