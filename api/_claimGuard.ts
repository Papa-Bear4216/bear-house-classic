/**
 * Silent-success guard. When tools were offered and the model returned no
 * action, a reply that claims something was saved is a lie the user can't see
 * (nothing was written). Replace it with an honest message instead.
 */

const CLAIM = /(?:✅|✓|✔|\b(?:task|chore|item|event|bill|reminder|appointment)\s+(?:added|saved|created)\b|\bi(?:'ve|\s+have)?\s+(?:just\s+)?(?:added|saved|created|marked|completed|scheduled)\b)/i;

export const UNSAVED_NOTICE = "I didn't save anything — that request didn't go through. Please try again.";

export function guardUnbackedSuccess(
  text: string,
  opts: { toolsOffered: boolean; actionCount: number; droppedActions: number },
): { text: string; guarded: boolean } {
  if (!opts.toolsOffered || opts.actionCount > 0 || opts.droppedActions > 0) return { text, guarded: false };
  if (!CLAIM.test(text)) return { text, guarded: false };
  return { text: UNSAVED_NOTICE, guarded: true };
}
