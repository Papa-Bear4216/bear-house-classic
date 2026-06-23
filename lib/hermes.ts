export interface HermesMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface FamilyContext {
  users?: unknown[];
  tasks?: unknown[];
  events?: unknown[];
  meals?: unknown[];
  shopping?: unknown[];
  preferences?: unknown;
  currentUser?: unknown;
  date?: string;
  budgetSummary?: string;
  usageMemory?: string;
  persistentMemory?: string[];
}

export async function askHermes(
  messages: HermesMessage[],
  context: FamilyContext = {},
  systemOverride?: string
): Promise<{ content: string; model: string }> {
  const { auth } = await import('./firebase');
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  const res = await fetch('/api/hermes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages, context, systemOverride }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Hermes API error ${res.status}`);
  }

  return res.json();
}
