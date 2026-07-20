import React, { useEffect, useState } from 'react';
import { Cloud, CloudRain, Sun, Snowflake, Wind, Umbrella } from 'lucide-react';
import { authedFetch } from '@/lib/householdAuth';

interface WeatherData {
  current: { temp: number; unit: string; shortForecast: string; windSpeed: string };
  today: { high: number; low: number; shortForecast: string; precipChance: number };
  alerts: { headline: string; severity?: string }[];
  stale?: boolean;
}

function pickIcon(forecast: string) {
  const f = forecast.toLowerCase();
  if (f.includes('snow')) return Snowflake;
  if (f.includes('rain') || f.includes('storm') || f.includes('shower')) return CloudRain;
  if (f.includes('cloud')) return Cloud;
  if (f.includes('wind')) return Wind;
  return Sun;
}

function outfitSuggestion(temp: number, precipChance: number): string {
  const layers = temp >= 85 ? 'light, breathable clothes' : temp >= 70 ? 'a t-shirt and shorts or light pants' : temp >= 55 ? 'a jacket or hoodie' : temp >= 40 ? 'a warm coat and layers' : 'a heavy coat, hat, and gloves';
  const rain = precipChance >= 40 ? ' Bring an umbrella or rain jacket.' : '';
  return `Today calls for ${layers}.${rain}`;
}

function activitySuggestion(temp: number, precipChance: number, shortForecast: string): string {
  if (precipChance >= 50) return 'Rain likely — plan indoor activities today.';
  if (temp >= 95) return 'Very hot out — limit long outdoor activity, stay hydrated.';
  if (temp <= 35) return 'Cold out — bundle up if heading outside for long.';
  if (shortForecast.toLowerCase().includes('clear') || shortForecast.toLowerCase().includes('sunny')) return 'Great day to get outside!';
  return 'Decent day for outdoor plans.';
}

const WeatherWidget: React.FC = () => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authedFetch('/api/weather')
      .then(r => r.json())
      .then(d => { if (!d.error) setWeather(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 animate-pulse h-24" />;
  }
  if (!weather) return null;

  const Icon = pickIcon(weather.current.shortForecast);
  const rainSoon = weather.today.precipChance >= 40;

  return (
    <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className="w-8 h-8 text-sky-400" />
          <div>
            <div className="text-white text-lg font-bold">{weather.current.temp}°{weather.current.unit}</div>
            <div className="text-slate-400 text-xs">{weather.current.shortForecast}</div>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>H {weather.today.high}° / L {weather.today.low}°</div>
          {rainSoon && (
            <div className="flex items-center gap-1 text-sky-400 justify-end mt-0.5">
              <Umbrella className="w-3 h-3" /> {weather.today.precipChance}% rain
            </div>
          )}
        </div>
      </div>

      <div className="text-slate-300 text-xs border-t border-slate-700 pt-2">
        {outfitSuggestion(weather.current.temp, weather.today.precipChance)}
      </div>
      <div className="text-slate-400 text-xs">
        {activitySuggestion(weather.current.temp, weather.today.precipChance, weather.current.shortForecast)}
      </div>

      {weather.alerts?.length > 0 && (
        <div className="bg-rose-950/30 border border-rose-500/30 rounded-lg p-2 text-rose-200 text-xs space-y-1">
          {weather.alerts.map((a, i) => <div key={i}>⚠️ {a.headline}</div>)}
        </div>
      )}
    </div>
  );
};

export default WeatherWidget;
