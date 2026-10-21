import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbGetHouseholdMembersByHouseholdId = vi.fn();
const dbGetHouseholdMemory = vi.fn();
vi.mock('./_db.js', () => ({
  dbGetHouseholdMembersByHouseholdId: (...args: unknown[]) => dbGetHouseholdMembersByHouseholdId(...args),
  dbGetHouseholdMemory: (...args: unknown[]) => dbGetHouseholdMemory(...args),
}));
vi.mock('./_triadAccess.js', () => ({ isTriadHousehold: () => false }));

import { buildHermesContext } from './_hermesContext.js';

const base = {
  householdId: 'house-1',
  callerRole: 'admin',
  canControlDevices: true,
  surface: 'floating-chat',
  enableTools: true,
  neutralMode: false,
  modelId: 'claude-sonnet-4-6',
};

describe('buildHermesContext', () => {
  beforeEach(() => {
    dbGetHouseholdMembersByHouseholdId.mockReset().mockResolvedValue([
      { id: 'member-1', name: 'Lucy', role: 'pet' },
    ]);
    dbGetHouseholdMemory.mockReset().mockResolvedValue([
      { id: 'memory-1', text: 'Lucy prefers her blue leash.', source: 'manual', created_at: '2026-01-01' },
    ]);
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
