/**
 * Spotify Integration for Hermes
 * Mood-based playlists, focus timers, family DJ
 */

export interface SpotifyMood {
  mood: 'focus' | 'energize' | 'calm' | 'sleep' | 'clean' | 'homework' | 'dinner' | 'workout';
  energy: number; // 0-100
  duration?: number; // minutes
}

export class SpotifyIntegration {
  private accessToken: string = '';
  private deviceId: string = '';

  constructor(private clientId: string, private refreshToken: string) {}

  async initialize() {
    // Refresh access token
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: this.clientId,
      }),
    });

    const data = await response.json();
    this.accessToken = data.access_token;
  }

  async playMoodPlaylist(mood: SpotifyMood) {
    // Mood-specific playlist URIs (would be configured)
    const playlists: Record<string, string> = {
      focus: 'spotify:playlist:37i9dQZF1DX4sWSpwq3LiO', // Peaceful Piano
      energize: 'spotify:playlist:37i9dQZF1DX3rxVfibe1L0', // Mood Booster  
      calm: 'spotify:playlist:37i9dQZF1DX4PP3DA4J0N8', // Nature Sounds
      sleep: 'spotify:playlist:37i9dQZF1DWZd79rJ6a7lp', // Sleep
      clean: 'spotify:playlist:37i9dQZF1DXbSbnqxwfZtv', // Cleaning Kit
      homework: 'spotify:playlist:37i9dQZF1DX8Uebhn9wzrS', // Study
      dinner: 'spotify:playlist:37i9dQZF1DX4xuWVBs4FgJ', // Dinner Music
      workout: 'spotify:playlist:37i9dQZF1DX70Ew5krctZl', // Workout
    };

    await fetch(`https://api.spotify.com/v1/me/player/play`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        context_uri: playlists[mood.mood],
        device_id: this.deviceId,
      }),
    });

    // Set timer if duration specified
    if (mood.duration) {
      setTimeout(() => this.pause(), mood.duration * 60 * 1000);
    }
  }

  async setFocusTimer(minutes: number, userId: string) {
    // Play focus music
    await this.playMoodPlaylist({ mood: 'focus', energy: 60, duration: minutes });

    // Return promise that resolves when timer ends
    return new Promise((resolve) => {
      setTimeout(() => {
        this.playNotification();
        resolve({ userId, duration: minutes, completed: true });
      }, minutes * 60 * 1000);
    });
  }

  async playNotification() {
    // Play a gentle notification sound
    await fetch(`https://api.spotify.com/v1/me/player/play`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uris: ['spotify:track:3Zwu2K0Qa5sT6teCCHPShP'], // Gentle bell sound
      }),
    });
  }

  async pause() {
    await fetch(`https://api.spotify.com/v1/me/player/pause`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });
  }

  async getFamilyQueue(): Promise<any[]> {
    const response = await fetch(`https://api.spotify.com/v1/me/player/queue`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });

    return response.json();
  }

  async addToQueue(trackUri: string) {
    await fetch(`https://api.spotify.com/v1/me/player/queue?uri=${trackUri}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });
  }

  // Family DJ - each member can add songs
  async familyDJ(requests: Array<{ userId: string; trackUri: string }>) {
    // Add all family member requests to queue
    for (const request of requests) {
      await this.addToQueue(request.trackUri);
    }
  }
}

// Preset mood configurations
export const MOOD_PRESETS = {
  morningRoutine: {
    mood: 'energize' as const,
    energy: 70,
    duration: 30,
  },
  homeworkTime: {
    mood: 'homework' as const,
    energy: 40,
    duration: 45,
  },
  bedtimeWind: {
    mood: 'calm' as const,
    energy: 20,
    duration: 30,
  },
  cleanupTime: {
    mood: 'clean' as const,
    energy: 80,
    duration: 20,
  },
};