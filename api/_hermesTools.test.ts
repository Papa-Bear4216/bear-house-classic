import { describe, it, expect } from 'vitest';
import { HERMES_TOOLS, ONE_OF_TOOL_FIELDS, isValidCall, sanitizeToolParams } from './_hermesTools';

describe('HERMES_TOOLS catalog', () => {
  it('contains all 23 expected Hermes tools', () => {
    expect(HERMES_TOOLS.length).toBe(23);
  });

  it('ensures all tool names follow Anthropic naming rules', () => {
    const validNamePattern = /^[a-zA-Z0-9_-]{1,64}$/;
    for (const tool of HERMES_TOOLS) {
      expect(tool.name).toMatch(validNamePattern);
      expect(tool.description.length).toBeGreaterThan(5);
      expect(tool.input_schema.type).toBe('object');
      expect(tool.input_schema.properties).toBeDefined();
    }
  });

  it('includes core household actions', () => {
    const names = HERMES_TOOLS.map((t) => t.name);
    expect(names).toContain('addTask');
    expect(names).toContain('addShopping');
    expect(names).toContain('addBill');
    expect(names).toContain('setMealPlan');
    expect(names).toContain('markMealCooked');
    expect(names).toContain('controlDevice');
    expect(names).toContain('discoverSmartHome');
    expect(names).toContain('queryTriad');
    expect(names).toContain('updateMemory');
  });

  it('validates addTask schema has text as required', () => {
    const addTask = HERMES_TOOLS.find((t) => t.name === 'addTask');
    expect(addTask).toBeDefined();
    expect(addTask?.input_schema.required).toContain('text');
  });

  it('validates setMealPlan schema has day, meal, name as required', () => {
    const setMeal = HERMES_TOOLS.find((t) => t.name === 'setMealPlan');
    expect(setMeal).toBeDefined();
    expect(setMeal?.input_schema.required).toEqual(['day', 'meal', 'name']);
  });

  it('rejects empty input on one-of target/destructive tools', () => {
    const allowed = new Set(Object.keys(ONE_OF_TOOL_FIELDS));
    for (const tool of Object.keys(ONE_OF_TOOL_FIELDS)) {
      expect(isValidCall(tool, {}, allowed)).toBe(false);
      expect(isValidCall(tool, { match: '   ' }, allowed)).toBe(false);
      expect(isValidCall(tool, { id: '' }, allowed)).toBe(false);
    }
  });

  it('accepts one-of tools when match or id is provided', () => {
    const allowed = new Set(['deleteTask', 'completeShoppingItem']);
    expect(isValidCall('deleteTask', { match: 'Take out trash' }, allowed)).toBe(true);
    expect(isValidCall('deleteTask', { id: 'task-42' }, allowed)).toBe(true);
    expect(isValidCall('completeShoppingItem', { match: 'Oat milk' }, allowed)).toBe(true);
  });

  it('validates genericAction operations', () => {
    const allowed = new Set(['genericAction']);
    // Missing domain or op
    expect(isValidCall('genericAction', { domain: 'pantry' }, allowed)).toBe(false);
    expect(isValidCall('genericAction', { op: 'add' }, allowed)).toBe(false);

    // op: 'add' or 'clear' without match/id is valid
    expect(isValidCall('genericAction', { domain: 'pantry', op: 'add', params: { item: 'Eggs' } }, allowed)).toBe(true);
    expect(isValidCall('genericAction', { domain: 'pantry', op: 'clear' }, allowed)).toBe(true);

    // op: 'delete' or 'update' requires match or id
    expect(isValidCall('genericAction', { domain: 'pantry', op: 'delete' }, allowed)).toBe(false);
    expect(isValidCall('genericAction', { domain: 'pantry', op: 'update' }, allowed)).toBe(false);
    expect(isValidCall('genericAction', { domain: 'pantry', op: 'delete', match: 'Eggs' }, allowed)).toBe(true);
    expect(isValidCall('genericAction', { domain: 'pantry', op: 'update', id: '123', params: { qty: 2 } }, allowed)).toBe(true);
  });

  it('rejects tools not in the allowed set', () => {
    const allowed = new Set(['addTask']);
    expect(isValidCall('addTask', { text: 'Dishes' }, allowed)).toBe(true);
    expect(isValidCall('queryTriad', { query: 'doctor' }, allowed)).toBe(false);
  });

  it('validates schema types, enums, and number bounds', () => {
    const allowed = new Set(['manageMember', 'addBill', 'logEmotion', 'addTask']);

    // Enum validation: manageMember role must be admin | child | pet
    expect(isValidCall('manageMember', { op: 'updateRole', person: 'Alice', role: 'superadmin' }, allowed)).toBe(false);
    expect(isValidCall('manageMember', { op: 'updateRole', person: 'Alice', role: 'admin' }, allowed)).toBe(true);

    // Number validation: amount in addBill must be finite number
    expect(isValidCall('addBill', { name: 'Rent', amount: 'abc' }, allowed)).toBe(false);
    expect(isValidCall('addBill', { name: 'Rent', amount: 1500 }, allowed)).toBe(true);

    // Number bounds: intensity in logEmotion is 1..5
    expect(isValidCall('logEmotion', { person: 'Sam', emotion: 'happy', intensity: 9 }, allowed)).toBe(false);
    expect(isValidCall('logEmotion', { person: 'Sam', emotion: 'happy', intensity: 0 }, allowed)).toBe(false);
    expect(isValidCall('logEmotion', { person: 'Sam', emotion: 'happy', intensity: 4 }, allowed)).toBe(true);

    // Object type mismatch: person as an object instead of string
    expect(isValidCall('addTask', { text: 'Clean room', person: {} }, allowed)).toBe(false);
    expect(isValidCall('addTask', { text: 'Clean room', person: 'Sam' }, allowed)).toBe(true);
  });

  it('rejects unknown properties to prevent mass assignment', () => {
    const allowed = new Set(['addTask']);
    expect(isValidCall('addTask', { text: 'Clean room', unknownInjection: 'malicious' }, allowed)).toBe(false);
  });

  it('validates nested object arrays such as setMealPlan ingredients', () => {
    const allowed = new Set(['setMealPlan']);
    // Valid meal with ingredients
    expect(isValidCall('setMealPlan', {
      day: 'Monday',
      meal: 'Dinner',
      name: 'Tacos',
      ingredients: [{ name: 'Tortillas', quantity: 6, unit: 'count' }],
    }, allowed)).toBe(true);

    // Missing ingredient quantity
    expect(isValidCall('setMealPlan', {
      day: 'Monday',
      meal: 'Dinner',
      name: 'Tacos',
      ingredients: [{ name: 'Tortillas', unit: 'count' }],
    }, allowed)).toBe(false);

    // Non-number ingredient quantity
    expect(isValidCall('setMealPlan', {
      day: 'Monday',
      meal: 'Dinner',
      name: 'Tacos',
      ingredients: [{ name: 'Tortillas', quantity: 'six', unit: 'count' }],
    }, allowed)).toBe(false);
  });

  it('coerces numbers to strings for string fields in sanitizeToolParams', () => {
    const cleaned = sanitizeToolParams('addShopping', {
      name: 'Apples',
      quantity: 5, // number coerced to string '5'
      extraUnknown: 'dropped',
    });
    expect(cleaned.name).toBe('Apples');
    expect(cleaned.quantity).toBe('5');
    expect(cleaned.extraUnknown).toBeUndefined();
  });

  it('rejects prototype pollution attempts via __proto__, constructor, prototype', () => {
    const allowed = new Set(['addTask', 'genericAction', 'setMealPlan']);
    // Literal object with altered prototype
    expect(isValidCall('addTask', { text: 'Test', __proto__: { admin: true } }, allowed)).toBe(false);
    expect(isValidCall('addTask', { text: 'Test', constructor: { name: 'admin' } }, allowed)).toBe(false);
    expect(isValidCall('addTask', { text: 'Test', prototype: { polluted: true } }, allowed)).toBe(false);

    // Real JSON-parsed payload with __proto__ key (as would arrive over network/API)
    const jsonPolluted = JSON.parse('{"text": "Test", "__proto__": {"admin": true}}');
    expect(isValidCall('addTask', jsonPolluted, allowed)).toBe(false);

    // Nested pollution in genericAction params via JSON.parse
    const jsonGenericPolluted = JSON.parse('{"domain": "pantry", "op": "add", "params": {"__proto__": {"evil": true}}}');
    expect(isValidCall('genericAction', jsonGenericPolluted, allowed)).toBe(false);

    // Nested pollution in setMealPlan ingredients
    expect(isValidCall('setMealPlan', {
      day: 'Monday',
      meal: 'Dinner',
      name: 'Soup',
      ingredients: [{ name: 'Water', quantity: 1, unit: 'cup', __proto__: {} }],
    }, allowed)).toBe(false);
  });

  it('enforces cross-field consistency and regex on controlDevice', () => {
    const allowed = new Set(['controlDevice']);
    // Valid light control
    expect(isValidCall('controlDevice', {
      domain: 'light',
      service: 'turn_on',
      entityId: 'light.kitchen',
    }, allowed)).toBe(true);

    // EntityId domain mismatch (entityId starts with switch., but domain is light)
    expect(isValidCall('controlDevice', {
      domain: 'light',
      service: 'turn_on',
      entityId: 'switch.kitchen',
    }, allowed)).toBe(false);

    // Invalid service for domain (light cannot unlock)
    expect(isValidCall('controlDevice', {
      domain: 'light',
      service: 'unlock',
      entityId: 'light.kitchen',
    }, allowed)).toBe(false);

    // Valid lock control
    expect(isValidCall('controlDevice', {
      domain: 'lock',
      service: 'unlock',
      entityId: 'lock.front_door',
    }, allowed)).toBe(true);

    // Lock cannot toggle
    expect(isValidCall('controlDevice', {
      domain: 'lock',
      service: 'toggle',
      entityId: 'lock.front_door',
    }, allowed)).toBe(false);

    // Malicious or invalid entityId format
    expect(isValidCall('controlDevice', {
      domain: 'light',
      service: 'turn_on',
      entityId: 'light.kitchen; evil()',
    }, allowed)).toBe(false);
    expect(isValidCall('controlDevice', {
      domain: 'light',
      service: 'turn_on',
      entityId: 'light.',
    }, allowed)).toBe(false);
  });

  it('validates queryTriad query against allowed commands', () => {
    const allowed = new Set(['queryTriad']);
    expect(isValidCall('queryTriad', { query: 'doctor' }, allowed)).toBe(true);
    expect(isValidCall('queryTriad', { query: 'gate' }, allowed)).toBe(true);
    expect(isValidCall('queryTriad', { query: 'status' }, allowed)).toBe(true);
    expect(isValidCall('queryTriad', { query: 'review diff' }, allowed)).toBe(true);

    // Disallowed / command injection attempts
    expect(isValidCall('queryTriad', { query: 'rm -rf /' }, allowed)).toBe(false);
    expect(isValidCall('queryTriad', { query: 'cat /etc/passwd' }, allowed)).toBe(false);
  });

  it('enforces strict role requirements on manageMember', () => {
    const allowed = new Set(['manageMember']);
    // updateRole without role is invalid
    expect(isValidCall('manageMember', { op: 'updateRole', person: 'Alice' }, allowed)).toBe(false);

    // updateRole with valid role is valid
    expect(isValidCall('manageMember', { op: 'updateRole', person: 'Alice', role: 'admin' }, allowed)).toBe(true);

    // remove without role is valid
    expect(isValidCall('manageMember', { op: 'remove', person: 'Alice' }, allowed)).toBe(true);

    // remove with role specified is invalid (forbid role on remove)
    expect(isValidCall('manageMember', { op: 'remove', person: 'Alice', role: 'child' }, allowed)).toBe(false);
  });

  it('enforces minimum match length of 3 chars on destructive tools', () => {
    const allowed = new Set(['deleteTask', 'completeTask', 'completeShoppingItem', 'genericAction']);
    // Too short match string (< 3 chars)
    expect(isValidCall('deleteTask', { match: 'ab' }, allowed)).toBe(false);
    expect(isValidCall('deleteTask', { match: 'a' }, allowed)).toBe(false);
    expect(isValidCall('completeTask', { match: 'ok' }, allowed)).toBe(false);
    expect(isValidCall('completeShoppingItem', { match: 'hi' }, allowed)).toBe(false);
    expect(isValidCall('genericAction', { domain: 'pantry', op: 'delete', match: 'yo' }, allowed)).toBe(false);

    // Exactly 3 chars or longer is valid
    expect(isValidCall('deleteTask', { match: 'abc' }, allowed)).toBe(true);
    expect(isValidCall('completeTask', { match: 'run' }, allowed)).toBe(true);
    expect(isValidCall('completeShoppingItem', { match: 'egg' }, allowed)).toBe(true);
    expect(isValidCall('genericAction', { domain: 'pantry', op: 'delete', match: 'jam' }, allowed)).toBe(true);
  });

  it('restricts genericAction to allowed domains and enforces per-domain field allowlists', () => {
    const allowed = new Set(['genericAction']);
    // Unregistered domain
    expect(isValidCall('genericAction', { domain: 'passwords', op: 'add', params: { secret: '123' } }, allowed)).toBe(false);
    expect(isValidCall('genericAction', { domain: 'system', op: 'clear' }, allowed)).toBe(false);

    // Allowed domains with valid fields
    expect(isValidCall('genericAction', { domain: 'homework', op: 'add', params: { task: 'Math' } }, allowed)).toBe(true);
    expect(isValidCall('genericAction', { domain: 'medications', op: 'clear' }, allowed)).toBe(true);

    // Mass assignment prevention: unknown top-level keys
    expect(isValidCall('genericAction', { domain: 'pantry', op: 'add', params: { name: 'Milk' }, injectedTopLevel: true }, allowed)).toBe(false);

    // Mass assignment prevention: unallowlisted fields for the domain
    expect(isValidCall('genericAction', { domain: 'pantry', op: 'add', params: { name: 'Milk', isAdmin: true } }, allowed)).toBe(false);
    expect(isValidCall('genericAction', { domain: 'pantry', op: 'add', params: { name: 'Milk', householdId: 'tenant-override' } }, allowed)).toBe(false);
    expect(isValidCall('genericAction', { domain: 'pantry', op: 'add', params: { name: 'Milk', owner: 'attacker' } }, allowed)).toBe(false);

    // sanitizeToolParams strips unallowed keys
    const sanitized = sanitizeToolParams('genericAction', {
      domain: 'pantry',
      op: 'add',
      params: {
        name: 'Flour',
        quantity: 2,
        id: 'force-id',
        household_id: 'tenant-override',
        _household_id: 'sneaky',
        owner: 'bad',
      },
    });

    expect(sanitized.domain).toBe('pantry');
    expect(sanitized.op).toBe('add');
    const p = sanitized.params as Record<string, unknown>;
    expect(p.name).toBe('Flour');
    expect(p.quantity).toBe(2);
    expect(p.id).toBeUndefined();
    expect(p.household_id).toBeUndefined();
    expect(p._household_id).toBeUndefined();
    expect(p.owner).toBeUndefined();
  });

  it('safely handles prototype properties without throwing or prototype pollution', () => {
    const allowed = new Set(['controlDevice', 'genericAction', 'addTask']);
    // Hallucinated prototype domain on controlDevice
    expect(() =>
      isValidCall('controlDevice', { domain: 'constructor', service: 'turn_on', entityId: 'constructor.light' }, allowed)
    ).not.toThrow();
    expect(
      isValidCall('controlDevice', { domain: 'constructor', service: 'turn_on', entityId: 'constructor.light' }, allowed)
    ).toBe(false);

    expect(
      isValidCall('controlDevice', { domain: '__proto__', service: 'turn_on', entityId: '__proto__.light' }, allowed)
    ).toBe(false);

    // Schema lookup safety on unknown/prototype property
    expect(
      isValidCall('genericAction', { domain: 'toString', op: 'add', params: { text: 'hi' } }, allowed)
    ).toBe(false);
  });

  it('enforces role gating for non-admin callers on genericAction and bills', () => {
    const allowed = new Set(['genericAction', 'addBill']);
    // Admin (isAdmin: true) can access bills, budget, allowance, and clear
    expect(isValidCall('genericAction', { domain: 'budget', op: 'add', params: { name: 'Groceries', budgeted: 500 } }, allowed, true)).toBe(true);
    expect(isValidCall('genericAction', { domain: 'shopping', op: 'clear' }, allowed, true)).toBe(true);

    // Non-admin (isAdmin: false) cannot clear any collection
    expect(isValidCall('genericAction', { domain: 'shopping', op: 'clear' }, allowed, false)).toBe(false);

    // Non-admin (isAdmin: false) cannot write to adult domains (budget, expenses, allowance, grades, medications)
    expect(isValidCall('genericAction', { domain: 'budget', op: 'add', params: { name: 'Groceries', budgeted: 500 } }, allowed, false)).toBe(false);
    expect(isValidCall('genericAction', { domain: 'expenses', op: 'add', params: { amount: 50 } }, allowed, false)).toBe(false);
    expect(isValidCall('genericAction', { domain: 'allowance', op: 'add', params: { kid: 'Sam', amount: 100 } }, allowed, false)).toBe(false);
    expect(isValidCall('genericAction', { domain: 'grades', op: 'add', params: { kid: 'Sam', subject: 'Math' } }, allowed, false)).toBe(false);

    // Non-admin CAN access child-allowed domains
    expect(isValidCall('genericAction', { domain: 'shopping', op: 'add', params: { name: 'Apples' } }, allowed, false)).toBe(true);
    expect(isValidCall('genericAction', { domain: 'homework', op: 'add', params: { task: 'History essay' } }, allowed, false)).toBe(true);

    // Non-admin can submit askParents but cannot approve/update or set status
    expect(isValidCall('genericAction', { domain: 'askParents', op: 'add', params: { request: 'Can I go out?' } }, allowed, false)).toBe(true);
    expect(isValidCall('genericAction', { domain: 'askParents', op: 'add', params: { request: 'Can I go out?', status: 'approved' } }, allowed, false)).toBe(false);
    expect(isValidCall('genericAction', { domain: 'askParents', op: 'update', match: 'go out', params: { status: 'approved' } }, allowed, false)).toBe(false);
  });

  it('enforces string length and number bounds', () => {
    const allowed = new Set(['addTask', 'addBill', 'genericAction']);
    // addTask maxLength is 1000
    const longText = 'x'.repeat(1001);
    expect(isValidCall('addTask', { text: longText }, allowed)).toBe(false);
    expect(isValidCall('addTask', { text: 'Normal task' }, allowed)).toBe(true);

    // addBill amount minimum is 0
    expect(isValidCall('addBill', { name: 'Electric', amount: -50 }, allowed)).toBe(false);
    expect(isValidCall('addBill', { name: 'Electric', amount: 100 }, allowed)).toBe(true);

    // genericAction budget/allowance minimum is 0
    expect(isValidCall('genericAction', { domain: 'budget', op: 'add', params: { name: 'Food', budgeted: -10 } }, allowed, true)).toBe(false);
    expect(isValidCall('genericAction', { domain: 'allowance', op: 'add', params: { kid: 'Sam', amount: -20 } }, allowed, true)).toBe(false);
  });

  it('coerces top-level generic match or id to string in sanitizeToolParams', () => {
    const sanitized = sanitizeToolParams('genericAction', {
      domain: 'shopping',
      op: 'delete',
      match: 12345 as any,
      id: 999 as any,
    });
    expect(sanitized.match).toBe('12345');
    expect(sanitized.id).toBe('999');
  });
});

