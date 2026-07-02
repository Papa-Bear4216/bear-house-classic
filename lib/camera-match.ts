import type { WyzeCamera } from '@/hooks/use-wyze-cameras';

const STOPWORDS = new Set(['room', 'the', 'and', 'area', 'cam', 'camera']);

function slugWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

// Guesses which Wyze camera belongs to a room by matching words in the room
// name against each camera's friendly name and entity id.
export function suggestCameraForRoom(roomName: string, cameras: WyzeCamera[]): WyzeCamera | null {
  const roomWords = slugWords(roomName);
  if (roomWords.length === 0) return null;

  let best: WyzeCamera | null = null;
  let bestScore = 0;
  for (const camera of cameras) {
    const haystack = slugWords(`${camera.name} ${camera.entityId}`);
    const score = roomWords.filter(w => haystack.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = camera;
    }
  }
  return bestScore > 0 ? best : null;
}
