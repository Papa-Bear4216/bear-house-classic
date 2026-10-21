import { describe, it, expect } from 'vitest';
import { anthropicTarget, isOpenRouterKey } from './_anthropicEndpoint.js';

describe('anthropicTarget', () => {
  it('sends sk-ant keys straight to Anthropic with x-api-key', () => {
    const t = anthropicTarget('sk-ant-abc', 'claude-sonnet-4-6');
    expect(t.url).toBe('https://api.anthropic.com/v1/messages');
    expect(t.headers['x-api-key']).toBe('sk-ant-abc');
    expect(t.headers.Authorization).toBeUndefined();
    expect(t.model).toBe('claude-sonnet-4-6');
  });

  it('routes sk-or keys to OpenRouter with Bearer auth and a mapped slug', () => {
    const t = anthropicTarget('sk-or-v1-abc', 'claude-haiku-4-5-20251001');
    expect(t.url).toBe('https://openrouter.ai/api/v1/messages');
    expect(t.headers.Authorization).toBe('Bearer sk-or-v1-abc');
    expect(t.headers['x-api-key']).toBeUndefined();
    expect(t.model).toBe('anthropic/claude-haiku-4.5');
  });

  it('prefixes unknown models and leaves slugs alone', () => {
    expect(anthropicTarget('sk-or-x', 'claude-opus-9').model).toBe('anthropic/claude-opus-9');
    expect(anthropicTarget('sk-or-x', 'openai/gpt-5').model).toBe('openai/gpt-5');
  });

  it('detects OpenRouter keys', () => {
    expect(isOpenRouterKey('sk-or-v1-1')).toBe(true);
    expect(isOpenRouterKey('sk-ant-1')).toBe(false);
  });
});
