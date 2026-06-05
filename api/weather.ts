export const config = { runtime: 'edge' };

/**
 * /api/weather
 * Free weather from National Weather Service — no API key required.
 * Caches in Supabase for 1 hour to avoid hammering NWS.
 *
 * GET /api/weather?lat=30.45&lon=-91.15
 * GET /api/weather  (uses hardcoded home coordinates)
 *
 * Returns:
 * {
 *   current: { temp, shortForecast, isDaytime, windSpeed },
 *   today: { high, low, shortForecast, detailedForecast, precipChance },
 *   tomorrow: { high, low, shortForecast, precipChance },
 *   week: [{ name, high, low, shortForecast, precipChance }],
 *   alerts: [{ headline, description }],
 *   updatedAt: number
 * }
 */

import { dbGet, dbSet } from './_db.js';

// Michael's home coordinates (Louisiana — update if needed)
const HOME_LAT = process.env.HOME_LAT || '30.45';
const HOME_LON = process.env.HOME_LON || '-91.15';

const CACHE_KEY = 'weather_cache';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getCache(): Promise<any | null> {
  try {
    const cache = await dbGet(CACHE_KEY);
    if (!cache) return null;
    if (Date.now() - (cache.updatedAt || 0) > CACHE_TTL) return null;
    return cache;
  } catch { return null; }
}

async function setCache(value: any) {
  try {
    await dbSet(CACHE_KEY, value);
  } catch {}
}

function extractPrecip(forecast: any): number {
  const prob = forecast?.probabilityOfPrecipitation?.value;
  return typeof prob === 'number' ? prob : 0;
}

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: corsHeaders });

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const lat = url.searchParams.get('lat') || HOME_LAT;
  const lon = url.searchParams.get('lon') || HOME_LON;

  const cached = await getCache();
  if (cached) return j(cached);

  try {
    const headers = { 'User-Agent': 'BearHouseOS/1.0 (michael711hebert@gmail.com)' };

    // Step 1: Get grid point
    const pointRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`, { headers });
    if (!pointRes.ok) throw new Error(`NWS points failed: ${pointRes.status}`);
    const pointData = await pointRes.json();
    const { forecast: forecastUrl, forecastHourly: hourlyUrl, observationStations: stationsUrl } = pointData.properties;

    // Step 2: Get forecast + alerts in parallel
    const [forecastRes, alertsRes] = await Promise.all([
      fetch(forecastUrl, { headers }),
      fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, { headers }),
    ]);

    const forecastData = await forecastRes.json();
    const alertsData = await alertsRes.json();

    const periods: any[] = forecastData.properties?.periods || [];

    // Current = first daytime period (or first period)
    const current = periods[0] || {};
    const todayPeriods = periods.filter(p => p.name === 'Today' || p.name === 'Tonight' || p.isDaytime).slice(0, 2);
    const dayPeriods = periods.filter(p => p.isDaytime);
    const nightPeriods = periods.filter(p => !p.isDaytime);

    const getHigh = (name: string) => dayPeriods.find(p => p.name === name || p.name.includes(name))?.temperature;
    const getLow = (name: string) => nightPeriods.find(p => p.name.includes(name))?.temperature;

    const week = dayPeriods.slice(0, 7).map(p => {
      const night = nightPeriods.find(n => n.name.toLowerCase().includes(p.name.toLowerCase().split(' ')[0]));
      return {
        name: p.name,
        high: p.temperature,
        low: night?.temperature ?? null,
        shortForecast: p.shortForecast,
        precipChance: extractPrecip(p),
        isDaytime: true,
      };
    });

    const alerts = (alertsData.features || []).slice(0, 3).map((f: any) => ({
      headline: f.properties?.headline || f.properties?.event,
      description: (f.properties?.description || '').slice(0, 300),
      severity: f.properties?.severity,
    }));

    const result = {
      current: {
        temp: current.temperature,
        unit: current.temperatureUnit || 'F',
        shortForecast: current.shortForecast,
        isDaytime: current.isDaytime,
        windSpeed: current.windSpeed,
        windDirection: current.windDirection,
        icon: current.icon,
      },
      today: {
        high: dayPeriods[0]?.temperature ?? null,
        low: nightPeriods[0]?.temperature ?? null,
        shortForecast: dayPeriods[0]?.shortForecast || current.shortForecast,
        detailedForecast: dayPeriods[0]?.detailedForecast || '',
        precipChance: extractPrecip(dayPeriods[0]) || extractPrecip(current),
      },
      tomorrow: {
        high: dayPeriods[1]?.temperature ?? null,
        low: nightPeriods[1]?.temperature ?? null,
        shortForecast: dayPeriods[1]?.shortForecast || '',
        precipChance: extractPrecip(dayPeriods[1]),
      },
      week,
      alerts,
      updatedAt: Date.now(),
    };

    await setCache(result);
    return j(result);
  } catch (e: any) {
    const stale = await dbGet(CACHE_KEY);
    if (stale) return j({ ...stale, stale: true });
    return j({ error: (e as any)?.message || 'Weather fetch failed' }, 500);
  }
}
