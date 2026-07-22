import { describe, it, expect, beforeEach } from 'vitest';
import { runGenericAction, DOMAIN_REGISTRY, setMealPlanAction } from './hermesActions';

// vitest.config.ts uses environment: 'node' — no real localStorage global.
// Minimal in-memory shim, reset before each test.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string) { this.store.set(key, value); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
});

describe('DOMAIN_REGISTRY', () => {
  it('has exactly 22 domains', () => {
    expect(DOMAIN_REGISTRY.length).toBe(22);
  });

  it('every domain has a unique name and storage key', () => {
    const domains = DOMAIN_REGISTRY.map(d => d.domain);
    const keys = DOMAIN_REGISTRY.map(d => d.storageKey);
    expect(new Set(domains).size).toBe(domains.length);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('runGenericAction', () => {
  it('returns ok:false for an unknown domain', () => {
    const result = runGenericAction('nonexistent', 'add', {});
    expect(result.ok).toBe(false);
    expect(result.result).toContain('Unknown domain');
  });

  it('adds an item to bucketList and persists it', () => {
    const add = runGenericAction('bucketList', 'add', { text: 'Visit Japan' });
    expect(add.ok).toBe(true);
    const stored = JSON.parse(localStorage.getItem('familyos_bucket_list')!);
    expect(stored).toHaveLength(1);
    expect(stored[0].text).toBe('Visit Japan');
    expect(stored[0].id).toBeTruthy();
    expect(stored[0].createdAt).toBeTypeOf('number');
  });

  it('only writes fields declared in the domain spec', () => {
    runGenericAction('bucketList', 'add', { text: 'Visit Japan', notAField: 'ignored' });
    const stored = JSON.parse(localStorage.getItem('familyos_bucket_list')!);
    expect(stored[0].notAField).toBeUndefined();
  });

  it('updates an item matched by fuzzy text on the domain matchField', () => {
    runGenericAction('homework', 'add', { kid: 'Sam', subject: 'Math', task: 'Fractions worksheet', dueDate: '2026-07-25', status: 'pending' });
    const update = runGenericAction('homework', 'update', { match: 'fractions', status: 'done' });
    expect(update.ok).toBe(true);
    const stored = JSON.parse(localStorage.getItem('familyos_homework')!);
    expect(stored[0].status).toBe('done');
  });

  it('returns ok:false when update match finds nothing', () => {
    const result = runGenericAction('homework', 'update', { match: 'nope', status: 'done' });
    expect(result.ok).toBe(false);
  });

  it('deletes an item matched by fuzzy text', () => {
    runGenericAction('bucketList', 'add', { text: 'Visit Japan' });
    runGenericAction('bucketList', 'add', { text: 'Learn guitar' });
    const del = runGenericAction('bucketList', 'delete', { match: 'japan' });
    expect(del.ok).toBe(true);
    const stored = JSON.parse(localStorage.getItem('familyos_bucket_list')!);
    expect(stored).toHaveLength(1);
    expect(stored[0].text).toBe('Learn guitar');
  });

  it('clears an entire domain to an empty array', () => {
    runGenericAction('bucketList', 'add', { text: 'Visit Japan' });
    const clear = runGenericAction('bucketList', 'clear', {});
    expect(clear.ok).toBe(true);
    const stored = JSON.parse(localStorage.getItem('familyos_bucket_list')!);
    expect(stored).toEqual([]);
  });

  it('matches by id when params.id is provided, ignoring match text', () => {
    runGenericAction('bucketList', 'add', { text: 'Visit Japan' });
    const stored = JSON.parse(localStorage.getItem('familyos_bucket_list')!);
    const itemId = stored[0].id;
    const del = runGenericAction('bucketList', 'delete', { id: itemId, match: 'totally different text' });
    expect(del.ok).toBe(true);
  });
});

describe('setMealPlanAction', () => {
  it('sets a meal name for a given day/meal', () => {
    const result = setMealPlanAction('Wednesday', 'Dinner', 'Grilled chicken');
    expect(result.ok).toBe(true);
    const plan = JSON.parse(localStorage.getItem('familyos_meals')!);
    expect(plan.Wednesday.Dinner).toBe('Grilled chicken');
  });

  it('sets the cook when provided, leaves it unchanged when omitted', () => {
    setMealPlanAction('Wednesday', 'Dinner', 'Grilled chicken', 'Mike');
    let plan = JSON.parse(localStorage.getItem('familyos_meals')!);
    expect(plan.Wednesday.cook).toBe('Mike');

    setMealPlanAction('Wednesday', 'Lunch', 'Sandwich');
    plan = JSON.parse(localStorage.getItem('familyos_meals')!);
    expect(plan.Wednesday.cook).toBe('Mike'); // unchanged
    expect(plan.Wednesday.Lunch).toBe('Sandwich');
  });

  it('does not clobber other meals/days when setting one slot', () => {
    setMealPlanAction('Wednesday', 'Breakfast', 'Eggs and toast');
    setMealPlanAction('Wednesday', 'Lunch', 'Sandwich');
    setMealPlanAction('Wednesday', 'Dinner', 'Grilled chicken');
    setMealPlanAction('Thursday', 'Dinner', 'Tacos');

    const plan = JSON.parse(localStorage.getItem('familyos_meals')!);
    expect(plan.Wednesday.Breakfast).toBe('Eggs and toast');
    expect(plan.Wednesday.Lunch).toBe('Sandwich');
    expect(plan.Wednesday.Dinner).toBe('Grilled chicken');
    expect(plan.Thursday.Dinner).toBe('Tacos');
    expect(plan.Monday.Dinner).toBe(''); // untouched day stays empty
  });

  it('returns ok:false for an invalid day', () => {
    const result = setMealPlanAction('Someday', 'Dinner', 'Tacos');
    expect(result.ok).toBe(false);
    expect(result.result).toContain('Invalid day/meal');
  });

  it('returns ok:false for an invalid meal', () => {
    const result = setMealPlanAction('Wednesday', 'Brunch', 'Tacos');
    expect(result.ok).toBe(false);
    expect(result.result).toContain('Invalid day/meal');
  });

  it('writes cookedIngredients and recipeDetail when a recipe with ingredients is provided', () => {
    setMealPlanAction('Wednesday', 'Dinner', 'Grilled chicken', 'Mike', {
      description: 'Hearty and simple',
      time: '30 min',
      difficulty: 'Easy',
      servings: 4,
      ingredients: [{ name: 'Chicken breast', quantity: 4, unit: '' }, { name: 'Potatoes', quantity: 6, unit: '' }],
      steps: ['Season chicken', 'Roast potatoes', 'Grill chicken 8 min per side'],
    });
    const plan = JSON.parse(localStorage.getItem('familyos_meals')!);
    expect(plan.Wednesday.cookedIngredients.Dinner).toHaveLength(2);
    expect(plan.Wednesday.cookedIngredients.Dinner[0].name).toBe('Chicken breast');
    expect(plan.Wednesday.recipeDetail.Dinner.servings).toBe(4);
    expect(plan.Wednesday.recipeDetail.Dinner.steps).toHaveLength(3);
    expect(plan.Wednesday.recipeDetail.Dinner.description).toBe('Hearty and simple');
  });

  it('does not write cookedIngredients/recipeDetail when no ingredients are provided', () => {
    setMealPlanAction('Wednesday', 'Lunch', 'Leftovers');
    const plan = JSON.parse(localStorage.getItem('familyos_meals')!);
    expect(plan.Wednesday.cookedIngredients).toBeUndefined();
    expect(plan.Wednesday.recipeDetail).toBeUndefined();
  });

  it('does not clobber one meal\'s recipe when setting a different meal on the same day', () => {
    setMealPlanAction('Wednesday', 'Dinner', 'Grilled chicken', undefined, {
      ingredients: [{ name: 'Chicken', quantity: 4, unit: '' }],
    });
    setMealPlanAction('Wednesday', 'Breakfast', 'Eggs', undefined, {
      ingredients: [{ name: 'Eggs', quantity: 2, unit: '' }],
    });
    const plan = JSON.parse(localStorage.getItem('familyos_meals')!);
    expect(plan.Wednesday.cookedIngredients.Dinner[0].name).toBe('Chicken');
    expect(plan.Wednesday.cookedIngredients.Breakfast[0].name).toBe('Eggs');
  });
});
