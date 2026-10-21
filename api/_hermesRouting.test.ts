import { describe, expect, it } from 'vitest';
import { isIdentityQuestion, resolveHermesModel } from './_hermesRouting.js';
import { CLAUDE_MODELS } from './_aiModels.js';

describe('Hermes model routing', () => {
  it('recognizes app identity and household roster questions', () => {
    expect(isIdentityQuestion('Do you have a floating icon?')).toBe(true);
    expect(isIdentityQuestion('Who is Lucy?')).toBe(true);
    expect(isIdentityQuestion('What is on the shopping list?')).toBe(false);
  });

  it('promotes explicit Haiku identity turns to Sonnet', () => {
    expect(resolveHermesModel('What can you do?', CLAUDE_MODELS.haiku, 'haiku')).toBe(CLAUDE_MODELS.sonnet);
  });

  it('preserves an explicit non-Haiku model and normal-turn model selection', () => {
    expect(resolveHermesModel('Who are you?', 'claude-opus-example', 'haiku')).toBe('claude-opus-example');
    expect(resolveHermesModel('What is for dinner?', CLAUDE_MODELS.haiku, 'sonnet')).toBe(CLAUDE_MODELS.haiku);
  });
});
