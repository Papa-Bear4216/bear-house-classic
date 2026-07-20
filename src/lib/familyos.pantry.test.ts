import { describe, it, expect } from 'vitest';
import {
  findPantryItem, mergeIntoPantry, decrementPantry, calculateShortfall,
  type PantryItem,
} from './familyos';

function item(overrides: Partial<PantryItem> = {}): PantryItem {
  return { id: 'i1', name: 'Flour', quantity: 2, unit: 'cups', category: 'pantry', updatedAt: 0, ...overrides };
}

describe('findPantryItem', () => {
  it('matches on name (case-insensitive) and unit', () => {
    const items = [item({ name: 'Flour', unit: 'cups' })];
    expect(findPantryItem(items, 'flour', 'cups')).toBe(items[0]);
  });

  it('does not match when the unit differs', () => {
    const items = [item({ name: 'Flour', unit: 'cups' })];
    expect(findPantryItem(items, 'Flour', 'lb')).toBeUndefined();
  });

  it('returns undefined when no item matches the name', () => {
    const items = [item({ name: 'Flour' })];
    expect(findPantryItem(items, 'Sugar', 'cups')).toBeUndefined();
  });
});

describe('mergeIntoPantry', () => {
  it('increments quantity for an existing name+unit match', () => {
    const items = [item({ name: 'Flour', unit: 'cups', quantity: 2 })];
    const result = mergeIntoPantry(items, [{ name: 'Flour', quantity: 3, unit: 'cups', category: 'pantry' }]);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(5);
  });

  it('creates a new item when no name+unit match exists', () => {
    const items = [item({ name: 'Flour', unit: 'cups' })];
    const result = mergeIntoPantry(items, [{ name: 'Milk', quantity: 1, unit: 'gallon', category: 'dairy' }]);
    expect(result).toHaveLength(2);
    expect(result.find(i => i.name === 'Milk')?.quantity).toBe(1);
  });

  it('merges multiple incoming items in one call', () => {
    const result = mergeIntoPantry([], [
      { name: 'Eggs', quantity: 12, unit: '', category: 'dairy' },
      { name: 'Butter', quantity: 1, unit: 'lb', category: 'dairy' },
    ]);
    expect(result).toHaveLength(2);
  });
});

describe('decrementPantry', () => {
  it('reduces quantity by the used amount', () => {
    const items = [item({ name: 'Flour', unit: 'cups', quantity: 5 })];
    const result = decrementPantry(items, [{ name: 'Flour', quantity: 2, unit: 'cups' }]);
    expect(result[0].quantity).toBe(3);
  });

  it('clamps at 0, never goes negative', () => {
    const items = [item({ name: 'Flour', unit: 'cups', quantity: 1 })];
    const result = decrementPantry(items, [{ name: 'Flour', quantity: 5, unit: 'cups' }]);
    expect(result[0].quantity).toBe(0);
  });

  it('leaves non-matching pantry items untouched', () => {
    const items = [item({ name: 'Flour', unit: 'cups', quantity: 5 }), item({ id: 'i2', name: 'Sugar', unit: 'cups', quantity: 3 })];
    const result = decrementPantry(items, [{ name: 'Flour', quantity: 1, unit: 'cups' }]);
    expect(result.find(i => i.name === 'Sugar')?.quantity).toBe(3);
  });

  it('is a no-op for ingredients with no matching pantry item', () => {
    const items = [item({ name: 'Flour', unit: 'cups', quantity: 5 })];
    const result = decrementPantry(items, [{ name: 'Basil', quantity: 1, unit: 'tsp' }]);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(5);
  });
});

describe('calculateShortfall', () => {
  it('returns the needed amount when pantry has none of it', () => {
    const shortfall = calculateShortfall([], [{ name: 'Flour', quantity: 2, unit: 'cups' }]);
    expect(shortfall).toEqual([{ name: 'Flour', quantity: 2, unit: 'cups' }]);
  });

  it('returns nothing when pantry stock fully covers the need', () => {
    const pantry = [item({ name: 'Flour', unit: 'cups', quantity: 3 })];
    const shortfall = calculateShortfall(pantry, [{ name: 'Flour', quantity: 2, unit: 'cups' }]);
    expect(shortfall).toEqual([]);
  });

  it('returns only the shortfall amount when pantry partially covers the need', () => {
    const pantry = [item({ name: 'Flour', unit: 'cups', quantity: 1 })];
    const shortfall = calculateShortfall(pantry, [{ name: 'Flour', quantity: 3, unit: 'cups' }]);
    expect(shortfall).toEqual([{ name: 'Flour', quantity: 2, unit: 'cups' }]);
  });

  it('handles multiple ingredients independently', () => {
    const pantry = [item({ name: 'Flour', unit: 'cups', quantity: 5 })];
    const shortfall = calculateShortfall(pantry, [
      { name: 'Flour', quantity: 2, unit: 'cups' },
      { name: 'Sugar', quantity: 1, unit: 'cup' },
    ]);
    expect(shortfall).toEqual([{ name: 'Sugar', quantity: 1, unit: 'cup' }]);
  });

  it('never returns a negative or zero-quantity entry', () => {
    const pantry = [item({ name: 'Flour', unit: 'cups', quantity: 10 })];
    const shortfall = calculateShortfall(pantry, [{ name: 'Flour', quantity: 2, unit: 'cups' }]);
    expect(shortfall.find(s => s.name === 'Flour')).toBeUndefined();
  });
});
