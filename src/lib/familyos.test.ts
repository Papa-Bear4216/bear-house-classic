import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./householdAuth', () => ({ authedFetch: vi.fn(), getAccessToken: vi.fn() }));

import { voiceTriggersAdd } from './familyos';
import { authedFetch, getAccessToken } from './householdAuth';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAccessToken).mockResolvedValue('test-token');
});

describe('voiceTriggersAdd', () => {
  it('returns the created trigger on success instead of throwing on an out-of-scope reference', async () => {
    // Regression guard: `data` was previously declared inside the !res.ok
    // branch and referenced again on the success path, throwing a
    // ReferenceError that the outer catch converted into a false failure —
    // every successful trigger creation looked like it had failed.
    vi.mocked(authedFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ trigger: { id: 't1', trigger: 'lights off', deviceId: 'd1', action: 'turn_off' } }),
    } as Response);

    const result = await voiceTriggersAdd('lights off', 'd1', 'turn_off');

    expect(result.ok).toBe(true);
    expect(result.trigger).toEqual({ id: 't1', trigger: 'lights off', deviceId: 'd1', action: 'turn_off' });
  });

  it('returns the server error message on failure', async () => {
    vi.mocked(authedFetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Trigger already exists' }),
    } as Response);

    const result = await voiceTriggersAdd('lights off', 'd1', 'turn_off');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Trigger already exists');
  });

  it('returns a network-error message when the fetch itself throws', async () => {
    vi.mocked(authedFetch).mockRejectedValue(new Error('offline'));

    const result = await voiceTriggersAdd('lights off', 'd1', 'turn_off');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('offline');
  });
});
