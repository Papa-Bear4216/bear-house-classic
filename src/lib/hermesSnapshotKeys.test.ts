import { describe, expect, it } from 'vitest';
import { KEYS } from './familyos';
import { HERMES_SNAPSHOT_KEYS } from '../../api/_familyKeys';

describe('Hermes snapshot storage keys', () => {
  it('matches the client household storage keys', () => {
    expect(HERMES_SNAPSHOT_KEYS).toEqual({
      tasks: KEYS.tasks,
      shopping: 'familyos_shopping',
      appointments: 'familyos_appointments',
      promises: KEYS.promises,
    });
  });
});
