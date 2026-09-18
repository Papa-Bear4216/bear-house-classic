const MAX_EXTERNAL_TEXT_LENGTH = 500;

/**
 * Strips prompt injection primitives, structural fences, and command verbs
 * from untrusted user/external strings before interpolating into LLM prompts.
 */
export function sanitizeExternalText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let t = raw.slice(0, MAX_EXTERNAL_TEXT_LENGTH);
  // collapse whitespace runs (defeats "\n\n\nSYSTEM:" framing)
  t = t.replace(/\s+/g, ' ').trim();
  // neutralize role/turn markers and common injection headers
  t = t.replace(/\b(system|assistant|user|human|tool)\s*:/gi, '$1 -');
  t = t.replace(/<\/?(system|instructions?|prompt|context)[^>]*>/gi, '');
  // strip markdown/code fences that can smuggle structure
  t = t.replace(/```+/g, '');
  // drop anything that looks like an imperative override to the model
  t = t.replace(/\b(ignore|disregard|forget|override)\b[^.]*\.?/gi, '');
  return t.trim();
}

/**
 * Wraps sanitized external text in XML-like semantic tags with explicit
 * instruction markers so the model treats it as data, not as directives.
 */
export function asUntrustedBlock(label: string, text: string): string {
  const clean = sanitizeExternalText(text);
  return [
    `<${label}>`,
    clean,
    `</${label}>`,
  ].join('\n');
}
