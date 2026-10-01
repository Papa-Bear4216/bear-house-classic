import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, ScanLine, Camera, Check, Trash2, Loader2, Upload } from 'lucide-react';
import { callClaudeVision, callGeminiVision, getGeminiDailyUsage, type PantryCategory } from '@/lib/familyos';
import { tryOnDeviceVision } from '@/lib/onDeviceVision';
import { fileToJpegBase64 } from '@/lib/imageUtils';
import {
  parseVisionPantryItems,
  RECEIPT_PROMPT,
  SHELF_PROMPT,
  type ScanMode,
  type ScannedPantryItem,
} from '@/lib/pantryScanner';

interface Props {
  onClose: () => void;
  onSave: (
    items: { name: string; quantity: number; unit: string; category: PantryCategory }[],
    mode: ScanMode
  ) => void;
}

type Provider = 'claude' | 'gemini';

const ReceiptScanner: React.FC<Props> = ({ onClose, onSave }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [scanMode, setScanMode] = useState<ScanMode>('receipt');
  const [provider, setProvider] = useState<Provider>('claude');
  const [lastSource, setLastSource] = useState<'on-device' | 'cloud' | null>(null);
  const [status, setStatus] = useState<string>('Starting camera…');
  const [analyzing, setAnalyzing] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [scannedItems, setScannedItems] = useState<ScannedPantryItem[] | null>(null);
  const [geminiUsage, setGeminiUsage] = useState(() => getGeminiDailyUsage());

  const stopAll = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopAll();
    setUploadedImage(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('Camera not available on this browser. Use Upload Photo.');
        setCameraFailed(true);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setStatus('Ready to scan');
      setCameraFailed(false);
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name ?? '';
      setCameraFailed(true);
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setStatus('Camera permission denied. Tap "Upload Photo" below to upload an image.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setStatus('No camera detected. Tap "Upload Photo" below.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setStatus('Camera is in use by another application. Use Upload Photo instead.');
      } else {
        setStatus('Camera unavailable. You can still upload a photo below.');
      }
    }
  }, [stopAll]);

  useEffect(() => {
    startCamera();
    return () => stopAll();
  }, [startCamera, stopAll]);

  const retryCamera = () => {
    setCameraFailed(false);
    setStatus('Starting camera…');
    startCamera();
  };

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;
    const maxW = 1024;
    const scale = Math.min(1, maxW / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
    return dataUrl.split(',')[1];
  }, []);

  const callVision = useCallback(async (base64: string) => {
    const activePrompt = scanMode === 'shelf' ? SHELF_PROMPT : RECEIPT_PROMPT;
    const onDevice = await tryOnDeviceVision(base64, activePrompt);
    if (onDevice.ok) {
      setLastSource('on-device');
      return { ok: true, text: onDevice.text };
    }
    setLastSource('cloud');
    if (provider === 'gemini') return callGeminiVision(base64, 'image/jpeg', activePrompt);
    return callClaudeVision(base64, 'image/jpeg', activePrompt);
  }, [provider, scanMode]);

  const processImageBase64 = useCallback(async (base64: string) => {
    setAnalyzing(true);
    setStatus(`Analyzing ${scanMode === 'shelf' ? 'pantry shelves' : 'receipt'}…`);
    const result = await callVision(base64);
    setAnalyzing(false);
    if (provider === 'gemini') setGeminiUsage(getGeminiDailyUsage());

    if (!result.ok) {
      setStatus(`Scan error: ${result.text}`);
      return;
    }

    const items = parseVisionPantryItems(result.text);
    if (items.length === 0) {
      setStatus('No items spotted. Try a clearer angle, better lighting, or upload another photo.');
      return;
    }

    setScannedItems(items);
    setStatus(`Found ${items.length} item${items.length > 1 ? 's' : ''}`);
  }, [callVision, scanMode, provider]);

  const analyzeFrame = useCallback(async () => {
    if (analyzing) return;
    const base64 = uploadedImage || captureFrame();
    if (!base64) {
      setStatus('No image captured. Take a photo or upload an image.');
      return;
    }
    await processImageBase64(base64);
  }, [analyzing, uploadedImage, captureFrame, processImageBase64]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    stopAll();
    try {
      const base64 = await fileToJpegBase64(file);
      setUploadedImage(base64);
      setStatus('Image loaded. Ready to analyze.');
      await processImageBase64(base64);
    } catch (err: any) {
      setStatus(`Upload error: ${err?.message || 'Failed to process image'}`);
    }
  };

  const toggleItem = (id: string) => {
    setScannedItems((prev) => prev ? prev.map((i) => i.id === id ? { ...i, selected: !i.selected } : i) : null);
  };

  const updateQty = (id: string, qty: number) => {
    setScannedItems((prev) => prev ? prev.map((i) => i.id === id ? { ...i, quantity: Math.max(0, qty) } : i) : null);
  };

  const removeItem = (id: string) => {
    setScannedItems((prev) => prev ? prev.filter((i) => i.id !== id) : null);
  };

  const confirmSave = () => {
    if (!scannedItems) return;
    const selected = scannedItems.filter((i) => i.selected);
    onSave(
      selected.map(({ name, quantity, unit, category }) => ({ name, quantity, unit, category })),
      scanMode
    );
    onClose();
  };

  const selectedCount = scannedItems?.filter((i) => i.selected).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Top Media / Viewport Area */}
      <div className="relative flex-shrink-0" style={{ height: '45vh' }}>
        {!scannedItems && !uploadedImage && (
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        )}

        {!scannedItems && uploadedImage && (
          <div className="w-full h-full bg-slate-900 flex items-center justify-center p-4">
            <img
              src={`data:image/jpeg;base64,${uploadedImage}`}
              alt="Uploaded scan preview"
              className="max-h-full max-w-full object-contain rounded-lg shadow-xl border border-slate-700"
            />
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Header Bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent z-10">
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-lg">
            <X className="w-6 h-6" />
          </button>
          
          <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
            <button
              onClick={() => setScanMode('receipt')}
              className={`text-xs font-bold px-2.5 py-1 rounded-full transition ${
                scanMode === 'receipt'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🧾 Receipt
            </button>
            <button
              onClick={() => setScanMode('shelf')}
              className={`text-xs font-bold px-2.5 py-1 rounded-full transition ${
                scanMode === 'shelf'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🥫 Pantry Shelf
            </button>
          </div>

          <div className="w-6" />
        </div>

        {/* Status Overlay */}
        {!scannedItems && (
          <div className="absolute bottom-0 left-0 right-0 px-4 py-2 bg-gradient-to-t from-black/90 to-transparent">
            <div className="flex items-center gap-2">
              <span className="text-white/90 text-xs flex-1 truncate" title={status}>{status}</span>
              {cameraFailed && (
                <button
                  onClick={retryCamera}
                  className="text-xs px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white flex-shrink-0"
                >
                  Retry Camera
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Control & Item Ingest Area */}
      <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
        {!scannedItems && (
          <div className="px-4 py-3 flex items-center gap-2 border-b border-slate-800 flex-wrap">
            <div className="flex rounded-lg overflow-hidden border border-slate-700">
              {(['gemini', 'claude'] as Provider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={`text-xs px-2.5 py-1.5 font-medium transition ${
                    provider === p ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {p === 'gemini' ? 'Gemini ✦' : 'Claude'}
                </button>
              ))}
            </div>

            {lastSource && (
              <span className="text-[11px] text-slate-500">
                {lastSource === 'on-device' ? '⚡ Local' : '☁️ Cloud'}
              </span>
            )}

            {provider === 'gemini' && (
              <span className="text-[11px] text-slate-500 font-mono" title="Daily Gemini API quota">
                {geminiUsage.count}/{geminiUsage.limit}
              </span>
            )}

            <div className="ml-auto flex items-center gap-2">
              {uploadedImage && (
                <button
                  onClick={() => {
                    setUploadedImage(null);
                    startCamera();
                  }}
                  disabled={analyzing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  <Camera className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Use Camera</span>
                </button>
              )}

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={analyzing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                <Upload className="w-3.5 h-3.5 text-sky-400" />
                <span>Upload Photo</span>
              </button>

              <button
                onClick={analyzeFrame}
                disabled={analyzing || (cameraFailed && !uploadedImage)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white transition shadow-md shadow-purple-500/20"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing…</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-3.5 h-3.5" />
                    <span>Capture & Scan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Results List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {!scannedItems && (
            <div className="text-center text-slate-500 text-xs pt-8 space-y-2">
              <p>Point camera at a grocery receipt or a pantry shelf, then tap Capture.</p>
              <p className="text-[11px] text-slate-600">You can also upload an image directly from your photos or camera roll.</p>
            </div>
          )}

          {scannedItems &&
            scannedItems.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                  item.selected
                    ? 'bg-emerald-900/20 border-emerald-500/40'
                    : 'bg-slate-800/40 border-slate-700 opacity-50'
                }`}
              >
                <button
                  onClick={() => toggleItem(item.id)}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    item.selected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500'
                  }`}
                >
                  {item.selected && <Check className="w-3 h-3 text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-white truncate">{item.name}</p>
                  <p className="text-xs text-slate-400 capitalize">{item.category}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => updateQty(item.id, item.quantity - 1)}
                    className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-bold text-white">{item.quantity}</span>
                  <button
                    onClick={() => updateQty(item.id, item.quantity + 1)}
                    className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm"
                  >
                    +
                  </button>
                  <span className="text-xs text-slate-500 ml-1 w-10 truncate">{item.unit}</span>
                </div>
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-slate-600 hover:text-rose-400 flex-shrink-0 p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
        </div>

        {/* Footer Confirmation Bar */}
        {scannedItems && (
          <div className="p-4 border-t border-slate-800 flex gap-2">
            <button
              onClick={() => {
                setScannedItems(null);
                setUploadedImage(null);
                startCamera();
              }}
              className="flex-1 py-2.5 text-xs font-semibold text-slate-400 border border-slate-700 rounded-xl hover:bg-slate-800"
            >
              Scan Another
            </button>
            <button
              onClick={confirmSave}
              disabled={selectedCount === 0}
              className="flex-1 py-2.5 text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
            >
              <ScanLine className="w-4 h-4" /> Add {selectedCount} to Pantry
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReceiptScanner;
