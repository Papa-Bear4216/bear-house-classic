let quotaExceededUntil = 0;

export async function generateFamilyAvatar(name: string, color: string): Promise<string | null> {
  if (Date.now() < quotaExceededUntil) return null;

  try {
    const res = await fetch('/api/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    });
    if (res.status === 429) {
      quotaExceededUntil = Date.now() + 30 * 60 * 1000;
      return null;
    }
    if (!res.ok) return null;
    const data = await res.json();
    return data.avatarUrl ?? null;
  } catch {
    return null;
  }
}
