import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  resolveCallerMember: vi.fn(),
  dbGetHouseholdMembersByHouseholdId: vi.fn(),
  dbGetHouseholdMemberById: vi.fn(),
  dbSetMemberClassroomToken: vi.fn(),
  dbGetHouseholdClassroomStatus: vi.fn(),
  dbGet: vi.fn(),
}));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler from './classroom-link';
import { resolveCallerMember, dbGetHouseholdMembersByHouseholdId, dbSetMemberClassroomToken, dbGet } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';
import { signGmailState, verifyGmailState } from './_crypto.js';

const members = [
  { id: 'p1', name: 'Parent', role: 'admin', household_id: 'h1' },
  { id: 'k1', name: 'Kid', role: 'child', household_id: 'h1' },
  { id: 'k2', name: 'Kid2', role: 'child', household_id: 'h1' },
  { id: 'pet', name: 'Rex', role: 'pet', household_id: 'h1' },
] as any;

const get = (qs: string) => new Request(`https://x.test/api/classroom-link?${qs}`, { headers: { authorization: 'Bearer t' } });
const post = (body: unknown) => new Request('https://x.test/api/classroom-link', {
  method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const as = (memberId: string, role: string) => vi.mocked(resolveCallerMember).mockResolvedValue({ memberId, role, householdId: 'h1' } as any);

beforeEach(() => {
  vi.resetAllMocks();
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid';
  process.env.GMAIL_STATE_SECRET = 'test-secret';
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true } as any);
  vi.mocked(dbGetHouseholdMembersByHouseholdId).mockResolvedValue(members);
});

describe('/api/classroom-link', () => {
  it('rejects unauthenticated callers', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(null as any);
    expect((await handler(get('action=status'))).status).toBe(401);
  });

  it('lets an admin read a child\'s grades but not a child read a sibling\'s', async () => {
    vi.mocked(dbGet).mockResolvedValue({ syncedAt: 1, grades: [] });
    as('p1', 'admin');
    expect((await handler(get('action=grades&memberId=k1'))).status).toBe(200);
    as('k1', 'child');
    expect((await handler(get('action=grades&memberId=k2'))).status).toBe(403);
    expect((await handler(get('action=grades&memberId=k1'))).status).toBe(200);
  });

  it('refuses to link a pet', async () => {
    as('p1', 'admin');
    expect((await handler(get('action=grades&memberId=pet'))).status).toBe(400);
  });

  it('disconnect clears the token for an admin, and is forbidden for a sibling', async () => {
    as('p1', 'admin');
    expect((await handler(post({ action: 'disconnect', memberId: 'k1' }))).status).toBe(200);
    expect(dbSetMemberClassroomToken).toHaveBeenCalledWith('k1', null, null);
    vi.mocked(dbSetMemberClassroomToken).mockClear();
    as('k1', 'child');
    expect((await handler(post({ action: 'disconnect', memberId: 'k2' }))).status).toBe(403);
    expect(dbSetMemberClassroomToken).not.toHaveBeenCalled();
  });

  it('start redirects to Google with the classroom scopes and a signed state', async () => {
    as('p1', 'admin');
    const res = await handler(get('action=start&token=t&memberId=k1'));
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.searchParams.get('scope')).toContain('classroom.student-submissions.me.readonly');
    expect(loc.searchParams.get('access_type')).toBe('offline');
    expect(await verifyGmailState(loc.searchParams.get('state')!, 'classroom')).toMatchObject({ memberId: 'k1', householdId: 'h1' });
  });

  it('a Gmail-flow state cannot complete the classroom callback (and vice versa)', async () => {
    const gmailState = encodeURIComponent(await signGmailState({ memberId: 'k1', householdId: 'h1' }));
    expect(await verifyGmailState(gmailState, 'classroom')).toBeNull();
    const cState = encodeURIComponent(await signGmailState({ memberId: 'k1', householdId: 'h1', purpose: 'classroom' }));
    expect(await verifyGmailState(cState)).toBeNull();
    const res = await handler(new Request(`https://x.test/api/classroom-link?action=callback&code=c&state=${gmailState}`));
    expect(res.headers.get('location')).toContain('classroom_oauth=error');
    expect(res.headers.get('location')).toContain('invalid_state');
  });
});
