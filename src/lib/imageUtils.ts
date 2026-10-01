// src/lib/imageUtils.ts
// Downscales and encodes user photos/scans to JPEG base64 for vision processing

/**
 * Converts a File or Blob into a downscaled JPEG base64 string (no data: URI prefix).
 * Clamps maximum dimension to maxDim (default 1600px) and applies JPEG compression.
 */
export async function fileToJpegBase64(file: File | Blob, maxDim = 1600, quality = 0.85): Promise<string> {
  if (typeof window !== 'undefined' && typeof window.createImageBitmap === 'function' && typeof document !== 'undefined') {
    try {
      const bmp = await createImageBitmap(file);
      const s = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
      const width = Math.max(1, Math.round(bmp.width * s));
      const height = Math.max(1, Math.round(bmp.height * s));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bmp, 0, 0, width, height);
        if (typeof bmp.close === 'function') bmp.close();
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        return dataUrl.split(',')[1];
      }
      if (typeof bmp.close === 'function') bmp.close();
    } catch {
      // Fall through to FileReader fallback
    }
  }

  // Fallback: FileReader readAsDataURL
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result;
      if (typeof res === 'string') {
        const parts = res.split(',');
        resolve(parts[1] || parts[0]);
      } else {
        reject(new Error('Failed to read image as data URL'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}
