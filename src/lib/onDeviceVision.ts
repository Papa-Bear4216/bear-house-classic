import { Capacitor, registerPlugin } from '@capacitor/core';

interface OnDeviceGenAIPlugin {
  checkAvailability(): Promise<{ status: 'available' | 'downloadable' | 'downloading' | 'unavailable' }>;
  analyzeImage(opts: { base64Jpeg: string; prompt: string }): Promise<{ text: string }>;
}

const OnDeviceGenAI = registerPlugin<OnDeviceGenAIPlugin>('OnDeviceGenAI');

export type OnDeviceVisionResult =
  | { ok: true; text: string; source: 'on-device' }
  | { ok: false };

/** Tries on-device Gemini Nano (ML Kit GenAI Prompt API) inference first.
 * Every failure mode (web, unavailable, download-needed, threw) collapses
 * to ok:false uniformly — callers always fall back to cloud, never branch
 * on why on-device didn't work. */
export async function tryOnDeviceVision(base64: string, prompt: string): Promise<OnDeviceVisionResult> {
  if (!Capacitor.isNativePlatform()) return { ok: false };
  try {
    const { status } = await OnDeviceGenAI.checkAvailability();
    if (status !== 'available') return { ok: false };
    const { text } = await OnDeviceGenAI.analyzeImage({ base64Jpeg: base64, prompt });
    return { ok: true, text, source: 'on-device' };
  } catch {
    return { ok: false };
  }
}
