export async function sendNotification(opts: {
  uid: string;
  title: string;
  body?: string;
  url?: string;
  data?: Record<string, string>;
}) {
  try {
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(opts),
    });
  } catch {
    // Non-critical — notifications are best-effort
  }
}

export async function broadcastNotification(opts: {
  uids: string[];
  title: string;
  body?: string;
  url?: string;
  data?: Record<string, string>;
}) {
  try {
    await fetch('/api/notify', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(opts),
    });
  } catch {}
}
