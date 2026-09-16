import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDailyBrainChecks } from './daily-brain.js';
import * as db from './_db.js';
import * as gmailScan from './gmail-server-scan.js';

vi.mock('./_db.js', () => ({
  dbGet: vi.fn(),
  dbSet: vi.fn(),
  dbAddHouseholdMemory: vi.fn(),
  dbGetHouseholdMembersByHouseholdId: vi.fn(),
  dbGetHouseholdGmailStatus: vi.fn(),
}));

vi.mock('./gmail-server-scan.js', () => ({
  scanMemberGmail: vi.fn(),
}));

describe('api/daily-brain.ts: runDailyBrainChecks', () => {
  const householdId = 'hh-test-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs all checks and returns empty additions when no rules trigger', async () => {
    vi.mocked(db.dbGet).mockResolvedValue([]);
    vi.mocked(db.dbGetHouseholdGmailStatus).mockResolvedValue([]);

    const result = await runDailyBrainChecks(householdId);

    expect(result).toEqual({
      shoppingAdded: [],
      tasksAdded: [],
      carMaintenanceAdded: [],
      gmailTasksAdded: [],
      emotionsFlagged: [],
    });
    expect(db.dbSet).not.toHaveBeenCalled();
    expect(db.dbAddHouseholdMemory).not.toHaveBeenCalled();
  });

  it('adds missing meal ingredients to shopping list when not in pantry or shopping', async () => {
    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
    const now = new Date();
    const todayName = DAYS[(now.getDay() + 6) % 7];

    vi.mocked(db.dbGet).mockImplementation(async (key: string) => {
      if (key === 'familyos_meals') {
        return {
          [todayName]: {
            cookedIngredients: {
              Dinner: [
                { name: 'Garlic', quantity: 2, unit: 'cloves' },
                { name: 'Olive Oil', quantity: 1, unit: 'bottle' },
              ],
            },
          },
        };
      }
      if (key === 'familyos_pantry') {
        return [{ name: 'garlic', quantity: 5 }]; // we have garlic
      }
      if (key === 'familyos_shopping') {
        return [];
      }
      return [];
    });
    vi.mocked(db.dbGetHouseholdGmailStatus).mockResolvedValue([]);

    const result = await runDailyBrainChecks(householdId);
    if ('error' in result) throw new Error(result.error);

    expect(result.shoppingAdded).toEqual(['Olive Oil']);
    expect(db.dbSet).toHaveBeenCalledWith(
      'familyos_shopping',
      householdId,
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Olive Oil',
          category: 'Groceries',
          source: 'daily-brain',
        }),
      ])
    );
  });

  it('creates tasks for bills due within 3 days if not already present', async () => {
    const now = Date.now();
    const dueInTwoDays = now + 2 * 86400000;

    vi.mocked(db.dbGet).mockImplementation(async (key: string) => {
      if (key === 'familyos_bills') {
        return [
          { name: 'Electric Bill', dueDate: dueInTwoDays, paid: false },
          { name: 'Internet', dueDate: dueInTwoDays, paid: true }, // paid -> skip
          { name: 'Mortgage', dueDate: now + 10 * 86400000, paid: false }, // > 3 days -> skip
        ];
      }
      if (key === 'household_tasks') {
        return [];
      }
      return [];
    });
    vi.mocked(db.dbGetHouseholdGmailStatus).mockResolvedValue([]);

    const result = await runDailyBrainChecks(householdId);
    if ('error' in result) throw new Error(result.error);

    expect(result.tasksAdded).toEqual(['Electric Bill']);
    expect(db.dbSet).toHaveBeenCalledWith(
      'household_tasks',
      householdId,
      expect.arrayContaining([
        expect.objectContaining({
          text: 'Pay Electric Bill',
          priority: 'High',
          source: 'daily-brain',
        }),
      ])
    );
  });

  it('creates maintenance task for car due within 7 days', async () => {
    const now = Date.now();
    const dueInFiveDays = new Date(now + 5 * 86400000).toISOString();

    vi.mocked(db.dbGet).mockImplementation(async (key: string) => {
      if (key === 'familyos_cars') {
        return [
          {
            name: 'Subaru Outback',
            deletedAt: null,
            entries: [
              { type: 'Oil Change', nextDueDate: dueInFiveDays },
            ],
          },
        ];
      }
      if (key === 'household_tasks') {
        return [];
      }
      return [];
    });
    vi.mocked(db.dbGetHouseholdGmailStatus).mockResolvedValue([]);

    const result = await runDailyBrainChecks(householdId);
    if ('error' in result) throw new Error(result.error);

    expect(result.carMaintenanceAdded).toEqual(['Subaru Outback']);
    expect(db.dbSet).toHaveBeenCalledWith(
      'household_tasks',
      householdId,
      expect.arrayContaining([
        expect.objectContaining({
          text: 'Oil Change due for Subaru Outback',
          category: 'Maintenance',
          priority: 'Medium',
          source: 'daily-brain',
        }),
      ])
    );
  });

  it('flags emotion patterns when a member logs 3+ negative emotions in 7 days', async () => {
    const now = Date.now();
    const recent = now - 2 * 86400000;

    vi.mocked(db.dbGet).mockImplementation(async (key: string) => {
      if (key === 'emotion_logs') {
        return [
          { person: 'Alice', category: 'Anxiety', createdAt: recent },
          { person: 'Alice', category: 'Frustration', createdAt: recent },
          { person: 'Alice', category: 'Concern', createdAt: recent },
          { person: 'Bob', category: 'Joy', createdAt: recent },
        ];
      }
      return [];
    });
    vi.mocked(db.dbGetHouseholdGmailStatus).mockResolvedValue([]);

    const result = await runDailyBrainChecks(householdId);
    if ('error' in result) throw new Error(result.error);

    expect(result.emotionsFlagged).toEqual(['Alice']);
    expect(db.dbAddHouseholdMemory).toHaveBeenCalledWith(
      householdId,
      expect.stringContaining('Alice logged 3 negative emotions this week'),
      'auto'
    );
  });

  it('scans connected Gmail and creates tasks assigned to that member', async () => {
    vi.mocked(db.dbGet).mockResolvedValue([]);
    vi.mocked(db.dbGetHouseholdGmailStatus).mockResolvedValue([
      { id: 'mem-1', gmail_connected_email: 'alice@example.com' } as any,
    ]);
    vi.mocked(db.dbGetHouseholdMembersByHouseholdId).mockResolvedValue([
      { id: 'mem-1', name: 'Alice', email: 'alice@example.com', role: 'adult', color: 'blue', pin_hash: null, household_id: householdId },
    ]);
    vi.mocked(gmailScan.scanMemberGmail).mockResolvedValue([
      { subject: 'Dental Appointment Confirmation' } as any,
    ]);

    const result = await runDailyBrainChecks(householdId);
    if ('error' in result) throw new Error(result.error);

    expect(result.gmailTasksAdded).toEqual(['Alice: Dental Appointment Confirmation']);
    expect(db.dbSet).toHaveBeenCalledWith(
      'household_tasks',
      householdId,
      expect.arrayContaining([
        expect.objectContaining({
          text: 'Dental Appointment Confirmation',
          person: 'Alice',
          source: 'daily-brain-gmail',
        }),
      ])
    );
  });
});
