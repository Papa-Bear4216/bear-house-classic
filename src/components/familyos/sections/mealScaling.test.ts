import { describe, it, expect } from 'vitest';
import { scaleIngredients } from './MealPlanner';

describe('scaleIngredients', () => {
  it('returns unchanged quantities when scaling to the same serving count', () => {
    const result = scaleIngredients([{ name: 'Flour', quantity: 2, unit: 'cups' }], 4, 4);
    expect(result).toEqual([{ name: 'Flour', quantity: 2, unit: 'cups' }]);
  });

  it('doubles quantities when doubling servings', () => {
    const result = scaleIngredients([{ name: 'Flour', quantity: 2, unit: 'cups' }], 4, 8);
    expect(result).toEqual([{ name: 'Flour', quantity: 4, unit: 'cups' }]);
  });

  it('halves quantities when halving servings', () => {
    const result = scaleIngredients([{ name: 'Eggs', quantity: 4, unit: '' }], 4, 2);
    expect(result).toEqual([{ name: 'Eggs', quantity: 2, unit: '' }]);
  });

  it('scales multiple ingredients independently', () => {
    const result = scaleIngredients(
      [{ name: 'Flour', quantity: 2, unit: 'cups' }, { name: 'Sugar', quantity: 1, unit: 'cup' }],
      4, 6
    );
    expect(result).toEqual([
      { name: 'Flour', quantity: 3, unit: 'cups' },
      { name: 'Sugar', quantity: 1.5, unit: 'cup' },
    ]);
  });

  it('treats a fromServings of 0 as 1 to avoid division by zero', () => {
    const result = scaleIngredients([{ name: 'Flour', quantity: 2, unit: 'cups' }], 0, 4);
    expect(result).toEqual([{ name: 'Flour', quantity: 8, unit: 'cups' }]);
  });
});
