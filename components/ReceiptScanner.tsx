'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { X, RefreshCw, Sparkles, Loader2, Check, AlertTriangle, ScanLine } from 'lucide-react';
import { analyzeReceiptWithAI } from '@/lib/local-ai';
import type { PantryCategory } from '@/hooks/use-pantry';

export interface ScannedItem {
  name: string;
  quantity: number;
  unit: string;
  category: PantryCategory;
  price?: number;
  selected: boolean;
}

interface Props {
  onConfirm: (items: ScannedItem[], storeName: string | null, total: number) => Promise<void>;
  onClose: () => void;
  mode?: 'pantry' | 'shopping';
}

export default function ReceiptScanner({ onConfirm, onClose, mode = 'pantry' }: Props) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [frameBase64, setFrameBase64] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scannedItems, setScannedItems] = useState<ScannedItem[] | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = useCallback(async () => {
    try {
      if (stream) stream.getTracks().forEach(t => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setStream(s);
      setCameraError(null);
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch {
      setCameraError('Camera access denied. Grant permission and retry.');
    }
  }, [stream]);

  useEffect(() => {
    startCamera();
    return () => { stream?.getTracks().forEach(t => t.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current, c = canvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
    setFrameBase64(c.toDataURL('image/jpeg', 0.85));
    setScanError(null);
  }, []);

  async function handleScan() {
    if (!frameBase64) return;
    setScanning(true); setScanError(null);
    try {
      const result = await analyzeReceiptWithAI(frameBase64);
      setStoreName(result.storeName);
      setTotal(result.total);
      setScannedItems(result.items.map(item => ({
        ...item,
        category: item.category as PantryCategory,
        selected: true,
      })));
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Scan failed. Try again.');
    } finally {
      setScanning(false);
    }
  }

  async function handleConfirm() {
    if (!scannedItems) return;
    setSaving(true);
    try {
      await onConfirm(scannedItems, storeName, total);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function toggleItem(i: number) {
    setScannedItems(prev => prev ? prev.map((item, idx) => idx === i ? { ...item, selected: !item.selected } : item) : null);
  }

  function updateQty(i: number, qty: number) {
    setScannedItems(prev => prev ? prev.map((item, idx) => idx === i ? { ...item, quantity: Math.max(0, qty) } : item) : null);
  }

  const selectedCount = scannedItems?.filter(i => i.selected).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />

      <motion.div initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 240 }}
        className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-green-600" />
            <h2 className="font-black text-slate-900">
              {mode === 'pantry' ? 'Scan Receipt → Pantry' : 'Scan Receipt → Shopping List'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Camera view */}
          {!scannedItems && (
            <div className="p-4 space-y-3">
              <div className="bg-black rounded-2xl overflow-hidden aspect-[4/3] relative">
                {!frameBase64 ? (
                  <>
                    <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                    {cameraError ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70 p-6">
                        <AlertTriangle className="w-8 h-8 text-amber-400" />
                        <p className="text-sm text-center">{cameraError}</p>
                        <button onClick={startCamera} className="px-4 py-2 bg-white/20 rounded-full text-sm font-bold flex items-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5" /> Retry
                        </button>
                      </div>
                    ) : (
                      <div className="absolute bottom-4 inset-x-0 flex justify-center">
                        <button onClick={captureFrame}
                          className="w-14 h-14 rounded-full bg-white/20 border-4 border-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-xl">
                          <div className="w-10 h-10 bg-white rounded-full" />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={frameBase64} alt="Captured" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex gap-2 justify-center">
                      <button onClick={() => setFrameBase64(null)}
                        className="px-4 py-2 bg-white/20 backdrop-blur rounded-full text-white text-sm font-bold flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5" /> Retake
                      </button>
                    </div>
                  </>
                )}
              </div>
              <canvas ref={canvasRef} className="hidden" />

              {scanError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {scanError}
                </div>
              )}

              {frameBase64 && !scanning && (
                <button onClick={handleScan}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-black rounded-xl flex items-center justify-center gap-2 transition-colors">
                  <Sparkles className="w-4 h-4" /> Extract Items
                </button>
              )}

              {scanning && (
                <div className="flex items-center justify-center gap-2 py-4 text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin text-green-500" />
                  <span className="font-medium">Analyzing with Gemini…</span>
                </div>
              )}

              {!frameBase64 && !cameraError && (
                <p className="text-center text-xs text-slate-400">
                  Point at a receipt or groceries, then tap the button to capture
                </p>
              )}
            </div>
          )}

          {/* Results */}
          {scannedItems && (
            <div className="p-4 space-y-3">
              {storeName && (
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-700">{storeName}</span>
                  {total > 0 && <span className="text-slate-500">Total: <strong>${total.toFixed(2)}</strong></span>}
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {scannedItems.length} items found
                </p>
                <button onClick={() => setScannedItems(null)} className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Rescan
                </button>
              </div>

              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {scannedItems.map((item, i) => (
                  <div key={i} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${item.selected ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200 opacity-50'}`}>
                    <button onClick={() => toggleItem(i)}
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${item.selected ? 'bg-green-500 border-green-500' : 'border-slate-300'}`}>
                      {item.selected && <Check className="w-3 h-3 text-white" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-slate-900 truncate">{item.name}</p>
                      <p className="text-xs text-slate-400 capitalize">{item.category}{item.price ? ` · $${item.price.toFixed(2)}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => updateQty(i, item.quantity - 1)} className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm">−</button>
                      <span className="w-8 text-center text-sm font-bold text-slate-700">{item.quantity}</span>
                      <button onClick={() => updateQty(i, item.quantity + 1)} className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm">+</button>
                      <span className="text-xs text-slate-400 ml-1 w-10 truncate">{item.unit}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => setScannedItems(prev => prev?.map(i => ({ ...i, selected: true })) ?? null)}
                  className="flex-1 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                  Select All
                </button>
                <button onClick={() => setScannedItems(prev => prev?.map(i => ({ ...i, selected: false })) ?? null)}
                  className="flex-1 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                  None
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {scannedItems && (
          <div className="p-4 border-t border-slate-100">
            <button onClick={handleConfirm} disabled={saving || selectedCount === 0}
              className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-black rounded-xl disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Add {selectedCount} item{selectedCount !== 1 ? 's' : ''} to {mode === 'pantry' ? 'Pantry' : 'Shopping List'}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
