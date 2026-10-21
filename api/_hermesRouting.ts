import { CLAUDE_MODELS } from './_aiModels.js';

const IDENTITY_RE = /\b(what can you do|who are you|your (abilities|tools|limits|memory)|do you (have|remember)|where (are you|is .* button)|how do(es)? (this app|you) work|floating (icon|button)|what (is|does) this app|who is [\w'-]+)\b/i;

export function isIdentityQuestion(text: string): boolean {
  return IDENTITY_RE.test(text || '');
}

export function resolveHermesModel(text: string, model: string | undefined, tier: keyof typeof CLAUDE_MODELS): string {
  const selected = model || CLAUDE_MODELS[tier] || CLAUDE_MODELS.haiku;
  if (!isIdentityQuestion(text)) return selected;
  // Respect explicit higher tiers; promote Haiku/default identity turns to Sonnet.
  if (selected === CLAUDE_MODELS.sonnet) return selected;
  if (selected === CLAUDE_MODELS.haiku || !model) return CLAUDE_MODELS.sonnet;
  return selected;
}
