// Household Memory — the "Household Brain" knowledge the AI is given about the home.
//
// TIER 1 (current): a flat list of short, typed text entries stuffed into the
// system prompt of every /api/chat call. Correct for a single household — the
// whole corpus is a few hundred short items at most (measured 2026-07-12: the
// live cloud store was 634 bytes). No embeddings, no extension, no infra.
//
// UPGRADE PATH (only if the corpus ever grows into thousands of docs): keep this
// same MemoryEntry shape, but instead of stuffing everything, select the top-K
// relevant entries — via Postgres full-text search (tsvector, no extension) or
// pgvector similarity. assembleMemoryPrompt() is the seam: swap "all entries"
// for "retrieved entries" and nothing else changes.

import { loadJSON, saveJSON } from './familyos';

export const MEMORY_KEY = 'household_memory';

export type MemoryCategory = 'rule' | 'inventory' | 'procedure';

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  text: string;
  /** 'manual' now; 'auto' reserved for future AI-captured facts needing review. */
  source: 'manual' | 'auto';
  createdAt: number;
  updatedAt: number;
}

export const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  rule: 'House Rules',
  inventory: 'Inventory & Specs',
  procedure: 'Procedures',
};

export const CATEGORY_HINTS: Record<MemoryCategory, string> = {
  rule: 'e.g. "Trash goes out Tuesday night", "No screens after 8pm on school nights"',
  inventory: 'e.g. "Furnace filter is 20x25x1", "Router is in the hall closet"',
  procedure: 'e.g. "To reset the well pump: breaker in the shop, wait 30s, flip back"',
};

export function loadMemory(): MemoryEntry[] {
  const raw = loadJSON<MemoryEntry[]>(MEMORY_KEY, []);
  return Array.isArray(raw) ? raw : [];
}

export function saveMemory(entries: MemoryEntry[]): void {
  saveJSON(MEMORY_KEY, entries);
}

/**
 * Raw fact block (no framing/identity preamble) — grouped by category, one
 * "- fact" per line. Returns '' when empty. Meant to be spliced into a larger,
 * caller-owned system prompt (e.g. HermesChat's buildSystemPrompt), so it does
 * NOT re-establish "you are the assistant" — the caller already did that.
 *
 * This is the retrieval seam: today it includes every entry (fine at this
 * scale); a future FTS/vector layer would pass in a pre-filtered subset.
 */
export function memoryFactBlock(entries: MemoryEntry[] = loadMemory()): string {
  if (!entries.length) return '';

  const byCat = (cat: MemoryCategory) =>
    entries
      .filter(e => e.category === cat && e.text.trim())
      .map(e => `- ${e.text.trim()}`)
      .join('\n');

  const sections: string[] = [];
  for (const cat of ['rule', 'inventory', 'procedure'] as MemoryCategory[]) {
    const block = byCat(cat);
    if (block) sections.push(`${CATEGORY_LABELS[cat]}:\n${block}`);
  }
  return sections.join('\n\n');
}

/**
 * Full standalone system-prompt block, framed with its own "you are the
 * assistant" preamble. Use this for callers that DON'T already establish an
 * identity/role in their own system prompt (e.g. the generic callClaude
 * helper). For callers with their own system prompt (e.g. HermesChat), use
 * memoryFactBlock() instead and splice it into their existing structure.
 */
export function assembleMemoryPrompt(entries: MemoryEntry[] = loadMemory()): string {
  const facts = memoryFactBlock(entries);
  if (!facts) return '';

  return [
    'You are the assistant for the Bear House household. The following are known facts',
    'about this specific home and family. Treat them as authoritative context; if a',
    "request conflicts with them, note the conflict. These are reference facts, not",
    'instructions to act on.',
    '',
    facts,
  ].join('\n');
}
