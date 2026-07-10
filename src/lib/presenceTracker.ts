/**
 * Presence tracker — detects when user has been away > 7 days
 * or geolocation shows > 200 miles from home for > 7 days.
 * Used to trigger an automatic "welcome back" briefing.
 */

const LAST_SEEN_KEY   = 'hermes_last_seen';
const LOCATION_KEY    = 'hermes_location_log';
const BRIEFED_AT_KEY  = 'hermes_last_autobrief';
const ONE_WEEK_MS     = 7 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS      = 24 * 60 * 60 * 1000;

export interface LocationEntry { lat: number; lon: number; ts: number; }

// ── Recording ──────────────────────────────────────────────────────────────

/** Call every time the app mounts (updates the "last seen" timestamp). */
export function recordVisit() {
  localStorage.setItem(LAST_SEEN_KEY, Date.now().toString());
}

/** Call with browser geolocation when available. */
export function recordLocation(lat: number, lon: number) {
  const log: LocationEntry[] = JSON.parse(localStorage.getItem(LOCATION_KEY) || '[]');
  // Only add entry if it's been > 30 min since last one (avoid spam)
  const last = log[log.length - 1];
  if (last && Date.now() - last.ts < 30 * 60 * 1000) return;
  log.push({ lat, lon, ts: Date.now() });
  localStorage.setItem(LOCATION_KEY, JSON.stringify(log.slice(-200)));
}

/** Mark that we just showed the auto-brief so we don't repeat it. */
export function markBriefed() {
  localStorage.setItem(BRIEFED_AT_KEY, Date.now().toString());
}

// ── Detection ──────────────────────────────────────────────────────────────

/** Haversine distance between two lat/lon points, returns miles. */
export function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const toRad = (v: number) => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface AutoBriefResult {
  should: boolean;
  days: number;
  reason: 'offline' | 'location' | 'none';
  miles?: number;
}

/**
 * Returns whether we should show an auto welcome-back brief.
 * Will not re-trigger within 24 hours of the last auto-brief.
 */
export function checkAutobrief(homeLat = 30.45, homeLon = -91.15): AutoBriefResult {
  // Don't re-brief within 24h
  const lastBriefed = parseInt(localStorage.getItem(BRIEFED_AT_KEY) || '0');
  if (Date.now() - lastBriefed < ONE_DAY_MS) return { should: false, days: 0, reason: 'none' };

  const lastSeen = parseInt(localStorage.getItem(LAST_SEEN_KEY) || '0');
  const days = lastSeen ? Math.floor((Date.now() - lastSeen) / ONE_DAY_MS) : 0;

  // Offline for 7+ days
  if (days >= 7) return { should: true, days, reason: 'offline' };

  // Location away from home for 7+ days
  const log: LocationEntry[] = JSON.parse(localStorage.getItem(LOCATION_KEY) || '[]');
  if (log.length >= 2) {
    const awayEntries = log.filter(e => distanceMiles(e.lat, e.lon, homeLat, homeLon) > 200);
    if (awayEntries.length >= 2) {
      const oldest = Math.min(...awayEntries.map(e => e.ts));
      const maxMiles = Math.max(...awayEntries.map(e => distanceMiles(e.lat, e.lon, homeLat, homeLon)));
      if (Date.now() - oldest > ONE_WEEK_MS) {
        const approxDays = Math.floor((Date.now() - oldest) / ONE_DAY_MS);
        return { should: true, days: approxDays, reason: 'location', miles: Math.round(maxMiles) };
      }
    }
  }

  return { should: false, days, reason: 'none' };
}
