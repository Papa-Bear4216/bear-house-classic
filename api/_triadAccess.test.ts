import { describe, it, expect, beforeEach } from 'vitest';
import { isTriadHousehold } from './_triadAccess';

beforeEach(() => { delete process.env.TRIAD_HOUSEHOLD_ID; });

describe('isTriadHousehold', () => {
  it('fails closed when TRIAD_HOUSEHOLD_ID is unset', () => {
    expect(isTriadHousehold('household-1')).toBe(false);
  });
  it('allows only the listed household', () => {
    process.env.TRIAD_HOUSEHOLD_ID = 'household-1';
    expect(isTriadHousehold('household-1')).toBe(true);
    expect(isTriadHousehold('household-2')).toBe(false);
  });
  it('supports a comma-separated list with spaces', () => {
    process.env.TRIAD_HOUSEHOLD_ID = 'a, b ,c';
    expect(isTriadHousehold('b')).toBe(true);
  });
  it('rejects empty and missing ids', () => {
    process.env.TRIAD_HOUSEHOLD_ID = 'household-1';
    expect(isTriadHousehold('')).toBe(false);
    expect(isTriadHousehold(null)).toBe(false);
    expect(isTriadHousehold(undefined)).toBe(false);
  });
});
