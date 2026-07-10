/**
 * /api/ha-cameras — pulls camera list + snapshots from Home Assistant via Nabu Casa remote UI.
 *
 * Requires a client-held token (like KEYS.geminiApiKey / KEYS.apiKey) — this route serves
 * live interior camera footage, so it must NOT be reachable anonymously. Set a token in
 * Settings on the frontend and it's sent as x-camera-token; distinct from WEBHOOK_TOKEN so
 * a leaked camera token can't be used to forge inbound HA webhook events.
 *
 * GET /api/ha-cameras                       -> list of camera entities
 * GET /api/ha-cameras?entity=camera.foo      -> single JPEG snapshot (base64 data URI)
 *
 * Env vars needed (set in Vercel):
 *   CAMERA_ACCESS_TOKEN    — any secret string you choose; enter the same value in Settings
 *   HOME_ASSISTANT_URL     — e.g. https://oop4xftlrecxeibolm4wyg37m5u2vdo7.ui.nabu.casa
 *   HOME_ASSISTANT_TOKEN   — HA long-lived access token (Settings -> your profile -> Security)
 */
export const config = { runtime: 'edge' };

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return j({ error: 'Method not allowed' }, 405);

  const CAMERA_ACCESS_TOKEN = process.env.CAMERA_ACCESS_TOKEN;
  const HA_URL = process.env.HOME_ASSISTANT_URL;
  const HA_TOKEN = process.env.HOME_ASSISTANT_TOKEN;

  const url = new URL(req.url);
  const clientToken = req.headers.get('x-camera-token') || url.searchParams.get('token');
  if (!CAMERA_ACCESS_TOKEN || clientToken !== CAMERA_ACCESS_TOKEN) return j({ error: 'Unauthorized' }, 401);
  if (!HA_URL || !HA_TOKEN) return j({ error: 'Home Assistant not configured (HOME_ASSISTANT_URL / HOME_ASSISTANT_TOKEN missing)' }, 500);

  const haHeaders = { Authorization: `Bearer ${HA_TOKEN}`, 'Content-Type': 'application/json' };
  const entity = url.searchParams.get('entity');

  try {
    if (entity) {
      const res = await fetch(`${HA_URL}/api/camera_proxy/${encodeURIComponent(entity)}`, { headers: haHeaders });
      if (!res.ok) return j({ error: `HA snapshot error: ${res.status}` }, res.status);
      const buf = await res.arrayBuffer();
      const b64 = bufToBase64(buf);
      return j({ entity, image: `data:image/jpeg;base64,${b64}` });
    }

    const res = await fetch(`${HA_URL}/api/states`, { headers: haHeaders });
    if (!res.ok) return j({ error: `HA states error: ${res.status}` }, res.status);
    const states = await res.json() as any[];
    const cameras = states
      .filter(s => s.entity_id?.startsWith('camera.'))
      .map(s => ({ entityId: s.entity_id, name: s.attributes?.friendly_name || s.entity_id, state: s.state }));

    return j({ cameras });
  } catch (e: any) {
    return j({ error: e?.message || 'Home Assistant request failed' }, 500);
  }
}
