// src/lib/hermesNeutral.ts
// Hermes Neutral Co-Parent Mode: BIFF (Brief, Informative, Friendly, Firm)
// Tone Analysis, Conflict De-escalation, and Logistics Mediation
import { z } from 'zod';
import { apiUrl } from './api';
import { getAccessToken } from './householdAuth';

export interface ToneAnalysis {
  score: 'calm' | 'tense' | 'hostile';
  confidence: number;
  detectedFlags: string[];
  biffTips: string[];
  isSafeToSend: boolean;
}

export interface DeescalationResult {
  original: string;
  deescalated: string;
  changesMade: string[];
  toneBefore: 'calm' | 'tense' | 'hostile';
  toneAfter: 'calm' | 'tense' | 'hostile';
  isFallback: boolean;
}

const RewriteSchema = z.object({
  deescalated: z.string().trim().min(1),
  changesMade: z.union([z.array(z.string()), z.string().transform((s) => [s])]).default([]),
});

// Conflict triggers commonly found in high-conflict co-parenting texts
const ACCUSATORY_PATTERNS: { regex: RegExp; label: string; tip: string }[] = [
  {
    regex: /\byou (always|never|constantly)\b/i,
    label: 'Absolute generalizations ("you always / never")',
    tip: 'Replace absolutes with specific, current logistics (e.g. "For tomorrow’s drop-off...")',
  },
  {
    regex: /\b(your fault|because of you|blame you)\b/i,
    label: 'Direct blaming language',
    tip: 'Focus on next steps for the kids rather than assessing blame.',
  },
  {
    regex: /\b(irresponsible|pathetic|selfish|lazy|liar|crazy|incompetent|narcissist)\b/i,
    label: 'Derogatory / character attacks',
    tip: 'Remove character evaluations; keep the focus purely on the schedule or need.',
  },
  {
    regex: /\b(as usual|like last time|typical of you)\b/i,
    label: 'Past grievance scorekeeping',
    tip: 'Stick strictly to the immediate event or date.',
  },
  {
    regex: /\b(lawyer|court|judge|custody agreement|violation)\b/i,
    label: 'Legalistic threats in daily communication',
    tip: 'State logistics firmly without threatening legal action in standard communications.',
  },
];

/**
 * Analyzes co-parent message draft for potential conflict, hostility, or high-friction phrasing.
 */
export function analyzeCoParentTone(text: string): ToneAnalysis {
  const clean = (text || '').trim();
  if (!clean) {
    return {
      score: 'calm',
      confidence: 1.0,
      detectedFlags: [],
      biffTips: [],
      isSafeToSend: true,
    };
  }

  const detectedFlags: string[] = [];
  const biffTips: string[] = [];

  // Check accusatory pattern triggers
  for (const item of ACCUSATORY_PATTERNS) {
    if (item.regex.test(clean)) {
      detectedFlags.push(item.label);
      biffTips.push(item.tip);
    }
  }

  // Check aggressive punctuation (e.g. "???" or "!!!")
  if (/[!?]{2,}/.test(clean)) {
    detectedFlags.push('Multiple exclamation or question marks');
    biffTips.push('Reduce punctuation to a single period or question mark to maintain a calm tone.');
  }

  // Check shouting (multiple consecutive capitalized words)
  const capsWords = clean.match(/\b[A-Z]{3,}\b/g);
  if (capsWords && capsWords.length >= 2) {
    detectedFlags.push('Consecutive ALL-CAPS words (reads as shouting)');
    biffTips.push('Use standard sentence case to avoid conveying anger.');
  }

  // Score determination
  let score: 'calm' | 'tense' | 'hostile' = 'calm';
  if (detectedFlags.length >= 2 || detectedFlags.some((f) => f.includes('Derogatory') || f.includes('Legalistic'))) {
    score = 'hostile';
  } else if (detectedFlags.length === 1) {
    score = 'tense';
  }

  return {
    score,
    confidence: detectedFlags.length > 0 ? 0.9 : 1.0,
    detectedFlags,
    biffTips,
    isSafeToSend: score === 'calm',
  };
}

/**
 * Fast client-side / offline text de-escalator using BIFF heuristics.
 */
export function offlineDeescalate(text: string): string {
  let softened = text.trim();

  // Normalize shouting
  softened = softened.replace(/\b[A-Z]{3,}\b/g, (match) => {
    return match.charAt(0) + match.slice(1).toLowerCase();
  });

  // Normalize excessive punctuation
  softened = softened.replace(/!{2,}/g, '.');
  softened = softened.replace(/\?{2,}/g, '?');

  // Replace absolutes with softer logistical phrases
  softened = softened.replace(/\byou always\b/gi, 'often');
  softened = softened.replace(/\byou never\b/gi, 'it would help if you could');
  softened = softened.replace(/\byour fault\b/gi, 'an issue that came up');
  softened = softened.replace(/\bas usual\b/gi, '');

  return softened.trim();
}

/**
 * Uses Hermes LLM to de-escalate a co-parenting message into a polished BIFF communication.
 */
export async function deescalateWithHermes(
  originalText: string,
  contextNote?: string
): Promise<DeescalationResult> {
  const analysis = analyzeCoParentTone(originalText);
  const prompt = `Please rewrite this co-parent message using the BIFF standard (Brief, Informative, Friendly, Firm).
Strip all emotional accusations, blame, or sarcasm, and focus purely on the kids and logistics.

Original message:
"${originalText}"
${contextNote ? `Additional context: ${contextNote}` : ''}

Respond with JSON in this exact shape:
{
  "deescalated": "the rewritten message",
  "changesMade": ["change 1", "change 2"]
}`;

  try {
    const token = await getAccessToken();
    const res = await fetch(apiUrl('/api/chat'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        prompt,
        format: 'json',
        neutralMode: true,
        outputSchema: JSON.stringify({
          deescalated: 'string',
          changesMade: ['string'],
        }),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const rawText = typeof data.text === 'string' ? data.text : (typeof data.response === 'string' ? data.response : '');
      const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      let candidate: any = null;
      try {
        candidate = JSON.parse(cleanJson);
      } catch {
        candidate = null;
      }

      if (candidate) {
        const validated = RewriteSchema.safeParse(candidate);
        if (validated.success) {
          const deescalatedText = validated.data.deescalated;
          const afterAnalysis = analyzeCoParentTone(deescalatedText);
          return {
            original: originalText,
            deescalated: deescalatedText,
            changesMade: validated.data.changesMade.length > 0 ? validated.data.changesMade : ['Rewritten for BIFF clarity and de-escalation'],
            toneBefore: analysis.score,
            toneAfter: afterAnalysis.score,
            isFallback: false,
          };
        }
      }
    }
  } catch {
    // Non-fatal: offline fallback
  }

  // Offline fallback
  const fallbackText = offlineDeescalate(originalText);
  const fallbackTone = analyzeCoParentTone(fallbackText);
  return {
    original: originalText,
    deescalated: fallbackText,
    changesMade: ['Removed aggressive punctuation and softened absolute phrasing (offline fallback)'],
    toneBefore: analysis.score,
    toneAfter: fallbackTone.score,
    isFallback: true,
  };
}
