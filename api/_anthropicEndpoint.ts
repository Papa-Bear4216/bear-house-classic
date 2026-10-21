/**
 * Where a Claude request actually goes. A key starting `vck_` is a Vercel AI Gateway
 * key (https://ai-gateway.vercel.sh/v1/messages, same slugs as OpenRouter). A
 * key that starts with `sk-or-` is an
 * OpenRouter key: the same Messages-API body is sent to OpenRouter's
 * Anthropic-compatible endpoint with Bearer auth and an OpenRouter model slug.
 * Any other key goes straight to api.anthropic.com as before.
 *
 * Call sites pass the key through unchanged, so the rest of the request
 * shape (tools, cache_control, streaming) is identical on both paths.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/messages';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/messages';

const OPENROUTER_MODELS: Record<string, string> = {
  'claude-haiku-4-5-20251001': 'anthropic/claude-haiku-4.5',
  'claude-sonnet-4-6': 'anthropic/claude-sonnet-4.6',
};

export function isGatewayKey(key: string): boolean {
  return key.startsWith('vck_');
}

export function isOpenRouterKey(key: string): boolean {
  return key.startsWith('sk-or-');
}

export function anthropicTarget(
  key: string,
  model: string,
): { url: string; headers: Record<string, string>; model: string } {
  if (isGatewayKey(key)) {
    return {
      url: GATEWAY_URL,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      model: OPENROUTER_MODELS[model] ?? (model.includes('/') ? model : `anthropic/${model}`),
    };
  }
  if (isOpenRouterKey(key)) {
    return {
      url: OPENROUTER_URL,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'anthropic-version': '2023-06-01',
        'HTTP-Referer': 'https://www.hotmessexpress.lol',
        'X-Title': 'FamilyOS',
      },
      model: OPENROUTER_MODELS[model] ?? (model.includes('/') ? model : `anthropic/${model}`),
    };
  }
  return {
    url: ANTHROPIC_URL,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    model,
  };
}
