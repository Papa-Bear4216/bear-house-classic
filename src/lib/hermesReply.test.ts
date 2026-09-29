import { describe, it, expect } from 'vitest';
import { parseHermesReply } from './hermesReply';

describe('parseHermesReply', () => {
  it('parses plain JSON', () => {
    expect(parseHermesReply('{"text":"Hi","actions":[{"type":"addTask"}]}')).toEqual({ text: 'Hi', actions: [{ type: 'addTask' }] });
  });

  it('parses fenced JSON', () => {
    expect(parseHermesReply('```json\n{"text":"Hi","actions":[]}\n```').text).toBe('Hi');
  });

  it('parses JSON with prose before and after', () => {
    const r = parseHermesReply('Sure! Here you go:\n{"text":"Done {really}","actions":[]}\nHope that helps.');
    expect(r.text).toBe('Done {really}');
  });

  it('salvages text from a reply cut off by the token cap, dropping the broken actions', () => {
    const r = parseHermesReply('{"text":"Planned dinner: tacos.","actions":[{"type":"setMealPlan","params":{"day":"Mon","steps":["Brown the be');
    expect(r.text).toBe('Planned dinner: tacos.');
    expect(r.actions).toEqual([]);
  });

  it('salvages text cut off inside the text field', () => {
    expect(parseHermesReply('{"text":"Here is a long answer that').text).toBe('Here is a long answer that');
  });

  it('never shows raw JSON when there is no text field', () => {
    const r = parseHermesReply('{"actions":[]}');
    expect(r.text).not.toContain('{');
    expect(r.actions).toEqual([]);
  });

  it('unwraps a double-encoded reply (Triad)', () => {
    const inner = JSON.stringify({ text: '[Triad Engine: DOCTOR]\nok', actions: [] });
    expect(parseHermesReply(JSON.stringify(inner)).text).toContain('Triad Engine');
  });

  it('passes plain text through', () => {
    expect(parseHermesReply('Just words.')).toEqual({ text: 'Just words.', actions: [] });
  });

  it('decodes escaped newlines and quotes', () => {
    expect(parseHermesReply('{"text":"Line1\\nSay \\"hi\\"","actions":[]}').text).toBe('Line1\nSay "hi"');
  });
});
