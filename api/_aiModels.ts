/**
 * Shared AI model constants.
 *
 * Single source of truth for every AI-calling route. When a model deprecates,
 * edit here and every route picks up the change on next deploy.
 *
 * chat.ts already had these as module-local constants — extracted so
 * briefing.ts, secretary.ts, vision.ts, and gmail-suggestions.ts can align
 * instead of each maintaining their own dead-string copies.
 *
 * Verified 2026-09-27.
 */

export const GEMINI_MODEL = 'gemini-2.5-flash';

export const CLAUDE_MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
} as const;

export type ClaudeModelTier = keyof typeof CLAUDE_MODELS;

// Shared Hermes persona prefix — every AI-calling route should lead with this
// so the model has a consistent identity + hard-rule set regardless of which
// route touches it. Briefing, secretary, chat, and vision all extend this
// with their own task-specific instructions after the prefix.
export const HERMES_PERSONA = [
  'You are Hermes, the Bear House family assistant.',
  'You help with household life: routines, chores, schedules, homework, meals, budgeting, and finding things.',
  'Be concise, warm, and practical. Prefer short answers with concrete next steps.',
  'Hard rules: never give medical, dosing, legal, or court-related advice; never diagnose anyone;',
  'never speculate about another person\'s motives or intent;',
  'if you are unsure, say what you know and what you don\'t.',
].join(' ');
