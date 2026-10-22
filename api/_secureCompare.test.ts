import { describe, expect, it } from 'vitest';
import { secretsEqual, sha256Hex, timingSafeEqual } from './_secureCompare';

describe('_secureCompare', () => {
  it('sha256Hex matches the known digest of "abc"', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('timingSafeEqual returns false for unequal lengths without throwing', () => {
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
  });

  it('secretsEqual compares secrets of any length', async () => {
    expect(await secretsEqual('a', 'a')).toBe(true);
    expect(await secretsEqual('a', 'aa')).toBe(false);
    expect(await secretsEqual('', 'x')).toBe(false);
  });
});
