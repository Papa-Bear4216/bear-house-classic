// A SimpleFIN setup token is a base64-encoded claim URL. People paste them from
// a web page, so tolerate whitespace/line breaks and stray quotes, and reject
// anything that clearly isn't one before it hits the server.
const QUOTES = '"\'`';

// Plain loops instead of a regex: this runs on arbitrary pasted text, and an
// alternation of anchored quantifiers can backtrack badly on long input.
function stripQuotes(s: string): string {
  let start = 0, end = s.length;
  while (start < end && QUOTES.includes(s[start])) start++;
  while (end > start && QUOTES.includes(s[end - 1])) end--;
  return s.slice(start, end);
}

export function parseSetupToken(input: string): string | null {
  const cleaned = stripQuotes(input.trim()).replace(/\s+/g, '');
  if (cleaned.length < 24 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(cleaned)) return null;
  try {
    const b64 = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    return /^https:\/\//i.test(decoded) ? cleaned : null;
  } catch {
    return null;
  }
}

export const SIMPLEFIN_CREATE_URL = 'https://beta-bridge.simplefin.org/simplefin/create';
