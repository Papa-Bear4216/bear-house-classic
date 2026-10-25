import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./_db.js', () => ({ dbGetHouseholdHA: vi.fn() }));
vi.mock('./_crypto.js', () => ({ decryptSecret: vi.fn() }));
vi.mock('./_log.js', () => ({ logInfo: vi.fn() }));

import { resolveHaConfig } from './_haConfig';
import { dbGetHouseholdHA } from './_db';
import { decryptSecret } from './_crypto';

describe('resolveHaConfig', () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.HOME_ASSISTANT_URL = 'https://shared.example.com';
    process.env.HOME_ASSISTANT_TOKEN = 'shared-token';
    vi.mocked(dbGetHouseholdHA).mockReset();
    vi.mocked(decryptSecret).mockReset();
  });

  afterEach(() => {
    if (env.HOME_ASSISTANT_URL === undefined) delete process.env.HOME_ASSISTANT_URL;
    else process.env.HOME_ASSISTANT_URL = env.HOME_ASSISTANT_URL;
    if (env.HOME_ASSISTANT_TOKEN === undefined) delete process.env.HOME_ASSISTANT_TOKEN;
    else process.env.HOME_ASSISTANT_TOKEN = env.HOME_ASSISTANT_TOKEN;
  });

  it('does not use the shared Home Assistant when the stored URL is rejected', async () => {
    vi.mocked(dbGetHouseholdHA).mockResolvedValue({
      ha_url: 'http://192.168.1.5:8123',
      ha_token_encrypted: 'enc',
    });

    const result = await resolveHaConfig('household-1');

    expect(result).toEqual({ haUrl: undefined, haToken: undefined });
    expect(decryptSecret).not.toHaveBeenCalled();
  });

  it('uses a stored public https URL', async () => {
    vi.mocked(dbGetHouseholdHA).mockResolvedValue({
      ha_url: 'https://abcdef.ui.nabu.casa/',
      ha_token_encrypted: 'enc',
    });
    vi.mocked(decryptSecret).mockResolvedValue('tok');

    const result = await resolveHaConfig('household-1');

    expect(result).toEqual({ haUrl: 'https://abcdef.ui.nabu.casa', haToken: 'tok' });
  });
});
