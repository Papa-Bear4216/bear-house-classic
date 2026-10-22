import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));
vi.mock('./_db.js', () => ({ resolveCallerMember: vi.fn(), dbSetVoiceUnlocked: vi.fn() }));

import handler from './voice-unlock';
import { checkRateLimit } from './_rateLimit.js';
import { resolveCallerMember, dbSetVoiceUnlocked } from './_db.js';

const req = (body: unknown, auth = 'Bearer valid') =>
  new Request('https://example.com/api/voice-unlock', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: auth },
    body: JSON.stringify(body),
  });
const member = (role: string) => ({ householdId: 'h1', memberId: 'm1', role, canControlDevices: false });

beforeEach(() => {
  vi.resetAllMocks();
  process.env.VOICE_UNLOCK_CODES = '123456, 654321';
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(dbSetVoiceUnlocked).mockResolvedValue(undefined as never);
});

describe('POST /api/voice-unlock', () => {
  it('401 without a resolvable caller', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(null);
    expect((await handler(req({ code: '123456' }))).status).toBe(401);
  });

  it.each(['child', 'pet'])('403 for role %s, and never unlocks', async (role) => {
    vi.mocked(resolveCallerMember).mockResolvedValue(member(role));
    expect((await handler(req({ code: '123456' }))).status).toBe(403);
    expect(dbSetVoiceUnlocked).not.toHaveBeenCalled();
  });

  it.each(['admin', 'superadmin'])('unlocks for role %s with a valid code', async (role) => {
    vi.mocked(resolveCallerMember).mockResolvedValue(member(role));
    const res = await handler(req({ code: '654321' }));
    expect(res.status).toBe(200);
    expect(dbSetVoiceUnlocked).toHaveBeenCalledWith('h1');
  });

  it('400 for a wrong code', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(member('admin'));
    expect((await handler(req({ code: '111111' }))).status).toBe(400);
    expect(dbSetVoiceUnlocked).not.toHaveBeenCalled();
  });
});
