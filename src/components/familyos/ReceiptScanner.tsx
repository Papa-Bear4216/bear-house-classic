import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, ScanLine, Camera, Check, Trash2, Loader2 } from 'lucide-react';
import { callClaudeVision, callGeminiVision, getGeminiDailyUsage, resetGeminiCount, type PantryCategory } from '@/lib/familyos';

interface ScannedItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: PantryCategory;
  selected: boolean;
}

interface Props {
  onClose: () => void;
  onSave: (items: { name: string; quantity: number; unit: string; category: PantryCategory }[]) => void;
}

type Provider = 'claude' | 'gemini';

const RECEIPT_PROMPT = `You are analyzing a grocery receipt or a photo of groceries/food items. Extract everything you can see.
If this is a photo of actual food/groceries (not a paper receipt), estimate reasonable quantities.

Return ONLY a valid JSON array (no markdown, no explanation) like:
[{"name":"Milk","quantity":1,"unit":"gallon","category":"dairy"},{"name":"Bananas","quantity":6,"unit":"","category":"produce"}]

Valid categories: produce, meat, dairy, bakery, pantry, frozen, beverages, household, personal-care, other
If nothing is identifiable, return an empty array: []`;

const ReceiptScanner: React.FC<Props> = ({ onClose, onSave }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [provider, setProvider] = useState<Provider>('claude');
  const [status, setStatus] = useState<string>('Starting camera…');
  const [analyzing, setAnalyzing] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [scannedItems, setScannedItems] = useState<ScannedItem[] | null>(null);
  const [geminiUsage, setGeminiUsage] = useState(() => getGeminiDailyUsage());

  useEffect(() => {
    startCamera();
    return () => stopAll();
  }, []);

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('Camera not available. Check browser permissions.');
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
      setStatus('Ready');
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name ?? '';
      setCameraFailed(true);
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setStatus('Camera permission denied. Allow it in your browser/device settings.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setStatus('No camera found on this device.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setStatus('Camera is in use by another app. Close it and try again.');
      } else {
        setStatus(`Camera error: ${(err as Error)?.message ?? 'unknown'}`);
      }
    }
  };

  const retryCamera = () => {
    setCameraFailed(false);
    setStatus('Starting camera…');
    startCamera();
  };

  const stopAll = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
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
    if (provider === 'gemini') return callGeminiVision(base64, 'image/jpeg', RECEIPT_PROMPT);
    return callClaudeVision(base64, 'image/jpeg', RECEIPT_PROMPT);
  }, [provider]);

  const analyzeFrame = useCallback(async () => {
    if (analyzing) return;
    const base64 = captureFrame();
    if (!base64) { setStatus('Camera not ready — try again.'); return; }
    setAnalyzing(true);
    setStatus('Analyzing…');
    const result = await callVision(base64);
    setAnalyzing(false);
    if (provider === 'gemini') setGeminiUsage(getGeminiDailyUsage());
    if (!result.ok) { setStatus(`Error: ${result.text}`); return; }
    try {
      const raw = result.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const arrMatch = raw.match(/\[[\s\S]*\]/);
      if (!arrMatch) { setStatus(`Bad response — no JSON found. Raw: ${raw.slice(0, 60)}`); return; }
      const parsed: Array<{ name: string; quantity: number; unit: string; category: string }> = JSON.parse(arrMatch[0]);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setStatus('Nothing spotted. Try another angle.');
        return;
      }
      const VALID_CATEGORIES: PantryCategory[] = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'household', 'personal-care', 'other'];
      setScannedItems(parsed.map((item) => ({
        id: `${Date.now()}-${Math.random()}`,
        name: item.name,
        quantity: item.quantity || 1,
        unit: item.unit || '',
        category: (VALID_CATEGORIES.includes(item.category as PantryCategory) ? item.category : 'other') as PantryCategory,
        selected: true,
      })));
      setStatus(`Found ${parsed.length} item${parsed.length > 1 ? 's' : ''}`);
    } catch {
      setStatus('Could not parse response. Try again.');
    }
  }, [analyzing, captureFrame, callVision]);

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
    onSave(selected.map(({ name, quantity, unit, category }) => ({ name, quantity, unit, category })));
    onClose();
  };

  const selectedCount = scannedItems?.filter((i) => i.selected).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-shrink-0" style={{ height: '45vh' }}>
        {!scannedItems && <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />}
        <canvas ref={canvasRef} className="hidden" />

        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-6 h-6" /></button>
          <span className="text-white font-semibold text-sm">Scan Receipt / Groceries</span>
          <div className="w-6" />
        </div>

        {!scannedItems && (
          <div className="absolute bottom-0 left-0 right-0 px-4 py-2 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center gap-2">
              <span className="text-white/80 text-xs flex-1">{status}</span>
              {cameraFailed && (
                <button onClick={retryCamera} className="text-xs px-2 py-1 rounded bg-white/20 hover:bg-white/30 text-white flex-shrink-0">Retry</button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
        {!scannedItems && (
          <div className="px-4 py-3 flex items-center gap-2 border-b border-slate-800">
            <div className="flex rounded-lg overflow-hidden border border-slate-700">
              {(['gemini', 'claude'] as Provider[]).map((p) => (
                <button key={p} onClick={() => setProvider(p)}
                  className={`text-xs px-3 py-1.5 font-medium transition ${provider === p ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                  {p === 'gemini' ? 'Gemini ✦' : 'Claude'}
                </button>
              ))}
            </div>
            {provider === 'gemini' && (
              <span className={`text-xs ${geminiUsage.count >= geminiUsage.limit ? 'text-rose-400' : 'text-slate-500'}`}>
                {geminiUsage.count}/{geminiUsage.limit} today
              </span>
            )}
            <button
              onClick={analyzeFrame}
              disabled={analyzing || cameraFailed}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition"
            >
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              {analyzing ? 'Analyzing…' : 'Capture & Extract'}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {!scannedItems && (
            <div className="text-center text-slate-600 text-sm pt-6">Point camera at a receipt or groceries and tap Capture</div>
          )}
          {scannedItems && scannedItems.map((item) => (
            <div key={item.id} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${item.selected ? 'bg-emerald-900/20 border-emerald-500/40' : 'bg-slate-800/40 border-slate-700 opacity-50'}`}>
              <button onClick={() => toggleItem(item.id)}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${item.selected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500'}`}>
                {item.selected && <Check className="w-3 h-3 text-white" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-white truncate">{item.name}</p>
                <p className="text-xs text-slate-400 capitalize">{item.category}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => updateQty(item.id, item.quantity - 1)} className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm">−</button>
                <span className="w-8 text-center text-sm font-bold text-white">{item.quantity}</span>
                <button onClick={() => updateQty(item.id, item.quantity + 1)} className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm">+</button>
                <span className="text-xs text-slate-500 ml-1 w-10 truncate">{item.unit}</span>
              </div>
              <button onClick={() => removeItem(item.id)} className="text-slate-600 hover:text-rose-400 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>

        {scannedItems && (
          <div className="p-4 border-t border-slate-800 flex gap-2">
            <button onClick={() => setScannedItems(null)} className="flex-1 py-2.5 text-sm font-medium text-slate-400 border border-slate-700 rounded-xl hover:bg-slate-800">
              Rescan
            </button>
            <button
              onClick={confirmSave}
              disabled={selectedCount === 0}
              className="flex-1 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center gap-2"
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
