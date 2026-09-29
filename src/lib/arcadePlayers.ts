// Who may be picked as the arcade "player" (whose stars, daily cap and high
// scores are used). Children play as themselves only; adults can also pick a
// child. Pets never play, and a child can never take an adult's profile.
type Player = { id: string; role: string };

export function arcadePlayers<T extends Player>(
  members: T[],
  currentUser: T | null | undefined,
  currentRole: string | null | undefined,
): T[] {
  const isAdult = currentRole === 'admin' || currentRole === 'superadmin';
  if (!isAdult) {
    return currentUser && currentUser.role !== 'pet' ? [currentUser] : [];
  }
  return members.filter((m) => m.role !== 'pet');
}
