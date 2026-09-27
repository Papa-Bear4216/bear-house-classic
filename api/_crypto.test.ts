import { describe, it, expect, beforeEach } from 'vitest';
import { signGmailState, verifyGmailState } from './_crypto';

beforeEach(() => {
  process.env.GMAIL_STATE_SECRET = 'test-gmail-state-secret-do-not-use-in-prod';
});

describe('signGmailState / verifyGmailState', () => {
  it('round-trips a signed state and returns the original payload', async () => {
    const state = await signGmailState({ memberId: 'm1', householdId: 'h1' });
    const result = await verifyGmailState(encodeURIComponent(state));
    expect(result).toEqual({ memberId: 'm1', householdId: 'h1' });
  });

  it('rejects a tampered payload (signature no longer matches)', async () => {
    const state = await signGmailState({ memberId: 'm1', householdId: 'h1' });
    const [body, sig] = state.split('.');
    // Flip a character in the body — signature was computed over the original.
    const tamperedBody = body.slice(0, -1) + (body.slice(-1) === 'A' ? 'B' : 'A');
    const tampered = `${tamperedBody}.${sig}`;
    const result = await verifyGmailState(encodeURIComponent(tampered));
    expect(result).toBeNull();
  });

  it('rejects an expired token', async () => {
    const realNow = Date.now;
    Date.now = () => realNow() - 11 * 60 * 1000; // sign as if 11 minutes ago
    const state = await signGmailState({ memberId: 'm1', householdId: 'h1' });
    Date.now = realNow;

    const result = await verifyGmailState(encodeURIComponent(state));
    expect(result).toBeNull();
  });

  it('rejects a malformed token with the wrong number of parts', async () => {
    expect(await verifyGmailState('not-a-valid-token')).toBeNull();
    expect(await verifyGmailState('too.many.parts.here')).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const state = await signGmailState({ memberId: 'm1', householdId: 'h1' });
    process.env.GMAIL_STATE_SECRET = 'a-completely-different-secret';
    const result = await verifyGmailState(encodeURIComponent(state));
    expect(result).toBeNull();
  });

  it('rejects gracefully (no throw) with a malformed % escape sequence', async () => {
    // A raw "%" not followed by two hex digits throws URIError from
    // decodeURIComponent — must be caught inside verifyGmailState, not
    // propagate as an unhandled exception.
    await expect(verifyGmailState('%')).resolves.toBeNull();
  });
});
