export function activityTimestamp(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    const localDate = new Date(year, month - 1, day);
    return localDate.getFullYear() === year && localDate.getMonth() === month - 1 && localDate.getDate() === day ? localDate.getTime() : null;
  }
  const timestamp = /^\d{12,13}$/.test(text) ? Number(text) : Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : null;
}
