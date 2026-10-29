import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbGetHouseholdMembersByHouseholdId = vi.fn();
const dbGetHouseholdMemory = vi.fn();
const dbGet = vi.fn();
vi.mock('./_db.js', () => ({
  dbGet: (...args: unknown[]) => dbGet(...args),
  dbGetHouseholdMembersByHouseholdId: (...args: unknown[]) => dbGetHouseholdMembersByHouseholdId(...args),
  dbGetHouseholdMemory: (...args: unknown[]) => dbGetHouseholdMemory(...args),
}));

import { buildHermesContext, formatHermesSnapshot, normalizeSurfaceLine } from './_hermesContext.js';

const base = {
  householdId: 'house-1',
  callerRole: 'admin',
  canControlDevices: true,
  surface: 'floating-chat',
  enableTools: true,
  neutralMode: false,
  modelId: 'claude-sonnet-5-5',
};

describe('buildHermesContext', () => {
  beforeEach(() => {
    dbGet.mockReset().mockResolvedValue(null);
    dbGetHouseholdMembersByHouseholdId.mockReset().mockResolvedValue([
      { id: 'member-1', name: 'Lucy', role: 'pet' },
    ]);
    dbGetHouseholdMemory.mockReset().mockResolvedValue([
      { id: 'memory-1', text: 'Lucy prefers her blue leash.', source: 'manual', created_at: '2026-01-01' },
    ]);
  });

  it('builds a server snapshot for fresh clients and excludes past appointments', async () => {
    dbGet.mockImplementation(async (key: string) => ({
      household_tasks: [
        ...Array.from({ length: 23 }, (_, i) => ({ id: `t${i}`, text: `Task ${i}`, priority: i < 9 ? 'High' : 'Low' })),
      ],
      familyos_shopping: [{ name: 'Apples', quantity: 2 }],
      familyos_appointments: [
        { date: '2000-10-20', person: 'Lucy', title: 'Old visit' },
        { date: '2099-10-22', person: 'Lucy', title: 'Upcoming visit' },
      ],
      family_promises: [],
    } as Record<string, unknown>)[key] ?? null);
    const context = await buildHermesContext({ ...base, clientSnapshot: undefined });
    expect(context.system).toContain('OPEN TASKS (23 total');
    expect(context.system).toContain('Apples ×2');
    expect(context.system).toContain('Upcoming visit');
    expect(context.system).not.toContain('Old visit');
    expect(dbGet).toHaveBeenCalledTimes(4);
  });

  it('reports hidden low-priority tasks honestly in a server snapshot', () => {
    const snapshot = formatHermesSnapshot({
      tasks: [
        ...Array.from({ length: 23 }, (_, i) => ({ id: `t${i}`, text: `Task ${i}`, priority: i < 9 ? 'High' : i < 14 ? 'Medium' : 'Low' })),
      ],
    }, new Date('2026-10-21T12:00:00Z'));
    expect(snapshot).toContain('OPEN TASKS (23 total, showing 13 by priority; 9 Low not shown)');
  });

  it('builds household identity, roster, memory, and a manifest from executable tools', async () => {
    const context = await buildHermesContext({ ...base, clientSnapshot: 'LIVE DATA\nshopping: apples' });
    expect(context.system).toContain('You are speaking through: floating-chat.');
    expect(context.system).toContain('Lucy (pet)');
    expect(context.system).toContain('Lucy prefers her blue leash.');
    expect(context.system).toContain('shopping: apples');
    expect(context.tools.map((tool) => tool.name)).toContain('updateMemory');
    expect(context.tools.map((tool) => tool.name)).not.toContain('queryTriad');
    expect(context.system).toContain('- updateMemory:');
  });

  it('answers surface and app-map questions from generated self-knowledge', async () => {
    const context = await buildHermesContext({ ...base, clientSnapshot: 'LIVE DATA\nshopping: apples' });
    expect(context.system).toMatch(/floating Hermes button on signed-in pages/i);
    expect(context.system).toContain('Hermes Copilot AI [hermes-chat; Floating button + Bento card + Directory; data: household_memory (table); Hermes: read-write]');
    expect(context.system).toContain('this household');
  });

  it('differs between household surfaces only by the generated surface line', async () => {
    const snapshot = 'LIVE DATA\nshopping: apples';
    const floating = await buildHermesContext({ ...base, surface: 'floating-chat', clientSnapshot: snapshot });
    const bento = await buildHermesContext({ ...base, surface: 'bento-copilot', clientSnapshot: snapshot });
    expect(normalizeSurfaceLine(floating.system)).toBe(normalizeSurfaceLine(bento.system));
  });

  it('keeps the sealed Monster persona isolated and does not query household data', async () => {
    const context = await buildHermesContext({
      ...base,
      surface: 'kids-monster',
      sealedPersona: 'Verified Monster Translator persona',
      clientSnapshot: 'MUST NOT APPEAR',
      enableTools: true,
    });
    expect(context.system).toBe('Verified Monster Translator persona');
    expect(context.tools).toEqual([]);
    expect(context.memoryCount).toBe(0);
    expect(dbGetHouseholdMembersByHouseholdId).not.toHaveBeenCalled();
    expect(dbGetHouseholdMemory).not.toHaveBeenCalled();
  });

  it('keeps memory and admin-only tools out of child contexts', async () => {
    const context = await buildHermesContext({ ...base, callerRole: 'child', clientSnapshot: 'FINANCE: $900; BILLS UNPAID: rent' });
    expect(context.system).toContain('Child Safety Persona Active');
    expect(context.system).not.toContain('$900');
    expect(context.system).toContain('FINANCE: not available to this account');
    expect(context.memoryCount).toBe(0);
    expect(context.tools.map((tool) => tool.name)).not.toContain('updateMemory');
    expect(context.tools.map((tool) => tool.name)).not.toContain('notifyPerson');
  });

  it('keeps surface parity after normalizing the surface identity line', async () => {
    const a = await buildHermesContext({ ...base, surface: 'floating-chat' });
    const b = await buildHermesContext({ ...base, surface: 'bento-copilot' });
    const normalizeSurfaceLine = (system: string) => system.replace(/You are speaking through: [^\n]+\./, 'You are speaking through: SURFACE.');
    expect(normalizeSurfaceLine(a.system)).toBe(normalizeSurfaceLine(b.system));
  });
});
