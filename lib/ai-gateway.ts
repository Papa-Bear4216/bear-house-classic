// Single entry point for all AI calls — routes through the OpenRouter gateway (BYOK).
// Set AI_GATEWAY_KEY (an OpenRouter API key) in Vercel env vars (Project Settings → Environment Variables).
// Model IDs must be OpenRouter slugs, i.e. `provider/model-version` (e.g. `google/gemini-2.0-flash-001`).

const GATEWAY = 'https://openrouter.ai/api/v1';

function key(): string {
  const k = process.env.AI_GATEWAY_KEY;
  if (!k) throw new Error('AI_GATEWAY_KEY is not configured');
  return k;
}

export type TextPart = { type: 'text'; text: string };
export type ImagePart = { type: 'image_url'; image_url: { url: string } };
export type ContentPart = TextPart | ImagePart;

export type GatewayMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
};

// OpenRouter unified reasoning controls. For hybrid reasoning models (e.g. Hermes 4,
// Gemini 2.5) `{ enabled: false }` keeps the model from spending the token budget on
// reasoning, which otherwise leaves `message.content` empty on tight `max_tokens`.
export interface ReasoningOptions {
  enabled?: boolean;
  effort?: 'low' | 'medium' | 'high';
  max_tokens?: number;
  exclude?: boolean;
}

export interface ChatOptions {
  model: string;
  messages: GatewayMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  reasoning?: ReasoningOptions;
}

export async function gatewayChat(opts: ChatOptions): Promise<string> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 2048,
  };

  if (opts.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  if (opts.reasoning) {
    body.reasoning = opts.reasoning;
  }

  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key()}`,
      },
      body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI Gateway ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (content == null) throw new Error('AI Gateway returned empty content');
  return content as string;
}

// Extracts valid JSON from a model response, tolerating markdown code fences.
export function extractJson(raw: string): unknown {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(stripped);
}

// Convenience: build an image+text content part for vision requests.
export function visionContent(base64DataUrl: string, prompt: string): ContentPart[] {
  return [
    { type: 'image_url', image_url: { url: base64DataUrl } },
    { type: 'text', text: prompt },
  ];
}
