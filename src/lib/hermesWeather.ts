// Weather for Hermes's system prompt. api/weather.ts's cache lives in
// Supabase (household-scoped), not localStorage, so it can't be read
// synchronously the way the other LIVE DATA fields are — this mirrors
// hermesMemory.ts's fetch-once-cache-locally pattern: loadHermesWeather()
// on chat panel open, cachedHermesWeather() read synchronously in the
// prompt builder.

import { apiUrl } from './api';
import { getAccessToken } from './householdAuth';

interface WeatherSummary {
  todayHigh: number | null;
  todayLow: number | null;
  todayForecast: string;
  precipChance: number;
  alerts: string[];
}

let cache: WeatherSummary | null = null;

export async function loadHermesWeather(): Promise<WeatherSummary | null> {
  try {
    const token = await getAccessToken();
    const res = await fetch(apiUrl('/api/weather'), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return cache;
    const data = await res.json();
    cache = {
      todayHigh: data.today?.high ?? null,
      todayLow: data.today?.low ?? null,
      todayForecast: data.today?.shortForecast || '',
      precipChance: data.today?.precipChance || 0,
      alerts: (data.alerts || []).map((a: any) => a.headline).filter(Boolean),
    };
    return cache;
  } catch {
    return cache;
  }
}

export function cachedHermesWeather(): WeatherSummary | null {
  return cache;
}
