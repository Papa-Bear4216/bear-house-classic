'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, Plus, Loader2, Sparkles, CheckSquare, Map, Clock, ShieldAlert, Zap, Info, AlertTriangle } from 'lucide-react';
import { analyzeImageWithAI } from '@/lib/local-ai';
import { useTasks } from '@/hooks/use-tasks';
import { useFamilyMembers } from '@/hooks/use-family';
import { format } from 'date-fns';
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Chore = {
  choreId: number;
  choreTitle: string;
  location: string;
  itemsInvolved: string[];
  properStorage: string;
  priority: string;
  estimatedTime: string;
  difficulty: string;
};

type Mission = {
  missionId: number;
  missionName: string;
  description: string;
  totalTimeEstimate: string;
  funFact: string;
  relatedChores: Chore[];
};

type ScanResult = {
  houseScan: {
    overallMessLevel: string;
    totalChoresIdentified: number;
    roomsSummary: Record<string, {
      messLevel: string;
      itemsOutOfPlace: number;
      primaryClutterType: string;
    }>;
  };
  choreMissions: Mission[];
};

const SCAN_PROMPT = `You are analyzing a photo of a room or living space. Look carefully at what is visible and identify items that are out of place, messy, or need to be cleaned or organized.

Respond with ONLY a valid JSON object in this exact format (no markdown, no extra text):
{
  "houseScan": {
    "overallMessLevel": "high",
    "totalChoresIdentified": 5,
    "roomsSummary": {
      "Living Room": {
        "messLevel": "medium",
        "itemsOutOfPlace": 3,
        "primaryClutterType": "Toys and clothing"
      }
    }
  },
  "choreMissions": [
    {
      "missionId": 1,
      "missionName": "The Toy Rescue",
      "description": "Round up scattered items and return them to their homes.",
      "totalTimeEstimate": "10 minutes",
      "funFact": "A tidy space helps your brain focus better!",
      "relatedChores": [
        {
          "choreId": 101,
          "choreTitle": "Pick up toys",
          "location": "Floor",
          "itemsInvolved": ["toy cars", "blocks"],
          "properStorage": "Toy bin",
          "priority": "high",
          "estimatedTime": "5 minutes",
          "difficulty": "easy"
        }
      ]
    }
  ]
}

Base your response on what you actually see in the photo. Generate 2-3 missions. If the room looks clean, identify light maintenance tasks. Use "high", "medium", or "low" for mess levels and priority. Use "easy", "medium", or "hard" for difficulty.`;

export default function ScannerPage() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [frameBase64, setFrameBase64] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [assignedMissions, setAssignedMissions] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { addTask } = useTasks();
  const { users } = useFamilyMembers();

  const childrenFilter = users.filter(u => u.role === 'child' && !u.isExempt);

  const startCamera = async () => {
    try {
      if (stream) stream.getTracks().forEach(t => t.stop());
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setStream(newStream);
      setCameraError(null);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
    } catch (err) {
      console.error("Failed to start camera", err);
      setCameraError("Camera access denied. Grant camera permission and try again.");
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startCamera();
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFrameBase64(canvas.toDataURL('image/jpeg', 0.8));
    setError(null);
  }, []);

  const retakeImage = () => {
    setFrameBase64(null);
    setScanResult(null);
    setAssignedMissions(new Set());
    setError(null);
  };

  const analyzeImage = async () => {
    if (!frameBase64) return;
    setIsAnalyzing(true);
    setScanResult(null);
    setError(null);

    try {
      const responseText = await analyzeImageWithAI(frameBase64, SCAN_PROMPT);
      const jsonMatch = responseText.match(/```json\s*(\{[\s\S]*?\})\s*```/) ??
                        responseText.match(/(\{[\s\S]*\})/);
      const jsonString = jsonMatch ? jsonMatch[1] : responseText.trim();
      setScanResult(JSON.parse(jsonString));
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : 'Analysis failed';
      setError(msg.includes('NEXT_PUBLIC_GEMINI_API_KEY')
        ? 'Set NEXT_PUBLIC_GEMINI_API_KEY in your Vercel env vars to enable scanner AI.'
        : `Analysis failed: ${msg}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const assignMission = (mission: Mission, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const assigneeId = formData.get('assignee') as string;
    mission.relatedChores.forEach(chore => {
      addTask({
        title: `${mission.missionName}: ${chore.choreTitle}`,
        assigneeId,
        date: format(new Date(), 'yyyy-MM-dd'),
        pointsValue: chore.difficulty === 'hard' ? 50 : chore.difficulty === 'medium' ? 30 : 15,
        completed: false,
        status: 'todo',
        properStorage: chore.properStorage,
      });
    });
    setAssignedMissions(prev => new Set(prev).add(mission.missionId));
  };

  const getBadgeColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'low': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 relative p-4 sm:p-8 xl:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="mb-6">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
            <Camera className="w-8 h-8 text-blue-600" />
            Scanner & Walkthrough
          </h1>
          <p className="text-slate-500 mt-2 text-sm sm:text-base">
            Point the camera at a messy room and let AI generate chores.
          </p>
        </header>

        <div className="bg-black rounded-3xl overflow-hidden relative shadow-xl ring-1 ring-slate-900/10">
          {!frameBase64 ? (
            <div className="relative aspect-video w-full bg-slate-900 flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

              {cameraError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70 p-8 z-10">
                  <AlertTriangle className="w-10 h-10 text-amber-400" />
                  <p className="text-center text-sm">{cameraError}</p>
                  <button
                    onClick={startCamera}
                    className="px-4 py-2 bg-white/20 backdrop-blur-md rounded-full text-white text-sm font-medium flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" /> Retry
                  </button>
                </div>
              ) : (
                <div className="absolute bottom-8 left-0 right-0 flex justify-center z-10">
                  <button
                    onClick={captureFrame}
                    className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full border-4 border-white flex items-center justify-center hover:scale-105 transition-transform shadow-xl active:scale-95"
                  >
                    <div className="w-12 h-12 bg-white rounded-full" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="relative aspect-video w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={frameBase64} alt="Captured" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 to-transparent flex gap-3 justify-center">
                <button
                  onClick={retakeImage}
                  className="px-5 py-2.5 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full text-white font-medium flex items-center gap-2 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" /> Retake
                </button>
                {!isAnalyzing && !scanResult && (
                  <button
                    onClick={analyzeImage}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-full text-white font-medium flex items-center gap-2 transition-colors shadow-lg"
                  >
                    <Sparkles className="w-4 h-4" /> Analyze Room
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-red-700">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {isAnalyzing && (
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-slate-500 space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="font-medium animate-pulse">Analyzing your room with AI…</p>
          </div>
        )}

        {scanResult && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* House Scan Summary */}
            <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2 mb-6">
                <Map className="w-5 h-5 text-indigo-500" /> Walkthrough Summary
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="text-sm font-medium text-slate-500 mb-1">Overall Mess</div>
                  <span className={cn("px-2.5 py-0.5 rounded-full text-sm font-medium border", getBadgeColor(scanResult.houseScan.overallMessLevel))}>
                    {scanResult.houseScan.overallMessLevel.toUpperCase()}
                  </span>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="text-sm font-medium text-slate-500 mb-1">Chores Found</div>
                  <div className="text-2xl font-semibold text-indigo-600">{scanResult.houseScan.totalChoresIdentified}</div>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Room Breakdown</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(scanResult.houseScan.roomsSummary).map(([room, details]) => (
                    <div key={room} className="p-4 rounded-2xl border border-slate-200 hover:border-indigo-200 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-slate-900">{room}</h4>
                        <span className={cn("text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border", getBadgeColor(details.messLevel))}>
                          {details.messLevel}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">
                        <span className="font-medium text-slate-900">{details.itemsOutOfPlace}</span> items out of place
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Clutter: {details.primaryClutterType}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Missions */}
            <section className="space-y-6">
              <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2 px-2">
                <Sparkles className="w-5 h-5 text-amber-500" /> Recommended Missions
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {scanResult.choreMissions.map((mission) => {
                  const isAssigned = assignedMissions.has(mission.missionId);
                  return (
                    <div key={mission.missionId} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col relative overflow-hidden group hover:shadow-md transition-all">
                      <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity rotate-12 scale-150 pointer-events-none">
                        <ShieldAlert className="w-32 h-32" />
                      </div>
                      <div className="flex-1 relative z-10">
                        <div className="flex justify-between items-start gap-4 mb-3">
                          <h3 className="font-bold text-lg text-slate-900 leading-tight">{mission.missionName}</h3>
                          <span className="shrink-0 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 border border-blue-100">
                            <Clock className="w-3 h-3" /> {mission.totalTimeEstimate}
                          </span>
                        </div>
                        <p className="text-slate-600 text-sm mb-5">{mission.description}</p>
                        <div className="bg-amber-50/50 rounded-2xl p-4 mb-6 border border-amber-100/50">
                          <h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1">
                            <Zap className="w-3 h-3" /> Sub-Tasks
                          </h4>
                          <ul className="space-y-2">
                            {mission.relatedChores.map(chore => (
                              <li key={chore.choreId} className="text-sm flex items-start gap-2">
                                <span className="mt-0.5 shrink-0 block w-1.5 h-1.5 rounded-full bg-amber-400" />
                                <div>
                                  <span className="font-medium text-slate-800">{chore.choreTitle}</span>
                                  <span className="text-slate-500 ml-1">({chore.estimatedTime})</span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <div className="relative z-10 mt-auto pt-4 border-t border-slate-100">
                        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                          <div className="flex items-center gap-2 text-xs text-indigo-600/80 bg-indigo-50/50 px-3 py-2 rounded-xl flex-1 items-start sm:items-center border border-indigo-100/50">
                            <Info className="w-4 h-4 shrink-0" />
                            <span className="line-clamp-2">{mission.funFact}</span>
                          </div>
                          {isAssigned ? (
                            <div className="shrink-0 bg-green-50 text-green-700 px-4 py-2.5 rounded-xl flex items-center gap-2 border border-green-200 font-medium text-sm">
                              <CheckSquare className="w-4 h-4" /> Assigned
                            </div>
                          ) : (
                            <form onSubmit={(e) => assignMission(mission, e)} className="shrink-0 flex items-center gap-2 w-full sm:w-auto">
                              <select
                                name="assignee"
                                required
                                className="w-full sm:w-32 text-sm px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">Assign to...</option>
                                {childrenFilter.map(u => (
                                  <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                              </select>
                              <button type="submit" className="p-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors shadow-sm">
                                <Plus className="w-4 h-4" />
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
