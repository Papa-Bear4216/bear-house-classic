import { auth } from './firebase';

let quotaExceededUntil = 0;

export async function generateFamilyAvatar(name: string, color: string): Promise<string | null> {
  if (Date.now() < quotaExceededUntil) return null;

  try {
    const user = auth.currentUser;
    if (!user) return null;
    const token = await user.getIdToken();

    const res = await fetch('/api/avatar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ name, color }),
    });

    if (res.status === 401) return null;
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
