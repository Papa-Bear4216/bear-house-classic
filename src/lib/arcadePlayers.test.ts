import { describe, it, expect } from 'vitest';
import { arcadePlayers } from './arcadePlayers';

const dad = { id: 'dad', role: 'superadmin' };
const mom = { id: 'mom', role: 'admin' };
const kid = { id: 'kid', role: 'child' };
const kid2 = { id: 'kid2', role: 'child' };
const pet = { id: 'lucy', role: 'pet' };
const all = [dad, mom, kid, kid2, pet];

describe('arcadePlayers', () => {
  it('locks a child to their own profile — never an adult or sibling', () => {
    expect(arcadePlayers(all, kid, 'child')).toEqual([kid]);
  });

  it('lets adults pick anyone except pets', () => {
    expect(arcadePlayers(all, dad, 'superadmin').map((m) => m.id)).toEqual(['dad', 'mom', 'kid', 'kid2']);
    expect(arcadePlayers(all, mom, 'admin').map((m) => m.id)).toContain('kid');
  });

  it('returns nobody for a pet or a signed-out user', () => {
    expect(arcadePlayers(all, pet, 'pet')).toEqual([]);
    expect(arcadePlayers(all, null, null)).toEqual([]);
  });
});
