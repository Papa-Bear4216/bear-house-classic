import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, ScanLine, StopCircle, Plus, CheckCircle2, Camera } from 'lucide-react';
import { callClaudeVision, callGeminiVision, getGeminiDailyUsage, resetGeminiCount } from '@/lib/familyos';

interface DetectedChore {
  id: string;
  chore: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
  addedAt: number;
}

interface Props {
  onClose: () => void;
  onSave: (chores: DetectedChore[]) => void;
}

type ScanMode = 'live' | 'capture';
type Provider = 'claude' | 'gemini';

const PRIORITY_COLORS = {
  high: 'border-rose-500/60 bg-rose-900/20',
  medium: 'border-amber-500/60 bg-amber-900/20',
  low: 'border-slate-600 bg-slate-800/40',
};

const PRIORITY_DOT = {
  high: 'bg-rose-500',
  medium: 'bg-amber-400',
  low: 'bg-slate-500',
};

const SCAN_PROMPT = `You are scanning a room for chores and cleaning needs. Look carefully for: dirty dishes, clutter, laundry, dust, spills, items out of place, trash, pet messes, unmade beds, dirty surfaces, etc.

Return ONLY a valid JSON array (no markdown, no explanation) like:
[{"chore":"Wash dishes","detail":"Dishes piled in sink","priority":"high"},{"chore":"Pick up laundry","detail":"Clothes on floor near dresser","priority":"medium"}]

If the room looks clean or you cannot identify clear chores, return an empty array: []
Maximum 4 items per scan. Focus only on what is clearly visible.`;

const ChoreScanner: React.FC<Props> = ({ onClose, onSave }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [mode, setMode] = useState<ScanMode>('capture');
  const [provider, setProvider] = useState<Provider>('claude');
  const [scanning, setScanning] = useState(false);
  const [chores, setChores] = useState<DetectedChore[]>([]);
  const [status, setStatus] = useState<string>('Starting camera…');
  const [analyzing, setAnalyzing] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [geminiUsage, setGeminiUsage] = useState(() => getGeminiDailyUsage());
  const seenRef = useRef<Set<string>>(new Set());

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
        setStatus('Camera permission denied. Allow it in Android Settings → Apps → Bear House → Permissions.');
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
    if (intervalRef.current) clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  };

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;
    const maxW = 768;
    const scale = Math.min(1, maxW / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
    return dataUrl.split(',')[1];
  }, []);

  const callVision = useCallback(async (base64: string) => {
    if (provider === 'gemini') return callGeminiVision(base64, 'image/jpeg', SCAN_PROMPT);
    return callClaudeVision(base64, 'image/jpeg', SCAN_PROMPT);
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
      // Strip markdown fences Gemini sometimes adds
      const raw = result.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      // Extract the JSON array even if there's surrounding text
      const arrMatch = raw.match(/\[[\s\S]*\]/);
      if (!arrMatch) { setStatus(`Bad response — no JSON found. Raw: ${raw.slice(0, 60)}`); return; }
      const parsed: Array<{ chore: string; detail: string; priority: string }> = JSON.parse(arrMatch[0]);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setStatus(mode === 'live' ? 'Nothing new spotted — keep moving…' : 'Nothing spotted. Try another angle.');
        return;
      }
      const newChores: DetectedChore[] = [];
      for (const item of parsed) {
        const key = item.chore.toLowerCase().trim();
        if (seenRef.current.has(key)) continue;
        seenRef.current.add(key);
        newChores.push({
          id: `${Date.now()}-${Math.random()}`,
          chore: item.chore,
          detail: item.detail,
          priority: (['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium') as 'high' | 'medium' | 'low',
          addedAt: Date.now(),
        });
      }
      if (newChores.length > 0) {
        setChores(prev => [...newChores, ...prev]);
        setStatus(`Found ${newChores.length} item${newChores.length > 1 ? 's' : ''}${mode === 'live' ? ' — keep scanning…' : ''}`);
      } else {
        setStatus(mode === 'live' ? 'Already tracking those — keep moving…' : 'Already tracking those.');
      }
    } catch {
      setStatus('Scanning…');
    }
  }, [analyzing, captureFrame, callVision, mode]);

  const toggleLiveScan = () => {
    if (scanning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setScanning(false);
      setStatus(`Stopped. Found ${chores.length} item${chores.length !== 1 ? 's' : ''}.`);
    } else {
      setScanning(true);
      setStatus('Scanning…');
      analyzeFrame();
      intervalRef.current = setInterval(analyzeFrame, 10000);
    }
  };

  const handleModeChange = (m: ScanMode) => {
    if (scanning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setScanning(false);
    }
    setMode(m);
    setStatus('Ready');
  };

  const removeChore = (id: string) => {
    setChores(prev => {
      const c = prev.find(x => x.id === id);
      if (c) seenRef.current.delete(c.chore.toLowerCase().trim());
      return prev.filter(x => x.id !== id);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Camera feed */}
      <div className="relative flex-shrink-0" style={{ height: '50vh' }}>
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-6 h-6" />
          </button>
          <span className="text-white font-semibold text-sm">Chore Scanner</span>
          <div className="w-6" />
        </div>

        {/* Scan overlay corners */}
        {scanning && (
          <div className="absolute inset-6 pointer-events-none">
            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-green-400" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-green-400" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-green-400" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-green-400" />
          </div>
        )}

        {/* Analyzing pulse */}
        {analyzing && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="w-16 h-16 rounded-full border-2 border-green-400 animate-ping opacity-60" />
          </div>
        )}

        {/* Status bar */}
        <div className="absolute bottom-0 left-0 right-0 px-4 py-2 bg-gradient-to-t from-black/80 to-transparent">
          <div className="flex items-center gap-2">
            {scanning && <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />}
            <span className="text-white/80 text-xs flex-1">{status}</span>
            {cameraFailed && (
              <button
                onClick={retryCamera}
                className="text-xs px-2 py-1 rounded bg-white/20 hover:bg-white/30 text-white flex-shrink-0"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bottom panel */}
      <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">

        {/* Mode + Provider toggles */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-slate-800">
          {/* Mode */}
          <div className="flex rounded-lg overflow-hidden border border-slate-700 flex-1">
            {(['capture', 'live'] as ScanMode[]).map(m => (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                className={`flex-1 text-xs py-1.5 font-medium transition capitalize ${
                  mode === m ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {m === 'capture' ? '📷 Capture' : '🔴 Live'}
              </button>
            ))}
          </div>

          {/* Provider */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex rounded-lg overflow-hidden border border-slate-700">
              {(['gemini', 'claude'] as Provider[]).map(p => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={`text-xs px-3 py-1.5 font-medium transition ${
                    provider === p ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {p === 'gemini' ? 'Gemini ✦' : 'Claude'}
                </button>
              ))}
            </div>
            {provider === 'gemini' && (
              <div className="flex items-center gap-2">
                <span className={`text-xs ${
                  geminiUsage.count >= geminiUsage.limit ? 'text-rose-400' :
                  geminiUsage.count >= geminiUsage.warnAt ? 'text-amber-400' :
                  'text-slate-500'
                }`}>
                  {geminiUsage.count}/{geminiUsage.limit} today
                </span>
                {geminiUsage.count > 0 && (
                  <button
                    onClick={() => { resetGeminiCount(); setGeminiUsage(getGeminiDailyUsage()); }}
                    className="text-xs text-slate-600 hover:text-slate-400 underline"
                  >
                    reset
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-800">
          {mode === 'capture' ? (
            <button
              onClick={analyzeFrame}
              disabled={analyzing || cameraFailed}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition flex-1 justify-center"
            >
              <Camera className="w-4 h-4" />
              {analyzing ? 'Analyzing…' : 'Capture & Analyze'}
            </button>
          ) : (
            <button
              onClick={toggleLiveScan}
              disabled={cameraFailed}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition flex-1 justify-center disabled:opacity-50 ${
                scanning ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-green-600 hover:bg-green-500 text-white'
              }`}
            >
              {scanning ? <><StopCircle className="w-4 h-4" /> Stop</> : <><ScanLine className="w-4 h-4" /> Start Live Scan</>}
            </button>
          )}

          {chores.length > 0 && (
            <button
              onClick={() => { onSave(chores); onClose(); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition"
            >
              <Plus className="w-4 h-4" /> Save All
            </button>
          )}
        </div>

        {/* Chore list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {chores.length === 0 ? (
            <div className="text-center text-slate-600 text-sm pt-6">
              {mode === 'capture' ? 'Point camera at a room and tap Capture' : 'Detected chores will appear here'}
            </div>
          ) : (
            chores.map(c => (
              <div
                key={c.id}
                className={`flex items-start gap-3 border rounded-xl px-3 py-2.5 ${PRIORITY_COLORS[c.priority]}`}
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${PRIORITY_DOT[c.priority]}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium">{c.chore}</div>
                  <div className="text-slate-400 text-xs mt-0.5">{c.detail}</div>
                </div>
                <button onClick={() => removeChore(c.id)} className="text-slate-600 hover:text-slate-400 flex-shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ChoreScanner;
