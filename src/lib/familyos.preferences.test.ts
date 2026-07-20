import { describe, it, expect } from 'vitest';
import {
  emptyMemberPreferences,
  buildFoodPreferencePrompt,
  buildHobbyPromptFragment,
  preferencesKey,
  type MemberPreferences,
} from './familyos';

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
