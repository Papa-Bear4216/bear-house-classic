/**
 * Weather Integration for Hermes
 * Activity planning, outfit suggestions, schedule adjustments
 */

export interface WeatherData {
  current: {
    temp: number;
    feelsLike: number;
    condition: string;
    windSpeed: number;
    precipitation: number;
    uvIndex: number;
  };
  hourly: Array<{
    time: string;
    temp: number;
    condition: string;
    precipitation: number;
  }>;
  alerts: Array<{
    severity: 'watch' | 'warning' | 'advisory';
    event: string;
    description: string;
  }>;
}

export class WeatherIntegration {
  constructor(
    private apiKey: string,
    private location: { lat: number; lon: number }
  ) {}

  async getCurrentWeather(): Promise<WeatherData> {
    const response = await fetch(
      `https://api.openweathermap.org/data/3.0/onecall?lat=${this.location.lat}&lon=${this.location.lon}&appid=${this.apiKey}&units=imperial`
    );

    const data = await response.json();

    return {
      current: {
        temp: Math.round(data.current.temp),
        feelsLike: Math.round(data.current.feels_like),
        condition: data.current.weather[0].main,
        windSpeed: Math.round(data.current.wind_speed),
        precipitation: data.current.rain?.['1h'] || 0,
        uvIndex: data.current.uvi,
      },
      hourly: data.hourly.slice(0, 12).map((h: any) => ({
        time: new Date(h.dt * 1000).toLocaleTimeString('en-US', { hour: 'numeric' }),
        temp: Math.round(h.temp),
        condition: h.weather[0].main,
        precipitation: h.pop * 100,
      })),
      alerts: data.alerts?.map((a: any) => ({
        severity: a.tags[0],
        event: a.event,
        description: a.description,
      })) || [],
    };
  }

  async getOutfitSuggestion(userId: string, activities: string[]): Promise<{
    layers: string[];
    accessories: string[];
    warnings: string[];
  }> {
    const weather = await this.getCurrentWeather();
    const suggestion = {
      layers: [] as string[],
      accessories: [] as string[],
      warnings: [] as string[],
    };

    // Temperature-based layers
    if (weather.current.temp < 32) {
      suggestion.layers.push('Heavy coat', 'Warm layers', 'Thermal underwear');
      suggestion.accessories.push('Gloves', 'Hat', 'Scarf');
      suggestion.warnings.push('⚠️ Freezing temperatures - bundle up!');
    } else if (weather.current.temp < 50) {
      suggestion.layers.push('Jacket', 'Long sleeves', 'Pants');
      suggestion.accessories.push('Light gloves');
    } else if (weather.current.temp < 70) {
      suggestion.layers.push('Light jacket or hoodie', 'Long or short sleeves');
    } else if (weather.current.temp > 85) {
      suggestion.layers.push('Light, breathable clothes', 'Shorts');
      suggestion.accessories.push('Sunglasses', 'Hat');
      suggestion.warnings.push('🌡️ Hot weather - stay hydrated!');
    }

    // Weather conditions
    if (weather.current.condition === 'Rain') {
      suggestion.accessories.push('Umbrella', 'Rain jacket', 'Waterproof shoes');
      suggestion.warnings.push('☔ Rain expected - don\'t forget umbrella!');
    }

    // Activity-specific
    if (activities.includes('gym') || activities.includes('sports')) {
      suggestion.layers.push('Athletic wear underneath');
      suggestion.accessories.push('Change of clothes', 'Water bottle');
    }

    if (activities.includes('outdoor')) {
      if (weather.current.uvIndex > 6) {
        suggestion.accessories.push('Sunscreen SPF 30+');
        suggestion.warnings.push('☀️ High UV - apply sunscreen!');
      }
    }

    return suggestion;
  }

  async getActivitySuggestions(): Promise<{
    indoor: string[];
    outdoor: string[];
    warnings: string[];
  }> {
    const weather = await this.getCurrentWeather();
    const suggestions = {
      indoor: [] as string[],
      outdoor: [] as string[],
      warnings: [] as string[],
    };

    // Perfect outdoor weather
    if (weather.current.temp >= 65 && weather.current.temp <= 78 && 
        weather.current.condition === 'Clear' && weather.current.windSpeed < 15) {
      suggestions.outdoor.push(
        'Park visit - perfect weather!',
        'Bike ride',
        'Nature walk',
        'Outdoor picnic',
        'Backyard games'
      );
    }

    // Indoor weather
    if (weather.current.condition === 'Rain' || weather.current.condition === 'Snow' ||
        weather.current.temp < 40 || weather.current.temp > 95) {
      suggestions.indoor.push(
        'Board games',
        'Movie marathon',
        'Baking project',
        'Indoor fort building',
        'Art and crafts'
      );
      
      if (weather.current.condition === 'Rain') {
        suggestions.indoor.push('Rainy day reading');
      }
    }

    // Weather warnings affect activities
    if (weather.alerts.length > 0) {
      weather.alerts.forEach(alert => {
        if (alert.severity === 'warning') {
          suggestions.warnings.push(`⚠️ Weather ${alert.severity}: ${alert.event}`);
          suggestions.indoor = ['Stay inside - weather warning active'];
          suggestions.outdoor = [];
        }
      });
    }

    // Time-specific suggestions
    const hour = new Date().getHours();
    if (hour >= 16 && hour <= 19 && weather.current.temp > 60) {
      suggestions.outdoor.push('Evening walk before dinner');
    }

    return suggestions;
  }

  async shouldRescheduleDueToWeather(
    eventType: string,
    eventTime: Date
  ): Promise<{
    shouldReschedule: boolean;
    reason?: string;
    alternativeTime?: Date;
  }> {
    const weather = await this.getCurrentWeather();
    const eventHour = eventTime.getHours();
    
    // Find weather for event time
    const eventWeather = weather.hourly.find(h => 
      parseInt(h.time) === (eventHour % 12 || 12)
    );

    // Severe weather check
    if (weather.alerts.some(a => a.severity === 'warning')) {
      return {
        shouldReschedule: true,
        reason: 'Severe weather warning active',
        alternativeTime: new Date(eventTime.getTime() + 24 * 60 * 60 * 1000), // Next day
      };
    }

    // Event-specific checks
    if (eventType === 'outdoor' || eventType === 'sports') {
      if (eventWeather?.precipitation && eventWeather.precipitation > 60) {
        return {
          shouldReschedule: true,
          reason: `${eventWeather.precipitation}% chance of rain`,
          alternativeTime: this.findBetterWeatherTime(eventTime),
        };
      }

      if (eventWeather?.temp && (eventWeather.temp < 35 || eventWeather.temp > 95)) {
        return {
          shouldReschedule: true,
          reason: `Temperature too extreme (${eventWeather.temp}°F)`,
          alternativeTime: this.findBetterWeatherTime(eventTime),
        };
      }
    }

    return { shouldReschedule: false };
  }

  private findBetterWeatherTime(originalTime: Date): Date {
    // Simple logic - move to same time next day
    // In production, would check forecast for better slot
    return new Date(originalTime.getTime() + 24 * 60 * 60 * 1000);
  }

  // Morning briefing weather component
  async getWeatherBriefing(): Promise<string> {
    const weather = await this.getCurrentWeather();
    const high = Math.max(...weather.hourly.map(h => h.temp));
    const low = Math.min(...weather.hourly.map(h => h.temp));
    
    let briefing = `Today: ${weather.current.condition}, ${low}°-${high}°F. `;
    
    if (weather.current.precipitation > 0) {
      briefing += `Rain expected. `;
    }
    
    if (weather.alerts.length > 0) {
      briefing += `⚠️ Weather alert: ${weather.alerts[0].event}. `;
    }
    
    if (weather.current.temp < 40) {
      briefing += 'Bundle up! ';
    } else if (weather.current.temp > 85) {
      briefing += 'Stay hydrated! ';
    }
    
    return briefing;
  }
}