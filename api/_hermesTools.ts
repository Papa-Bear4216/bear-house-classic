/**
 * Anthropic tool definitions for Hermes actions.
 *
 * Replaces fragile markdown JSON begging and client regex salvage with
 * native Anthropic `tool_use`. Tool definitions are cache-controlled so
 * they hit Anthropic's ephemeral prompt cache at a 90% discount.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const HERMES_TOOLS: ToolDefinition[] = [
  {
    name: 'addTask',
    description: 'Add a new household task or chore.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', maxLength: 1000, description: 'The task title or description' },
        person: { type: 'string', description: 'Household member assigned to this task' },
        priority: {
          type: 'string',
          enum: ['High', 'Medium', 'Low'],
          description: 'Task priority level',
        },
        category: {
          type: 'string',
          enum: ['Shopping', 'Maintenance', 'Scheduling', 'Pet', 'Important Dates', 'General'],
          description: 'Task category',
        },
        dueEstimate: {
          type: 'string',
          enum: ['Today', 'This Week', 'This Month', 'No Deadline'],
          description: 'Rough deadline estimation',
        },
        dueDate: { type: 'string', description: 'Optional explicit date or ISO string' },
      },
      required: ['text'],
    },
  },
  {
    name: 'completeTask',
    description: 'Mark an open task as completed.',
    input_schema: {
      type: 'object',
      properties: {
        match: { type: 'string', description: 'Partial or full text of the task to complete' },
        id: { type: 'string', description: 'Exact task ID if known' },
        person: { type: 'string', description: 'Name of the person who completed it' },
      },
    },
  },
  {
    name: 'uncompleteTask',
    description: 'Reopen a previously completed task.',
    input_schema: {
      type: 'object',
      properties: {
        match: { type: 'string', description: 'Partial or full text of the task to reopen' },
        id: { type: 'string', description: 'Exact task ID if known' },
      },
    },
  },
  {
    name: 'deleteTask',
    description: 'Delete a task entirely from the task list.',
    input_schema: {
      type: 'object',
      properties: {
        match: { type: 'string', description: 'Partial or full text of the task to delete' },
        id: { type: 'string', description: 'Exact task ID if known' },
      },
    },
  },
  {
    name: 'addShopping',
    description: 'Add an item to the household grocery or shopping list.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 200, description: 'Name of the item to purchase' },
        quantity: { type: 'string', description: 'Quantity with optional unit, e.g. "2" or "1 gallon"' },
        category: {
          type: 'string',
          enum: ['Groceries', 'Household', 'Personal', 'Other'],
          description: 'Shopping category',
        },
        assignedTo: { type: 'string', description: 'Person assigned to pick this up' },
      },
      required: ['name'],
    },
  },
  {
    name: 'completeShoppingItem',
    description: 'Mark an item on the shopping list as bought/completed.',
    input_schema: {
      type: 'object',
      properties: {
        match: { type: 'string', description: 'Name or partial name of the shopping item' },
        id: { type: 'string', description: 'Exact item ID if known' },
      },
    },
  },
  {
    name: 'addBill',
    description: 'Track a household bill or recurring payment.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 200, description: 'Name of the bill or payee' },
        amount: { type: 'number', minimum: 0, description: 'Dollar amount of the bill' },
        dueDate: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
        recurring: { type: 'boolean', description: 'Whether this is a recurring monthly bill' },
        category: { type: 'string', description: 'Bill category, e.g. Utilities, Insurance' },
      },
      required: ['name', 'amount'],
    },
  },
  {
    name: 'markBillPaid',
    description: 'Mark an existing bill as paid.',
    input_schema: {
      type: 'object',
      properties: {
        match: { type: 'string', description: 'Partial or full name of the bill' },
        id: { type: 'string', description: 'Exact bill ID if known' },
      },
    },
  },
  {
    name: 'addAppointment',
    description: 'Add an appointment or scheduled event to the family calendar.',
    input_schema: {
      type: 'object',
      properties: {
        person: { type: 'string', description: 'Family member the appointment is for' },
        title: { type: 'string', description: 'Title or purpose of the appointment' },
        type: { type: 'string', description: 'Appointment type, e.g. Dentist, Vet, Meeting' },
        doctor: { type: 'string', description: 'Doctor or provider name if applicable' },
        date: { type: 'string', description: 'Date and time or YYYY-MM-DD string' },
        notes: { type: 'string', description: 'Optional appointment notes or location' },
      },
      required: ['person', 'title'],
    },
  },
  {
    name: 'addPromise',
    description: 'Record a promise made to or by a family member.',
    input_schema: {
      type: 'object',
      properties: {
        person: { type: 'string', description: 'Person the promise was made to' },
        text: { type: 'string', description: 'The promise description' },
        dueDate: { type: 'string', description: 'Optional due date in YYYY-MM-DD format' },
        priority: { type: 'string', description: 'Priority level, e.g. High, Medium, Low' },
      },
      required: ['person', 'text'],
    },
  },
  {
    name: 'completePromise',
    description: 'Mark a family promise as kept and completed.',
    input_schema: {
      type: 'object',
      properties: {
        match: { type: 'string', description: 'Partial or full text of the promise' },
        id: { type: 'string', description: 'Exact promise ID if known' },
      },
    },
  },
  {
    name: 'logEmotion',
    description: 'Log an emotion check-in for a family member.',
    input_schema: {
      type: 'object',
      properties: {
        person: { type: 'string', description: 'Family member who shared their feeling' },
        emotion: { type: 'string', description: 'The feeling word, e.g. happy, overwhelmed, tired' },
        intensity: { type: 'number', minimum: 1, maximum: 5, description: 'Intensity 1 to 5' },
        note: { type: 'string', description: 'Context or reason for the feeling' },
      },
      required: ['person', 'emotion'],
    },
  },
  {
    name: 'updateMemory',
    description: 'Store an important long-term fact or preference about the family.',
    input_schema: {
      type: 'object',
      properties: {
        memory: { type: 'string', maxLength: 1000, description: 'Fact, preference, or detail to remember' },
      },
      required: ['memory'],
    },
  },
  {
    name: 'clearWeekMeals',
    description: 'Reset the entire week meal plan back to empty.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'setMealPlan',
    description: 'Plan or suggest a meal for a specific day and slot (Breakfast, Lunch, Dinner).',
    input_schema: {
      type: 'object',
      properties: {
        day: {
          type: 'string',
          enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
          description: 'Day of the week',
        },
        meal: {
          type: 'string',
          enum: ['Breakfast', 'Lunch', 'Dinner'],
          description: 'Meal slot',
        },
        name: { type: 'string', description: 'Dish name' },
        cook: { type: 'string', description: 'Person cooking' },
        description: { type: 'string', description: 'Brief description' },
        time: { type: 'string', description: 'Prep and cooking time, e.g. "30 min"' },
        difficulty: { type: 'string', enum: ['Easy', 'Medium', 'Hard'] },
        servings: { type: 'number', description: 'Number of servings' },
        ingredients: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              quantity: { type: 'number' },
              unit: { type: 'string' },
            },
            required: ['name', 'quantity', 'unit'],
          },
          description: 'List of ingredients with quantities and units',
        },
        steps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Cooking steps',
        },
      },
      required: ['day', 'meal', 'name'],
    },
  },
  {
    name: 'markMealCooked',
    description: 'Mark a planned meal as cooked and decrement pantry ingredients.',
    input_schema: {
      type: 'object',
      properties: {
        day: {
          type: 'string',
          enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        },
        meal: {
          type: 'string',
          enum: ['Breakfast', 'Lunch', 'Dinner'],
        },
      },
      required: ['day', 'meal'],
    },
  },
  {
    name: 'addCarMaintenanceEntry',
    description: 'Log maintenance, service, or repairs on a household vehicle.',
    input_schema: {
      type: 'object',
      properties: {
        carMatch: { type: 'string', description: 'Name or model of the vehicle' },
        type: { type: 'string', description: 'Service type, e.g. Oil Change, Tire Rotation' },
        date: { type: 'string', description: 'Date of service in YYYY-MM-DD' },
        mileage: { type: 'string', description: 'Odometer mileage' },
        notes: { type: 'string', description: 'Service details or notes' },
      },
      required: ['carMatch'],
    },
  },
  {
    name: 'genericAction',
    description: 'Perform an add, update, delete, or clear operation on any registered domain (pantry, medications, homework, bucketList, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Registered domain name (e.g. pantry, medications, homework, games, allowance, expenses, qualityActivities)',
        },
        op: {
          type: 'string',
          enum: ['add', 'update', 'delete', 'clear'],
          description: 'Operation to perform',
        },
        match: { type: 'string', description: 'Match criteria for update/delete' },
        id: { type: 'string', description: 'Exact ID for update/delete' },
        params: { type: 'object', description: 'Fields to set or update' },
      },
      required: ['domain', 'op'],
    },
  },
  {
    name: 'controlDevice',
    description: 'Control a verified Home Assistant smart home device.',
    input_schema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          enum: ['light', 'switch', 'lock', 'climate', 'fan', 'cover'],
          description: 'Device domain',
        },
        service: {
          type: 'string',
          enum: ['turn_on', 'turn_off', 'toggle', 'lock', 'unlock', 'open_cover', 'close_cover'],
          description: 'Service action to run',
        },
        entityId: {
          type: 'string',
          description: 'Exact Home Assistant entity_id (e.g. light.kitchen)',
        },
      },
      required: ['domain', 'service', 'entityId'],
    },
  },
  {
    name: 'discoverSmartHome',
    description: 'Query available Home Assistant devices and entity IDs.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'notifyPerson',
    description: 'Send a high-priority push notification directly to a family member.',
    input_schema: {
      type: 'object',
      properties: {
        person: { type: 'string', description: 'First name of the family member' },
        title: { type: 'string', maxLength: 200, description: 'Notification title' },
        body: { type: 'string', maxLength: 2000, description: 'Notification message body' },
      },
      required: ['person', 'title', 'body'],
    },
  },
  {
    name: 'manageMember',
    description: 'Admin operation to remove a member or update a member role.',
    input_schema: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['remove', 'updateRole'] },
        person: { type: 'string', description: 'First name of the member' },
        role: { type: 'string', enum: ['admin', 'child', 'pet'], description: 'Required for updateRole' },
      },
      required: ['op', 'person'],
    },
  },
  {
    name: 'queryTriad',
    description: 'Query the Autonomous Multi-Agent Triad daemon for coding audits, health checks, or code reviews.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          enum: ['doctor', 'gate', 'status', 'review diff'],
          description: 'Triad query (doctor, gate, status, or review diff)',
        },
      },
      required: ['query'],
    },
  },
];

export const REQUIRED_TOOL_FIELDS = new Map<string, string[]>(
  HERMES_TOOLS.map((t) => [t.name, t.input_schema.required ?? []])
);

export const ONE_OF_TOOL_FIELDS: Record<string, string[]> = {
  completeTask: ['match', 'id'],
  uncompleteTask: ['match', 'id'],
  deleteTask: ['match', 'id'],
  completeShoppingItem: ['match', 'id'],
  markBillPaid: ['match', 'id'],
  completePromise: ['match', 'id'],
};

export const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const own = (o: unknown, k: string): boolean =>
  Boolean(o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k));

export const VALID_SERVICES_PER_DOMAIN: Record<string, Set<string>> = {
  light: new Set(['turn_on', 'turn_off', 'toggle']),
  switch: new Set(['turn_on', 'turn_off', 'toggle']),
  fan: new Set(['turn_on', 'turn_off', 'toggle']),
  lock: new Set(['lock', 'unlock']),
  cover: new Set(['open_cover', 'close_cover', 'toggle']),
  climate: new Set(['turn_on', 'turn_off']),
};

export const ALLOWED_GENERIC_DOMAINS = new Set([
  'shopping',
  'bills',
  'appointments',
  'pantry',
  'messages',
  'askParents',
  'moments',
  'bucketList',
  'watchlist',
  'games',
  'medications',
  'petLog',
  'homework',
  'grades',
  'kidsActivities',
  'allowance',
  'expenses',
  'budget',
  'homeMaintenance',
  'qualityActivities',
  'promises',
  'emotions',
]);

export const CHILD_ALLOWED_DOMAINS = new Set([
  'shopping',
  'bucketList',
  'watchlist',
  'games',
  'moments',
  'homework',
  'kidsActivities',
  'qualityActivities',
  'petLog',
  'promises',
  'emotions',
]);

export interface DomainFieldDef {
  type: 'string' | 'number' | 'boolean';
  requiredOnAdd?: boolean;
  minimum?: number;
  maximum?: number;
}

export const DOMAIN_FIELD_SCHEMAS: Record<string, Record<string, DomainFieldDef>> = {
  shopping: {
    name: { type: 'string', requiredOnAdd: true },
    item: { type: 'string' },
    category: { type: 'string' },
    assignedTo: { type: 'string' },
    quantity: { type: 'string' },
    qty: { type: 'string' },
  },
  bills: {
    name: { type: 'string', requiredOnAdd: true },
    amount: { type: 'number', minimum: 0, requiredOnAdd: true },
    dueDate: { type: 'string' },
    recurring: { type: 'boolean' },
  },
  appointments: {
    person: { type: 'string' },
    title: { type: 'string' },
    type: { type: 'string', requiredOnAdd: true },
    doctor: { type: 'string' },
    date: { type: 'string' },
    notes: { type: 'string' },
  },
  pantry: {
    name: { type: 'string', requiredOnAdd: true },
    item: { type: 'string' },
    quantity: { type: 'number' },
    qty: { type: 'number' },
    unit: { type: 'string' },
    category: { type: 'string' },
  },
  messages: {
    author: { type: 'string' },
    text: { type: 'string', requiredOnAdd: true },
  },
  askParents: {
    kid: { type: 'string' },
    request: { type: 'string', requiredOnAdd: true },
    status: { type: 'string' },
  },
  moments: {
    caption: { type: 'string', requiredOnAdd: true },
    emoji: { type: 'string' },
    date: { type: 'string' },
    author: { type: 'string' },
  },
  bucketList: {
    text: { type: 'string', requiredOnAdd: true },
  },
  watchlist: {
    title: { type: 'string', requiredOnAdd: true },
    type: { type: 'string' },
    wantsToWatch: { type: 'boolean' },
  },
  games: {
    name: { type: 'string', requiredOnAdd: true },
  },
  medications: {
    person: { type: 'string' },
    name: { type: 'string', requiredOnAdd: true },
    dosage: { type: 'string' },
    frequency: { type: 'string' },
    nextRefill: { type: 'string' },
    notes: { type: 'string' },
  },
  petLog: {
    type: { type: 'string', requiredOnAdd: true },
    date: { type: 'string' },
    notes: { type: 'string' },
    nextDue: { type: 'string' },
  },
  homework: {
    kid: { type: 'string' },
    subject: { type: 'string' },
    task: { type: 'string', requiredOnAdd: true },
    dueDate: { type: 'string' },
    status: { type: 'string' },
  },
  grades: {
    kid: { type: 'string' },
    subject: { type: 'string', requiredOnAdd: true },
    grade: { type: 'string' },
    date: { type: 'string' },
    notes: { type: 'string' },
  },
  kidsActivities: {
    kid: { type: 'string' },
    name: { type: 'string', requiredOnAdd: true },
    day: { type: 'string' },
    time: { type: 'string' },
    location: { type: 'string' },
  },
  allowance: {
    kid: { type: 'string' },
    amount: { type: 'number', minimum: 0, requiredOnAdd: true },
    type: { type: 'string' },
    reason: { type: 'string' },
    date: { type: 'string' },
  },
  expenses: {
    amount: { type: 'number', minimum: 0, requiredOnAdd: true },
    category: { type: 'string' },
    paidBy: { type: 'string' },
    date: { type: 'string' },
    notes: { type: 'string' },
  },
  budget: {
    name: { type: 'string', requiredOnAdd: true },
    budgeted: { type: 'number', minimum: 0, requiredOnAdd: true },
    month: { type: 'string' },
  },
  homeMaintenance: {
    item: { type: 'string', requiredOnAdd: true },
    name: { type: 'string' },
    category: { type: 'string' },
    lastDone: { type: 'string' },
    nextDue: { type: 'string' },
    notes: { type: 'string' },
  },
  qualityActivities: {
    name: { type: 'string', requiredOnAdd: true },
    person: { type: 'string' },
    duration: { type: 'number', minimum: 0 },
    scheduledAt: { type: 'string' },
  },
  promises: {
    text: { type: 'string', requiredOnAdd: true },
    person: { type: 'string' },
    priority: { type: 'string' },
    dueDate: { type: 'string' },
  },
  emotions: {
    person: { type: 'string' },
    feeling: { type: 'string', requiredOnAdd: true },
    emotion: { type: 'string' },
    context: { type: 'string' },
    note: { type: 'string' },
    intensity: { type: 'number' },
    category: { type: 'string' },
  },
};

export const ALLOWED_FIELDS_PER_DOMAIN: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(DOMAIN_FIELD_SCHEMAS).map(([domain, fields]) => [domain, new Set(Object.keys(fields))])
);

export const ALLOWED_GENERIC_TOP_KEYS = new Set(['domain', 'op', 'match', 'id', 'params']);

export const FORBIDDEN_PARAM_KEYS = new Set([
  'id',
  '_id',
  'household_id',
  'householdId',
  '_household_id',
  'owner',
  'created_by',
  'createdBy',
  'createdAt',
  'updatedAt',
]);

export const ENTITY_ID_REGEX = /^[a-z_]+\.[a-z0-9_]+$/;

export const PROPS = new Map<string, Map<string, any>>(
  HERMES_TOOLS.map((t) => [
    t.name,
    new Map(Object.entries((t.input_schema.properties || {}) as Record<string, any>)),
  ])
);

function fits(v: unknown, p: any): boolean {
  if (!p) return true;
  if (p.enum && !p.enum.includes(v)) return false;
  switch (p.type) {
    case 'string':
      return (
        (typeof v === 'string' || typeof v === 'number') &&
        (p.maxLength == null || String(v).length <= p.maxLength)
      );
    case 'number':
      return (
        typeof v === 'number' &&
        Number.isFinite(v) &&
        (p.minimum == null || v >= p.minimum) &&
        (p.maximum == null || v <= p.maximum)
      );
    case 'boolean':
      return typeof v === 'boolean';
    case 'array':
      return Array.isArray(v) && (!p.items || v.every((x) => fits(x, p.items)));
    case 'object': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) return false;
      const o = v as Record<string, unknown>;
      for (const k of Object.getOwnPropertyNames(o)) {
        if (DANGEROUS_KEYS.has(k) || FORBIDDEN_PARAM_KEYS.has(k)) return false;
        if (p.properties && (!own(p.properties, k) || !p.properties[k])) return false;
      }
      if (p.required && !p.required.every((k: string) => o[k] != null && o[k] !== '')) return false;
      if (p.properties) {
        for (const [k, s] of Object.entries(p.properties)) {
          if (!own(p.properties, k)) continue;
          if (DANGEROUS_KEYS.has(k) || FORBIDDEN_PARAM_KEYS.has(k)) return false;
          if (o[k] != null && !fits(o[k], s)) return false;
        }
      }
      return true;
    }
    default:
      return true;
  }
}

function sanitizeValue(val: unknown, schema: any): unknown {
  if (val == null) return val;
  if (schema?.type === 'string' && typeof val === 'number') {
    return String(val);
  }
  if (Array.isArray(val) && schema?.type === 'array' && schema.items) {
    return val.map((item) => sanitizeValue(item, schema.items));
  }
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const out: Record<string, unknown> = {};
    const itemProps = schema?.properties;
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (DANGEROUS_KEYS.has(k) || FORBIDDEN_PARAM_KEYS.has(k)) continue;
      if (itemProps && own(itemProps, k)) {
        out[k] = sanitizeValue(v, itemProps[k]);
      }
    }
    return out;
  }
  return val;
}

function isValidCallInner(
  name: string,
  input: unknown,
  allowed: Set<string>,
  isAdmin: boolean = true,
): boolean {
  if (!allowed.has(name)) return false;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const proto = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) return false;
  const i = input as Record<string, unknown>;

  // Block prototype pollution attempts on top-level input
  for (const k of Object.getOwnPropertyNames(i)) {
    if (DANGEROUS_KEYS.has(k)) return false;
  }

  const has = (k: string) => {
    const val = i[k];
    if (val == null) return false;
    if (typeof val === 'string') return val.trim().length > 0;
    return true;
  };

  const required = REQUIRED_TOOL_FIELDS.get(name) ?? [];
  if (!required.every(has)) return false;

  const oneOf = own(ONE_OF_TOOL_FIELDS, name) ? ONE_OF_TOOL_FIELDS[name] : undefined;
  if (oneOf && !oneOf.some(has)) return false;

  // Minimum length check on match field for destructive tools to prevent single-character wiping
  if (has('match')) {
    const m = String(i.match).trim();
    if (m.length < 3) return false;
  }

  if (name === 'controlDevice') {
    const domain = String(i.domain);
    const service = String(i.service);
    const entityId = String(i.entityId);
    const svc = own(VALID_SERVICES_PER_DOMAIN, domain) ? VALID_SERVICES_PER_DOMAIN[domain] : undefined;
    if (!svc || !svc.has(service)) {
      return false;
    }
    if (!entityId.startsWith(`${domain}.`)) {
      return false;
    }
    if (!ENTITY_ID_REGEX.test(entityId)) {
      return false;
    }
  }

  if (name === 'queryTriad') {
    const q = String(i.query || '');
    if (!['doctor', 'gate', 'status', 'review diff'].includes(q)) {
      return false;
    }
  }

  if (name === 'manageMember') {
    if (i.op === 'updateRole' && !has('role')) {
      return false;
    }
    if (i.op === 'remove' && i.role != null) {
      return false;
    }
  }

  if (name === 'genericAction') {
    const domain = String(i.domain);
    if (!ALLOWED_GENERIC_DOMAINS.has(domain)) {
      return false;
    }
    for (const k of Object.keys(i)) {
      if (!ALLOWED_GENERIC_TOP_KEYS.has(k)) {
        return false;
      }
    }
    if (!isAdmin) {
      // Non-admins cannot clear collections
      if (i.op === 'clear') return false;
      // Non-admins can only write to child-safe domains, or submit new askParents
      if (domain === 'askParents') {
        if (i.op !== 'add') return false;
        if (i.params && typeof i.params === 'object' && own(i.params as object, 'status')) return false;
      } else if (!CHILD_ALLOWED_DOMAINS.has(domain)) {
        return false;
      }
    }
    if ((i.op === 'update' || i.op === 'delete') && !has('match') && !has('id')) {
      return false;
    }
    const schema = own(DOMAIN_FIELD_SCHEMAS, domain) ? DOMAIN_FIELD_SCHEMAS[domain] : undefined;
    if (!schema) return false;
    if (i.op === 'add') {
      if (!i.params || typeof i.params !== 'object' || Array.isArray(i.params)) return false;
      const paramsObj = i.params as Record<string, unknown>;
      for (const [fName, fDef] of Object.entries(schema)) {
        if (!own(schema, fName)) continue;
        if (fDef.requiredOnAdd) {
          if (fName === 'name' && (domain === 'pantry' || domain === 'shopping')) {
            const hasName = typeof paramsObj.name === 'string' && paramsObj.name.trim().length > 0;
            const hasItem = typeof paramsObj.item === 'string' && paramsObj.item.trim().length > 0;
            if (!hasName && !hasItem) return false;
          } else if (fName === 'item' && domain === 'homeMaintenance') {
            const hasItem = typeof paramsObj.item === 'string' && paramsObj.item.trim().length > 0;
            const hasName = typeof paramsObj.name === 'string' && paramsObj.name.trim().length > 0;
            if (!hasItem && !hasName) return false;
          } else if (fName === 'type' && domain === 'appointments') {
            const hasType = typeof paramsObj.type === 'string' && paramsObj.type.trim().length > 0;
            const hasTitle = typeof paramsObj.title === 'string' && paramsObj.title.trim().length > 0;
            if (!hasType && !hasTitle) return false;
          } else if (fName === 'feeling' && domain === 'emotions') {
            const hasFeeling = typeof paramsObj.feeling === 'string' && paramsObj.feeling.trim().length > 0;
            const hasEmotion = typeof paramsObj.emotion === 'string' && paramsObj.emotion.trim().length > 0;
            if (!hasFeeling && !hasEmotion) return false;
          } else {
            const val = paramsObj[fName];
            if (val == null) return false;
            if (fDef.type === 'string' && (typeof val !== 'string' || val.trim().length === 0)) return false;
            if (fDef.type === 'number' && (typeof val !== 'number' || !Number.isFinite(val) || (fDef.minimum != null && val < fDef.minimum) || (fDef.maximum != null && val > fDef.maximum))) return false;
            if (fDef.type === 'boolean' && typeof val !== 'boolean') return false;
          }
        }
      }
    }
    if (i.params != null) {
      if (typeof i.params !== 'object' || Array.isArray(i.params)) return false;
      const proto = Object.getPrototypeOf(i.params);
      if (proto !== Object.prototype && proto !== null) return false;
      const pKeys = Object.getOwnPropertyNames(i.params);
      if (pKeys.length > 20) return false;
      for (const k of pKeys) {
        if (DANGEROUS_KEYS.has(k) || FORBIDDEN_PARAM_KEYS.has(k)) return false;
        const fieldDef = own(schema, k) ? schema[k] : undefined;
        if (!fieldDef) return false;
        const val = (i.params as Record<string, unknown>)[k];
        if (val != null) {
          if (fieldDef.type === 'string') {
            if ((typeof val !== 'string' && typeof val !== 'number') || String(val).length > 1000) return false;
          } else if (fieldDef.type === 'number') {
            if (typeof val !== 'number' || !Number.isFinite(val)) return false;
            if (fieldDef.minimum != null && val < fieldDef.minimum) return false;
            if (fieldDef.maximum != null && val > fieldDef.maximum) return false;
          } else if (fieldDef.type === 'boolean') {
            if (typeof val !== 'boolean') return false;
          }
        }
      }
    }
  }

  const props = PROPS.get(name) ?? new Map<string, any>();
  for (const [k, v] of Object.entries(i)) {
    if (name !== 'genericAction' && !props.has(k)) {
      return false;
    }
    if (v != null && props.has(k) && !fits(v, props.get(k))) {
      return false;
    }
  }

  return true;
}

export function isValidCall(
  name: string,
  input: unknown,
  allowed: Set<string>,
  isAdmin: boolean = true,
): boolean {
  try {
    return isValidCallInner(name, input, allowed, isAdmin);
  } catch {
    return false;
  }
}

export function sanitizeToolParams(name: string, input: Record<string, unknown>): Record<string, unknown> {
  const props = PROPS.get(name) ?? new Map<string, any>();
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (DANGEROUS_KEYS.has(k)) continue;
    if (name === 'genericAction') {
      if (!ALLOWED_GENERIC_TOP_KEYS.has(k)) continue;
      if (k === 'params' && v && typeof v === 'object' && !Array.isArray(v)) {
        const domain = String(input.domain || '');
        const schema = own(DOMAIN_FIELD_SCHEMAS, domain) ? DOMAIN_FIELD_SCHEMAS[domain] : undefined;
        const cleanedParams: Record<string, unknown> = {};
        for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
          if (DANGEROUS_KEYS.has(pk) || FORBIDDEN_PARAM_KEYS.has(pk)) continue;
          const fieldDef = schema && own(schema, pk) ? schema[pk] : undefined;
          if (!fieldDef) continue;
          if (fieldDef.type === 'string' && typeof pv === 'number') {
            cleanedParams[pk] = String(pv);
          } else {
            cleanedParams[pk] = pv;
          }
        }
        cleaned.params = cleanedParams;
      } else {
        cleaned[k] = sanitizeValue(v, props.get(k));
      }
    } else if (props.has(k)) {
      cleaned[k] = sanitizeValue(v, props.get(k));
    }
  }
  return cleaned;
}

