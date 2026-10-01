import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  offlineParseSchoolStuff,
  parseSchoolAnnouncement,
  saveSchoolItems,
  localDateMs,
  type SchoolItem,
} from './schoolAdder';
import { loadJSON, KEYS } from './familyos';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
  removeItem(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  [name: string]: any;
}

const mockLocalStorage = new MemoryStorage();
try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
    configurable: true,
  });
} catch {
  (globalThis as any).localStorage = mockLocalStorage;
}

describe('School Stuff Adder - Parser & Saver', () => {
  const availableKids = ['Maya', 'Leo'];

  beforeEach(() => {
    mockLocalStorage.clear();
    vi.clearAllMocks();
  });

  describe('offlineParseSchoolStuff', () => {
    it('detects permission slip and payment requirements as action items', () => {
      const text = `Zoo Field Trip Permission Slip
Please sign the attached consent form and return $15.00 cash by 2026-10-18 for Maya's trip.`;

      const items = offlineParseSchoolStuff(text, availableKids);
      expect(items).toHaveLength(1);
      const item = items[0];
      expect(item.type).toBe('action_item');
      expect(item.kid).toBe('Maya');
      expect(item.requiresParentSignoff).toBe(true);
      expect(item.requiresPayment).toBe(true);
      expect(item.paymentAmount).toBe(15);
      expect(item.dueDate).toBe('2026-10-18');
    });

    it('classifies "Math homework due Friday" as homework, not payment action item', () => {
      const text = `Math homework due Friday: complete pages 10 to 12.`;
      const items = offlineParseSchoolStuff(text, availableKids, 'Leo');
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('homework');
      expect(items[0].requiresPayment).toBe(false);
      expect(items[0].kid).toBe('Leo');
    });

    it('handles kid names containing special regex characters without throwing', () => {
      const text = `Please bring the permission slip for Mary (Jr) tomorrow.`;
      expect(() => offlineParseSchoolStuff(text, ['Mary (Jr)', 'Leo'])).not.toThrow();
      const items = offlineParseSchoolStuff(text, ['Mary (Jr)', 'Leo']);
      expect(items[0].kid).toBe('Mary (Jr)');
    });

    it('detects events like picture day and assemblies', () => {
      const text = `Reminder: School Picture Day on 2026-10-14! Dress your best. Leo will have his photo taken before lunch.`;

      const items = offlineParseSchoolStuff(text, availableKids);
      expect(items).toHaveLength(1);
      const item = items[0];
      expect(item.type).toBe('event');
      expect(item.kid).toBe('Leo');
      expect(item.dueDate).toBe('2026-10-14');
    });

    it('parses month-name dates like Oct 15 into formatted date', () => {
      const text = `Field trip to the nature center on Oct 15. Maya should wear sneakers.`;
      const items = offlineParseSchoolStuff(text, availableKids);
      expect(items).toHaveLength(1);
      expect(items[0].dueDate).toMatch(/^\d{4}-10-15$/);
    });

    it('falls back to homework assignment when no specific event/slip trigger is present', () => {
      const text = `Read chapters 3 and 4 of Charlotte's Web and complete worksheet #2.`;

      const items = offlineParseSchoolStuff(text, availableKids, 'Maya');
      expect(items).toHaveLength(1);
      const item = items[0];
      expect(item.type).toBe('homework');
      expect(item.kid).toBe('Maya');
    });
  });

  describe('localDateMs helper', () => {
    it('computes exact local date without UTC day rollover', () => {
      const ms = localDateMs('2026-10-18', '14:30');
      expect(ms).not.toBeNull();
      const dt = new Date(ms!);
      expect(dt.getFullYear()).toBe(2026);
      expect(dt.getMonth()).toBe(9); // 0-indexed October
      expect(dt.getDate()).toBe(18);
      expect(dt.getHours()).toBe(14);
      expect(dt.getMinutes()).toBe(30);
    });

    it('returns null on invalid date strings like 2026-13-45', () => {
      expect(localDateMs('2026-13-45')).toBeNull();
      expect(localDateMs('invalid-date')).toBeNull();
    });
  });

  describe('parseSchoolAnnouncement', () => {
    it('successfully processes structured LLM response with null fields and string payment', async () => {
      const mockLlmResponse = {
        text: JSON.stringify({
          items: [
            {
              kid: 'Leo',
              type: 'homework',
              title: 'Science Solar System Model',
              subject: 'Science',
              dueDate: null,
              dueTime: null,
              notes: null,
              requiresParentSignoff: false,
              requiresPayment: false,
              paymentAmount: null,
            },
            {
              kid: 'Leo',
              type: 'action_item',
              title: 'Science Museum Chaperone Slip',
              subject: 'Admin',
              dueDate: '2026-10-15',
              requiresParentSignoff: true,
              requiresPayment: true,
              paymentAmount: '15.00', // coerced string number
            },
          ],
        }),
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockLlmResponse,
      }));

      const result = await parseSchoolAnnouncement('Science newsletter for Leo...', availableKids);
      expect(result.isFallback).toBe(false);
      expect(result.items).toHaveLength(2);

      const hw = result.items.find((i) => i.type === 'homework');
      expect(hw?.title).toBe('Science Solar System Model');
      expect(hw?.subject).toBe('Science');
      expect(hw?.dueDate).toBeUndefined();

      const action = result.items.find((i) => i.type === 'action_item');
      expect(action?.requiresParentSignoff).toBe(true);
      expect(action?.paymentAmount).toBe(15);

      vi.unstubAllGlobals();
    });

    it('falls back to offline parser on network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const result = await parseSchoolAnnouncement('Sign permission slip for Maya by 2026-10-22', availableKids);
      expect(result.isFallback).toBe(true);
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0].kid).toBe('Maya');
      expect(result.items[0].requiresParentSignoff).toBe(true);

      vi.unstubAllGlobals();
    });
  });

  describe('saveSchoolItems', () => {
    it('routes homework, events, and action items to their correct persistent stores', () => {
      const items: SchoolItem[] = [
        {
          id: '1',
          kid: 'Maya',
          type: 'homework',
          title: 'Math Worksheet 4',
          subject: 'Math',
          dueDate: '2026-10-12',
          source: 'text_paste',
          selected: true,
        },
        {
          id: '2',
          kid: 'Leo',
          type: 'event',
          title: 'Fall Band Concert',
          subject: 'Music',
          dueDate: '2026-10-15',
          dueTime: '18:30',
          source: 'text_paste',
          selected: true,
        },
        {
          id: '3',
          kid: 'Maya',
          type: 'action_item',
          title: 'Sign Ski Trip Waiver',
          subject: 'Admin',
          dueDate: '2026-10-18',
          requiresParentSignoff: true,
          requiresPayment: true,
          paymentAmount: 50,
          source: 'text_paste',
          selected: true,
        },
      ];

      const counts = saveSchoolItems(items, 'Dad');
      expect(counts.homeworkAdded).toBe(1);
      expect(counts.eventsAdded).toBe(1);
      expect(counts.tasksAdded).toBe(1);

      // Verify homework in familyos_homework
      const hw = loadJSON<any[]>('familyos_homework', []);
      expect(hw).toHaveLength(1);
      expect(hw[0].task).toBe('Math Worksheet 4');
      expect(hw[0].kid).toBe('Maya');

      // Verify event in KEYS.activities
      const activities = loadJSON<any[]>(KEYS.activities, []);
      expect(activities).toHaveLength(1);
      expect(activities[0].name).toContain('Fall Band Concert');
      expect(activities[0].person).toBe('Leo');

      // Verify action item in KEYS.tasks
      const tasks = loadJSON<any[]>(KEYS.tasks, []);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].priority).toBe('High');
      expect(tasks[0].text).toContain('Sign-off Required');
      expect(tasks[0].text).toContain('$50');
    });

    it('prevents duplicate items when saving the same items twice', () => {
      const items: SchoolItem[] = [
        {
          id: '1',
          kid: 'Maya',
          type: 'homework',
          title: 'Math Worksheet 4',
          subject: 'Math',
          dueDate: '2026-10-12',
          source: 'text_paste',
          selected: true,
        },
      ];

      const counts1 = saveSchoolItems(items, 'Dad');
      expect(counts1.homeworkAdded).toBe(1);

      // Re-saving same items should be idempotent
      const counts2 = saveSchoolItems(items, 'Dad');
      expect(counts2.homeworkAdded).toBe(0);

      const hw = loadJSON<any[]>('familyos_homework', []);
      expect(hw).toHaveLength(1);
    });

    it('skips unselected items', () => {
      const items: SchoolItem[] = [
        {
          id: '1',
          kid: 'Maya',
          type: 'homework',
          title: 'Unselected Homework',
          subject: 'English',
          source: 'text_paste',
          selected: false,
        },
      ];

      const counts = saveSchoolItems(items);
      expect(counts.homeworkAdded).toBe(0);
      const hw = loadJSON<any[]>('familyos_homework', []);
      expect(hw).toHaveLength(0);
    });
  });
});
