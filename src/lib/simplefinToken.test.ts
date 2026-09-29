import { describe, it, expect } from 'vitest';
import { parseSetupToken } from './simplefinToken';

const claim = 'https://beta-bridge.simplefin.org/simplefin/claim/abc123def456';
const token = btoa(claim);

describe('parseSetupToken', () => {
  it('accepts a real-looking setup token', () => {
    expect(parseSetupToken(token)).toBe(token);
  });
  it('tolerates whitespace, line breaks and surrounding quotes', () => {
    expect(parseSetupToken(`  "${token.slice(0, 20)}\n${token.slice(20)}"  `)).toBe(token);
  });
  it('accepts URL-safe base64', () => {
    const urlSafe = btoa('https://bridge.simplefin.org/simplefin/claim/??>>??==').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(parseSetupToken(urlSafe)).not.toBeNull();
  });
  it('rejects text that is not a token', () => {
    expect(parseSetupToken('')).toBeNull();
    expect(parseSetupToken('hello world')).toBeNull();
    expect(parseSetupToken('short')).toBeNull();
  });
  it('rejects base64 that is not a https claim URL', () => {
    expect(parseSetupToken(btoa('http://insecure.example.com/claim/abcdef123456'))).toBeNull();
    expect(parseSetupToken(btoa('just some words that are long enough to pass length'))).toBeNull();
  });
});
