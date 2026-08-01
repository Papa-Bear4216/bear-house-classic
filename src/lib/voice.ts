// Voice provider seam for Hermes voice input/output.
//
// FREE TIER: browser-native Web Speech API for both input and output. No API
// key, no network round-trip. Output voice quality is the OS/browser default
// (robotic).
//
// PREMIUM TIER (households with voice_unlocked=true, via api/voice-unlock.ts):
// speech OUTPUT swaps to Google Cloud TTS Neural2 (api/tts.ts) for natural-
// sounding audio, at real per-call cost. Speech INPUT stays the free browser
// SpeechRecognition either way — recognition accuracy isn't the pain point,
// robotic output is.
//
// FUTURE UPGRADE: real-time voice-to-voice (Gemini Live / OpenAI Realtime)
// would replace this whole request/response model with a persistent
// WebSocket session — meaningfully more expensive (~$1-3 per 5-minute
// conversation) and architecturally different. Deliberately not built yet;
// revisit only when actually wanted, gated behind its own decision, not
// silently bundled into this unlock.

export interface VoiceProvider {
  readonly supported: boolean;
  speak(text: string): void;
  stopSpeaking(): void;
  startListening(onResult: (text: string) => void, onEnd?: () => void): void;
  stopListening(): void;
}

function getSpeechRecognition(): typeof window.SpeechRecognition | undefined {
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
}

class BrowserVoiceProvider implements VoiceProvider {
  private recognition: SpeechRecognition | null = null;
  private listening = false;

  get supported(): boolean {
    return typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      !!getSpeechRecognition();
  }

  speak(text: string): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }

  stopSpeaking(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  startListening(onResult: (text: string) => void, onEnd?: () => void): void {
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor || this.listening) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) onResult(transcript);
    };
    recognition.onend = () => {
      this.listening = false;
      onEnd?.();
    };
    recognition.onerror = () => {
      this.listening = false;
      onEnd?.();
    };

    this.recognition = recognition;
    this.listening = true;
    recognition.start();
  }

  stopListening(): void {
    this.recognition?.stop();
    this.listening = false;
  }
}

/**
 * Speech output via api/tts.ts (Google Neural2). Falls back silently to the
 * free browser voice if the network call fails, so a flaky connection never
 * leaves Hermes mute.
 */
class PremiumVoiceProvider extends BrowserVoiceProvider {
  private audio: HTMLAudioElement | null = null;
  constructor(private getAuthToken: () => Promise<string | null>, private apiUrl: (path: string) => string) {
    super();
  }

  speak(text: string): void {
    this.stopSpeaking();
    (async () => {
      try {
        const token = await this.getAuthToken();
        const res = await fetch(this.apiUrl('/api/tts'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(`tts ${res.status}`);
        const data = await res.json();
        if (!data.audioBase64) throw new Error('empty audio');

        this.audio = new Audio(`data:audio/mp3;base64,${data.audioBase64}`);
        this.audio.play();
      } catch {
        super.speak(text); // fall back to free browser voice
      }
    })();
  }

  stopSpeaking(): void {
    this.audio?.pause();
    this.audio = null;
    super.stopSpeaking();
  }
}

let cachedFreeProvider: VoiceProvider | null = null;
let cachedPremiumProvider: VoiceProvider | null = null;

/**
 * Returns the active voice provider for this household. `voiceUnlocked`
 * comes from AppContext (households.voice_unlocked, redeemed via a
 * developer-distributed 6-digit code through api/voice-unlock.ts) — a
 * household-wide flag, not per-device.
 */
export function getVoiceProvider(
  voiceUnlocked: boolean,
  getAuthToken: () => Promise<string | null>,
  apiUrl: (path: string) => string
): VoiceProvider {
  if (voiceUnlocked) {
    if (!cachedPremiumProvider) cachedPremiumProvider = new PremiumVoiceProvider(getAuthToken, apiUrl);
    return cachedPremiumProvider;
  }
  if (!cachedFreeProvider) cachedFreeProvider = new BrowserVoiceProvider();
  return cachedFreeProvider;
}
