import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  dbGet: vi.fn(),
  dbSet: vi.fn(),
  resolveHouseholdId: vi.fn(),
  resolveHouseholdIdByWebhookToken: vi.fn(),
}));

import handler from './weather';
import { dbGet, dbSet, resolveHouseholdId, resolveHouseholdIdByWebhookToken } from './_db.js';

describe('GET /api/weather', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    vi.mocked(resolveHouseholdIdByWebhookToken).mockResolvedValue(null);
    vi.mocked(dbGet).mockResolvedValue(null);
    vi.mocked(dbSet).mockResolvedValue(undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('handles CORS preflight', async () => {
    const req = new Request('https://example.com/api/weather', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://www.hotmessexpress.lol',
        'Access-Control-Request-Method': 'GET',
      },
    });
    const res = await handler(req);
    expect(res.status).toBe(204);
  });

  it('rejects with 401 when unauthenticated', async () => {
    const req = new Request('https://example.com/api/weather?lat=30.45&lon=-91.15', { method: 'GET' });
    const res = await handler(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('rejects with 400 on invalid coordinates', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('hh-1');
    const req = new Request('https://example.com/api/weather?lat=120&lon=-91.15', {
      method: 'GET',
      headers: { authorization: 'Bearer valid-jwt' },
    });
    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  it('returns cached data if fresh and coordinates match', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('hh-1');
    const cachedWeather = {
      lat: '30.45',
      lon: '-91.15',
      updatedAt: Date.now() - 5000,
      current: { temp: 72 },
    };
    vi.mocked(dbGet).mockResolvedValue(cachedWeather);

    const req = new Request('https://example.com/api/weather?lat=30.45&lon=-91.15', {
      method: 'GET',
      headers: { authorization: 'Bearer valid-jwt' },
    });
    const res = await handler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.current.temp).toBe(72);
  });

  it('authenticates via x-webhook-token header and fetches live NWS data on cache miss', async () => {
    vi.mocked(resolveHouseholdIdByWebhookToken).mockResolvedValue('hh-1');
    vi.mocked(dbGet).mockResolvedValue(null);

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/points/')) {
        return Promise.resolve(new Response(JSON.stringify({
          properties: {
            forecast: 'https://api.weather.gov/gridpoints/LIX/10,10/forecast',
            forecastHourly: 'https://api.weather.gov/gridpoints/LIX/10,10/forecast/hourly',
            observationStations: 'https://api.weather.gov/gridpoints/LIX/10,10/stations',
          },
        }), { status: 200 }));
      }
      if (url.includes('/forecast')) {
        return Promise.resolve(new Response(JSON.stringify({
          properties: {
            periods: [
              { name: 'Today', isDaytime: true, temperature: 75, temperatureUnit: 'F', shortForecast: 'Sunny', windSpeed: '5 mph', windDirection: 'NW' },
              { name: 'Tonight', isDaytime: false, temperature: 55, temperatureUnit: 'F', shortForecast: 'Clear' },
              { name: 'Tomorrow', isDaytime: true, temperature: 78, temperatureUnit: 'F', shortForecast: 'Partly Cloudy' },
            ],
          },
        }), { status: 200 }));
      }
      if (url.includes('/alerts/')) {
        return Promise.resolve(new Response(JSON.stringify({
          features: [
            { properties: { headline: 'Flood Advisory', description: 'Minor flooding possible', severity: 'Minor' } },
          ],
        }), { status: 200 }));
      }
      return Promise.resolve(new Response('Not found', { status: 404 }));
    });
    global.fetch = mockFetch;

    const req = new Request('https://example.com/api/weather?lat=30.45&lon=-91.15', {
      method: 'GET',
      headers: { 'x-webhook-token': 'token-xyz' },
    });
    const res = await handler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.current.temp).toBe(75);
    expect(body.today.high).toBe(75);
    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0].headline).toBe('Flood Advisory');
    expect(dbSet).toHaveBeenCalledWith('weather_cache', 'hh-1', expect.objectContaining({
      lat: '30.45',
      lon: '-91.15',
    }));
  });

  it('serves stale cache on NWS fetch failure if stale cache exists', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('hh-1');
    const staleData = {
      lat: '30.45',
      lon: '-91.15',
      updatedAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours old
      current: { temp: 68 },
    };
    // First getCache returns null because it expired, but in catch block dbGet returns staleData
    vi.mocked(dbGet)
      .mockResolvedValueOnce(staleData) // getCache inspects and rejects because expired
      .mockResolvedValueOnce(staleData); // catch block retrieves stale cache

    global.fetch = vi.fn().mockRejectedValue(new Error('NWS connection timeout'));

    const req = new Request('https://example.com/api/weather?lat=30.45&lon=-91.15', {
      method: 'GET',
      headers: { authorization: 'Bearer jwt' },
    });
    const res = await handler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stale).toBe(true);
    expect(body.current.temp).toBe(68);
  });

  it('returns 500 on fetch failure when no stale cache exists', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('hh-1');
    vi.mocked(dbGet).mockResolvedValue(null);
    global.fetch = vi.fn().mockRejectedValue(new Error('NWS network error'));

    const req = new Request('https://example.com/api/weather?lat=30.45&lon=-91.15', {
      method: 'GET',
      headers: { authorization: 'Bearer jwt' },
    });
    const res = await handler(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('NWS network error');
  });
});
