import { describe, it, expect, vi, beforeEach } from 'vitest';

// BrowserVoiceProvider reads window.speechSynthesis and a SpeechRecognition
// ctor off window at call time. Stub both so the provider logic (auto-stop on
// result, barge-in, premium stale-audio guard) is testable in a Node env.

let recognitionInstance: any = null;

class FakeRecognition {
  continuous!: boolean;
  interimResults!: boolean;
  lang!: string;
  onresult: any = null;
  onend: any = null;
  onerror: any = null;
  onspeechend: any = null;
  started = 0;
  stopped = 0;
  constructor() { recognitionInstance = this; }
  start() { this.started++; }
  stop() { this.stopped++; this.onend?.(); }
}

const mockSpeechSynthesis = {
  _utterances: [] as any[],
  cancel: vi.fn(),
  speak: (u: any) => { mockSpeechSynthesis._utterances.push(u); },
};

vi.stubGlobal('window', {
  speechSynthesis: mockSpeechSynthesis,
  SpeechRecognition: FakeRecognition,
});
vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; rate = 1; pitch = 1; constructor(t: string) { this.text = t; } });

const { getVoiceProvider } = await import('./voice');

describe('voice provider', () => {
  let provider: any;
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpeechSynthesis._utterances.length = 0;
    recognitionInstance = null;
    provider = getVoiceProvider(false, async () => null, (p) => p);
    // The provider instance is cached at module level — make sure a prior
    // test's in-flight listening session doesn't block the next one.
    provider.stopListening();
  });

  it('speak() routes text to speechSynthesis', () => {
    provider.speak('hello');
    expect(mockSpeechSynthesis._utterances.map((u: any) => u.text)).toEqual(['hello']);
  });

  it('startListening triggers barge-in: silences in-flight speech before listening', () => {
    provider.speak('long reply');
    provider.startListening(() => {});
    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
  });

  it('auto-stops listening after a single final result', () => {
    const onResult = vi.fn();
    const onEnd = vi.fn();
    provider.startListening(onResult, onEnd);
    const r = recognitionInstance!;
    expect(r.started).toBe(1);

    r.onresult({ results: [[{ transcript: 'wash the car' }]] });
    expect(onResult).toHaveBeenCalledWith('wash the car');
    // onresult calls recognition.stop() → which fires onend → onEnd fires once.
    expect(r.stopped).toBeGreaterThanOrEqual(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('does not double-fire onEnd when stop() and a later error both fire', () => {
    const onEnd = vi.fn();
    provider.startListening(() => {}, onEnd);
    const r = recognitionInstance!;
    r.onresult({ results: [[{ transcript: 'x' }]] }); // triggers stop() → onend
    r.onend?.();
    r.onerror?.();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('premium provider drops stale audio when barge-in interrupts an in-flight fetch', async () => {
    const audioPlay = vi.fn();
    let release!: (v: any) => void;
    const gate = new Promise((r) => { release = r; });
    vi.stubGlobal('Audio', class { play() { audioPlay(); } });

    const prem = getVoiceProvider(true, async () => 'tok', (p) => p);
    vi.stubGlobal('fetch', () => gate as unknown as Promise<Response>);

    prem.speak('partial reply'); // starts the fetch
    await Promise.resolve();    // let the IIFE reach fetch

    prem.startListening(() => {}); // barge-in → speakGen++

    // Now the (stale) fetch resolves — the audio must NOT play.
    release(new Response(JSON.stringify({ audioBase64: 'AAAA' }), { status: 200 }));
    await gate;
    await new Promise(r => setTimeout(r, 0));
    expect(audioPlay).not.toHaveBeenCalled();
  });
});
