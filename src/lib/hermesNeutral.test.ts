import { describe, it, expect, vi } from 'vitest';
import {
  analyzeCoParentTone,
  offlineDeescalate,
  deescalateWithHermes,
} from './hermesNeutral';

describe('Hermes Neutral Co-Parent Tone Analyzer', () => {
  it('identifies calm, logistical messages as safe to send', () => {
    const text = 'Hi, just confirming Maya will be ready for pickup at 4:30 PM today after soccer practice.';
    const analysis = analyzeCoParentTone(text);

    expect(analysis.score).toBe('calm');
    expect(analysis.isSafeToSend).toBe(true);
    expect(analysis.detectedFlags).toHaveLength(0);
  });

  it('detects accusatory absolutes and flags them with BIFF recommendations', () => {
    const text = 'You never remember to pack Leo’s inhaler and you always make us late!';
    const analysis = analyzeCoParentTone(text);

    expect(analysis.score).toMatch(/tense|hostile/);
    expect(analysis.isSafeToSend).toBe(false);
    expect(analysis.detectedFlags.some((f) => f.includes('always / never'))).toBe(true);
    expect(analysis.biffTips.length).toBeGreaterThan(0);
  });

  it('detects hostile personal attacks and legalistic threats', () => {
    const text = 'You are completely incompetent and selfish. I am taking this to the judge in court.';
    const analysis = analyzeCoParentTone(text);

    expect(analysis.score).toBe('hostile');
    expect(analysis.isSafeToSend).toBe(false);
    expect(analysis.detectedFlags.some((f) => f.includes('Derogatory') || f.includes('Legalistic'))).toBe(true);
  });

  it('detects aggressive punctuation and shouting', () => {
    const text = 'WHERE ARE HIS SHOES??? WHY DID YOU NOT SEND THEM???';
    const analysis = analyzeCoParentTone(text);

    expect(analysis.isSafeToSend).toBe(false);
    expect(analysis.detectedFlags.some((f) => f.includes('exclamation or question marks'))).toBe(true);
    expect(analysis.detectedFlags.some((f) => f.includes('ALL-CAPS'))).toBe(true);
  });
});

describe('Hermes Neutral De-escalation Engine', () => {
  it('softens aggressive punctuation and absolutes in offline fallback', () => {
    const text = 'YOU ALWAYS FORGET his backpack and it is YOUR FAULT!!!';
    const softened = offlineDeescalate(text);

    expect(softened).not.toContain('!!!');
    expect(softened).not.toContain('YOU ALWAYS');
    expect(softened).not.toContain('YOUR FAULT');
  });

  it('deescalateWithHermes falls back gracefully when API is offline', async () => {
    // Mock fetch to simulate offline / network error
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')));

    const original = 'You never tell me when doctor appointments are scheduled!';
    const result = await deescalateWithHermes(original);

    expect(result.original).toBe(original);
    expect(result.deescalated).toBeDefined();
    expect(result.changesMade.length).toBeGreaterThan(0);
    expect(result.toneBefore).toMatch(/tense|hostile/);
    expect(result.isFallback).toBe(true);

    vi.unstubAllGlobals();
  });

  it('accurately preserves hostile toneAfter when offline heuristic cannot remove derogatory attacks', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')));

    const original = 'You are completely selfish and incompetent!';
    const result = await deescalateWithHermes(original);

    expect(result.isFallback).toBe(true);
    // Because offlineDeescalate does not silently erase derogatory words, toneAfter must reflect the remaining hostility
    expect(result.toneAfter).toBe('hostile');

    vi.unstubAllGlobals();
  });

  it('handles valid schema JSON responses from LLM', async () => {
    const mockResponse = {
      text: JSON.stringify({
        deescalated: 'Could you confirm Maya’s pickup time for today?',
        changesMade: ['Removed accusatory language', 'Clarified logistics'],
      }),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })
    );

    const result = await deescalateWithHermes('Why are you always late picking up Maya???');
    expect(result.isFallback).toBe(false);
    expect(result.deescalated).toBe('Could you confirm Maya’s pickup time for today?');
    expect(result.toneAfter).toBe('calm');
    expect(result.changesMade).toHaveLength(2);

    vi.unstubAllGlobals();
  });

  it('recovers gracefully from malformed model responses', async () => {
    const mockResponse = {
      text: 'Here is your rewrite: Not valid JSON at all!',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })
    );

    const result = await deescalateWithHermes('You never listen to me!');
    expect(result.isFallback).toBe(true);
    expect(result.deescalated).toContain('it would help if you could');

    vi.unstubAllGlobals();
  });
});
