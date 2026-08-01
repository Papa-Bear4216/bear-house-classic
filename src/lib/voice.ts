// Voice provider seam for Hermes voice input/output.
//
// TIER 1 (current): browser-native Web Speech API. Free, no API key, no
// network round-trip. Voice quality is the OS/browser default.
//
// UPGRADE PATH: a paid provider (Google Neural2, ElevenLabs, etc.) can
// implement the same VoiceProvider interface via an api/tts.ts + api/stt.ts
// route, then getVoiceProvider() picks it based on subscriptionStatus —
// nothing in HermesChat.tsx needs to change.

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

let cachedFreeProvider: VoiceProvider | null = null;

/**
 * Returns the active voice provider for this household. `voiceUnlocked`
 * comes from AppContext (households.voice_unlocked, redeemed via a
 * developer-distributed 6-digit code through api/voice-unlock.ts) — a
 * household-wide flag, not per-device.
 *
 * Today both branches return the free browser provider; once a paid
 * provider exists (e.g. Google Neural2 TTS via an api/tts.ts route), swap
 * the `voiceUnlocked` branch below — HermesChat.tsx and every other caller
 * stays unchanged.
 */
export function getVoiceProvider(voiceUnlocked: boolean): VoiceProvider {
  if (voiceUnlocked) {
    // TODO: return a PremiumVoiceProvider once a paid backend is wired up.
  }
  if (!cachedFreeProvider) cachedFreeProvider = new BrowserVoiceProvider();
  return cachedFreeProvider;
}
