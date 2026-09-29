import { describe, it, expect } from 'vitest';
import { parseLinkParams, stashLinkParams, readPendingLink, clearPendingLink, GOOGLE_HOME_LINK_PATH } from './googleHomeLink';

const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const q = '?client_id=cid&redirect_uri=https%3A%2F%2Foauth-redirect.googleusercontent.com%2Fr%2Fp&state=abc&response_type=code';

describe('googleHomeLink', () => {
  it('parses the authorization request', () => {
    expect(parseLinkParams(q)).toEqual({ client_id: 'cid', redirect_uri: 'https://oauth-redirect.googleusercontent.com/r/p', state: 'abc' });
  });
  it('rejects missing params and non-code response types', () => {
    expect(parseLinkParams('?client_id=cid&state=abc')).toBeNull();
    expect(parseLinkParams(q.replace('response_type=code', 'response_type=token'))).toBeNull();
    expect(parseLinkParams('')).toBeNull();
  });
  it('parks the params on the link path and survives until cleared', () => {
    const s = memStore();
    stashLinkParams(GOOGLE_HOME_LINK_PATH, q, s);
    expect(readPendingLink(s)?.state).toBe('abc');
    clearPendingLink(s);
    expect(readPendingLink(s)).toBeNull();
  });
  it('ignores the same params on any other path', () => {
    const s = memStore();
    stashLinkParams('/privacy', q, s);
    expect(readPendingLink(s)).toBeNull();
  });
  it('tolerates a missing or corrupt store', () => {
    expect(readPendingLink(null)).toBeNull();
    const s = memStore(); s.setItem('google_home_link_params', '{nope');
    expect(readPendingLink(s)).toBeNull();
  });
});
