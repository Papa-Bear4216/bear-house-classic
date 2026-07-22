import { describe, it, expect, vi, beforeEach } from 'vitest';

const isNativePlatform = vi.fn();
const checkAvailability = vi.fn();
const analyzeImage = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
  registerPlugin: () => ({ checkAvailability, analyzeImage }),
}));

describe('tryOnDeviceVision', () => {
  beforeEach(() => {
    isNativePlatform.mockReset();
    checkAvailability.mockReset();
    analyzeImage.mockReset();
  });

  it('returns ok:false on web (not native)', async () => {
    isNativePlatform.mockReturnValue(false);
    const { tryOnDeviceVision } = await import('./onDeviceVision');
    const result = await tryOnDeviceVision('base64data', 'prompt');
    expect(result).toEqual({ ok: false });
    expect(checkAvailability).not.toHaveBeenCalled();
  });

  it('returns ok:false when feature is unavailable', async () => {
    isNativePlatform.mockReturnValue(true);
    checkAvailability.mockResolvedValue({ status: 'unavailable' });
    const { tryOnDeviceVision } = await import('./onDeviceVision');
    const result = await tryOnDeviceVision('base64data', 'prompt');
    expect(result).toEqual({ ok: false });
    expect(analyzeImage).not.toHaveBeenCalled();
  });

  it('returns ok:false when feature is downloadable (no download triggered)', async () => {
    isNativePlatform.mockReturnValue(true);
    checkAvailability.mockResolvedValue({ status: 'downloadable' });
    const { tryOnDeviceVision } = await import('./onDeviceVision');
    const result = await tryOnDeviceVision('base64data', 'prompt');
    expect(result).toEqual({ ok: false });
    expect(analyzeImage).not.toHaveBeenCalled();
  });

  it('returns ok:true with text when available and inference succeeds', async () => {
    isNativePlatform.mockReturnValue(true);
    checkAvailability.mockResolvedValue({ status: 'available' });
    analyzeImage.mockResolvedValue({ text: '[{"name":"Milk"}]' });
    const { tryOnDeviceVision } = await import('./onDeviceVision');
    const result = await tryOnDeviceVision('base64data', 'prompt');
    expect(result).toEqual({ ok: true, text: '[{"name":"Milk"}]', source: 'on-device' });
  });

  it('returns ok:false when analyzeImage throws', async () => {
    isNativePlatform.mockReturnValue(true);
    checkAvailability.mockResolvedValue({ status: 'available' });
    analyzeImage.mockRejectedValue(new Error('model busy'));
    const { tryOnDeviceVision } = await import('./onDeviceVision');
    const result = await tryOnDeviceVision('base64data', 'prompt');
    expect(result).toEqual({ ok: false });
  });

  it('returns ok:false when checkAvailability throws', async () => {
    isNativePlatform.mockReturnValue(true);
    checkAvailability.mockRejectedValue(new Error('bridge error'));
    const { tryOnDeviceVision } = await import('./onDeviceVision');
    const result = await tryOnDeviceVision('base64data', 'prompt');
    expect(result).toEqual({ ok: false });
  });
});
