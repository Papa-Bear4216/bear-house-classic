import { describe, it, expect } from 'vitest';
import { getVisibleModulesFor, ALL_MODULES, DEFAULT_CORE_NAV } from './navVisibility';

describe('getVisibleModulesFor', () => {
  it('returns all 10 modules for superadmin', () => {
    const visible = getVisibleModulesFor('superadmin');
    expect(visible.map(m => m.id).sort()).toEqual(ALL_MODULES.map(m => m.id).sort());
  });

  it('returns all 10 modules for admin', () => {
    const visible = getVisibleModulesFor('admin');
    expect(visible.length).toBe(10);
  });

  it('returns exactly 5 modules for child, excluding health/finance/quality/promises/emotions', () => {
    const visible = getVisibleModulesFor('child');
    const ids = visible.map(m => m.id).sort();
    expect(ids).toEqual(['dashboard', 'family', 'household', 'kids', 'rewards'].sort());
  });
});

describe('DEFAULT_CORE_NAV', () => {
  it('is exactly 3 modules and never includes dashboard', () => {
    expect(DEFAULT_CORE_NAV.length).toBe(3);
    expect(DEFAULT_CORE_NAV).not.toContain('dashboard');
  });

  it('leaves exactly one module (kids) visible-but-uncore for a child', () => {
    const visible = getVisibleModulesFor('child').map(m => m.id);
    const leftover = visible.filter(id => id !== 'dashboard' && !DEFAULT_CORE_NAV.includes(id));
    expect(leftover).toEqual(['kids']);
  });
});
