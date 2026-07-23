import { describe, it, expect, beforeEach } from 'vitest';
import {
  emptyMemberPreferences,
  buildFoodPreferencePrompt,
  buildHobbyPromptFragment,
  preferencesKey,
  loadMemberPreferences,
  type MemberPreferences,
} from './familyos';

// vitest.config.ts runs this suite under environment: 'node', which has no
// localStorage global — loadJSON/saveJSON in familyos.ts read/write it
// directly, so a minimal in-memory polyfill is needed for these tests to
// exercise real persistence rather than only pure-function logic.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string) { this.store.set(key, value); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
(globalThis as any).localStorage = new MemoryStorage();

describe('preferencesKey', () => {
  it('namespaces the family_data key by member id', () => {
    expect(preferencesKey('abc-123')).toBe('familyos_preferences_abc-123');
  });
});

describe('emptyMemberPreferences', () => {
  it('returns a fully-initialized empty profile for a given member', () => {
    const prefs = emptyMemberPreferences('member-1');
    expect(prefs.memberId).toBe('member-1');
    expect(prefs.food.likes).toEqual([]);
    expect(prefs.food.dislikes).toEqual([]);
    expect(prefs.food.allergies).toEqual([]);
    expect(prefs.food.diet).toEqual([]);
    expect(prefs.food.otherNotes).toBe('');
    expect(prefs.hobbies.selected).toEqual([]);
    expect(prefs.entertainment.selected).toEqual([]);
    expect(prefs.healthNotes.selected).toEqual([]);
    expect(prefs.coreNav).toEqual(['household', 'family', 'rewards']);
  });
});

describe('loadMemberPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns full defaults, including coreNav, when nothing is stored', () => {
    const prefs = loadMemberPreferences('member-1');
    expect(prefs.coreNav).toEqual(['household', 'family', 'rewards']);
  });

  it('backfills missing fields (e.g. coreNav) on a preferences object saved before that field existed', () => {
    // Simulates a real localStorage record written before `coreNav` was added
    // to MemberPreferences — loadJSON returns stored data verbatim, so
    // without a merge this object would come back with `coreNav: undefined`,
    // crashing any caller that assumes it's always an array (e.g. AppLayout's
    // `prefs.coreNav.filter(...)`).
    const legacyStored = {
      memberId: 'member-1',
      food: { likes: ['Pizza'], dislikes: [], allergies: [], diet: [], otherNotes: '' },
      hobbies: { selected: [], otherNotes: '' },
      entertainment: { selected: [], otherNotes: '' },
      healthNotes: { selected: [], otherNotes: '' },
      updatedAt: 12345,
    };
    localStorage.setItem(preferencesKey('member-1'), JSON.stringify(legacyStored));

    const prefs = loadMemberPreferences('member-1');
    expect(prefs.coreNav).toEqual(['household', 'family', 'rewards']);
    expect(prefs.food.likes).toEqual(['Pizza']); // real stored data is preserved, not clobbered
    expect(prefs.updatedAt).toBe(12345);
  });

  it('preserves a stored coreNav rather than overwriting it with the default', () => {
    const stored: MemberPreferences = { ...emptyMemberPreferences('member-1'), coreNav: ['kids', 'health', 'finance'] };
    localStorage.setItem(preferencesKey('member-1'), JSON.stringify(stored));

    const prefs = loadMemberPreferences('member-1');
    expect(prefs.coreNav).toEqual(['kids', 'health', 'finance']);
  });
});

describe('buildFoodPreferencePrompt', () => {
  it('returns an empty string when no food preferences are set', () => {
    const prefs = emptyMemberPreferences('m1');
    expect(buildFoodPreferencePrompt(prefs)).toBe('');
  });

  it('includes dislikes, allergies, diet, and likes when set', () => {
    const prefs: MemberPreferences = {
      ...emptyMemberPreferences('m1'),
      food: {
        likes: ['Sweet'],
        dislikes: ['Mushrooms', 'Cilantro'],
        allergies: ['Peanuts'],
        diet: ['Vegetarian'],
        otherNotes: 'No red food dye',
      },
    };
    const prompt = buildFoodPreferencePrompt(prefs);
    expect(prompt).toContain('Vegetarian');
    expect(prompt).toContain('Peanuts');
    expect(prompt).toContain('Mushrooms');
    expect(prompt).toContain('Cilantro');
    expect(prompt).toContain('Sweet');
    expect(prompt).toContain('No red food dye');
  });

  it('omits empty categories rather than printing empty lists', () => {
    const prefs: MemberPreferences = {
      ...emptyMemberPreferences('m1'),
      food: { likes: [], dislikes: ['Seafood'], allergies: [], diet: [], otherNotes: '' },
    };
    const prompt = buildFoodPreferencePrompt(prefs);
    expect(prompt).toContain('Seafood');
    expect(prompt).not.toMatch(/Diet:/);
    expect(prompt).not.toMatch(/Allergies:/);
    expect(prompt).not.toMatch(/Likes:/);
  });
});

describe('buildHobbyPromptFragment', () => {
  it('returns an empty string when no hobbies are selected', () => {
    const prefs = emptyMemberPreferences('m1');
    expect(buildHobbyPromptFragment(prefs)).toBe('');
  });

  it('lists selected hobbies when present', () => {
    const prefs: MemberPreferences = {
      ...emptyMemberPreferences('m1'),
      hobbies: { selected: ['Gaming', 'Reading'], otherNotes: '' },
    };
    const fragment = buildHobbyPromptFragment(prefs);
    expect(fragment).toContain('Gaming');
    expect(fragment).toContain('Reading');
  });

  it('includes otherNotes hobbies text when set, even with no checked options', () => {
    const prefs: MemberPreferences = {
      ...emptyMemberPreferences('m1'),
      hobbies: { selected: [], otherNotes: 'competitive chess' },
    };
    expect(buildHobbyPromptFragment(prefs)).toContain('competitive chess');
  });
});
