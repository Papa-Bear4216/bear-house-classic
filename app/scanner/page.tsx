'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera, RefreshCw, Plus, Loader2, Sparkles, CheckSquare, Map,
  Clock, ShieldAlert, Zap, Info, AlertTriangle, Pencil, Check,
  History, ChevronDown, ChevronUp, Brain
} from 'lucide-react';
import { authFetch } from '@/lib/api-client';
import { useTasks } from '@/hooks/use-tasks';
import { useFamilyMembers } from '@/hooks/use-family';
import { useFloorplan } from '@/hooks/use-floorplan';
import { useScans } from '@/hooks/use-scans';
import { askHermes } from '@/lib/hermes';
import { Floorplan } from '@/components/Floorplan';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { FloorplanRoom } from '@/hooks/use-floorplan';
import type { HermesResult } from '@/hooks/use-scans';
import { useCurrentUser } from '@/hooks/use-current-user';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

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
  firstStep?: string;
  relatedChores: Chore[];
};

type RoomSummary = { name: string; messLevel: string; itemsOutOfPlace: number; primaryClutterType: string };

type ScanResult = {
  houseScan: {
    overallMessLevel: string;
    totalChoresIdentified: number;
    roomsSummary: RoomSummary[];
  };
  choreMissions: Mission[];
};

const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.92;

function getBadgeColor(level: string) {
  switch (level.toLowerCase()) {
    case 'high': return 'bg-red-100 text-red-800 border-red-200';
    case 'medium': return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'low': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    default: return 'bg-slate-100 text-slate-800 border-slate-200';
  }
}

export default function ScannerPage() {
  // Floorplan state
  const { rooms, addRoom, updateRoom, deleteRoom } = useFloorplan();
  const { scans, saveScan } = useScans();
  const [editMode, setEditMode] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<FloorplanRoom | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Camera state
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [frameBase64, setFrameBase64] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [hermesResult, setHermesResult] = useState<HermesResult | null>(null);
  const [hermesComment, setHermesComment] = useState<string | null>(null);
  const [assignedMissions, setAssignedMissions] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [usedPro, setUsedPro] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { addTask } = useTasks();
  const { users } = useFamilyMembers();
  const { currentUser } = useCurrentUser();

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';
  const childrenFilter = users.filter((u: { role: string; isExempt?: boolean }) => u.role === 'child' && !u.isExempt);

  // chore count badges per room from most recent scan
  const choreCounts: Record<string, number> = {};
  rooms.forEach(room => {
    const latest = scans.find(s => s.roomId === room.id);
    if (latest) choreCounts[room.id] = latest.missionCount ?? 0;
  });

  const startCamera = useCallback(async () => {
    try {
      if (stream) stream.getTracks().forEach(t => t.stop());
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } },
      });
      setStream(newStream);
      setCameraError(null);
      if (videoRef.current) videoRef.current.srcObject = newStream;
    } catch {
      setCameraError('Camera access denied. Grant camera permission and try again.');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedRoom) startCamera();
    return () => { if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, [selectedRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFrameBase64(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    setError(null);
  }, []);

  const retake = () => {
    setFrameBase64(null);
    setScanResult(null);
    setHermesResult(null);
    setHermesComment(null);
    setAssignedMissions(new Set());
    setError(null);
    setUsedPro(false);
  };

  const selectRoom = (room: FloorplanRoom) => {
    if (editMode) return;
    setSelectedRoom(room);
    retake();
    setShowHistory(false);
  };

  const analyzeImage = async (model?: 'gemini-2.5-pro') => {
    if (!frameBase64 || !selectedRoom) return;
    setIsAnalyzing(true);
    setScanResult(null);
    setHermesResult(null);
    setHermesComment(null);
    setError(null);

    try {
      const [missionsRes, hermesRes] = await Promise.allSettled([
        authFetch('/api/scan-room', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: frameBase64, ...(model && { model }) }),
        }),
        authFetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: frameBase64, room: selectedRoom.name }),
        }),
      ]);

      let missions: ScanResult | null = null;
      let hermes: HermesResult | null = null;

      if (missionsRes.status === 'fulfilled' && missionsRes.value.ok) {
        missions = await missionsRes.value.json();
        setScanResult(missions);
        setUsedPro(model === 'gemini-2.5-pro');
      } else {
        throw new Error('Room scan failed');
      }

      if (hermesRes.status === 'fulfilled' && hermesRes.value.ok) {
        hermes = await hermesRes.value.json();
        setHermesResult(hermes);
      }

      try {
        const { content } = await askHermes(
          [{
            role: 'user',
            content: `I just scanned the ${selectedRoom.name}. ${hermes ? `Hermes memory analysis: ${JSON.stringify(hermes)}. ` : ''}${missions ? `AI found ${missions.houseScan.totalChoresIdentified} chores. Mess level: ${missions.houseScan.overallMessLevel}. Missions: ${missions.choreMissions.map(m => m.missionName).join(', ')}.` : ''} Give a brief, encouraging family-friendly response about what you see and any patterns you notice over time.`,
          }],
          { currentUser, date: format(new Date(), 'PPPP') },
        );
        setHermesComment(content);
      } catch {
        // commentary is optional
      }

      setIsSaving(true);
      try {
        await saveScan({
          roomId: selectedRoom.id,
          roomName: selectedRoom.name,
          imageBase64: frameBase64,
          hermesResult: hermes,
          scanResult: missions,
          hermesComment: null,
          missionCount: missions?.choreMissions.length ?? 0,
        });
      } catch {
        // non-fatal
      } finally {
        setIsSaving(false);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Analysis failed';
      setError(`Analysis failed: ${msg}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const assignMission = (mission: Mission, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const assigneeId = new FormData(e.currentTarget).get('assignee') as string;
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

  const roomScans = selectedRoom ? scans.filter(s => s.roomId === selectedRoom.id) : [];

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 relative p-4 sm:p-8 xl:p-12">
      <div className="max-w-5xl mx-auto space-y-8">

        <header className="mb-6">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
            <Camera className="w-8 h-8 text-blue-600" />
            Scanner & Walkthrough
          </h1>
          <p className="text-slate-500 mt-2 text-sm sm:text-base">
            Select a room on the floorplan, then scan it with the camera.
          </p>
        </header>

        {/* Floorplan card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Map className="w-4 h-4 text-indigo-500" /> Floorplan
              {selectedRoom && !editMode && (
                <span className="ml-2 px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full border border-blue-200">
                  {selectedRoom.name} selected
                </span>
              )}
            </h2>
            {isAdmin && (
              <button
                onClick={() => setEditMode(e => !e)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors',
                  editMode
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {editMode ? <><Check className="w-3.5 h-3.5" /> Done Editing</> : <><Pencil className="w-3.5 h-3.5" /> Edit Layout</>}
              </button>
            )}
          </div>
          <div className="p-4">
            <Floorplan
              rooms={rooms}
              selectedRoomId={selectedRoom?.id}
              choreCounts={choreCounts}
              editMode={editMode}
              onSelectRoom={selectRoom}
              onAddRoom={addRoom}
              onUpdateRoom={(id, patch) => updateRoom(id, patch)}
              onDeleteRoom={deleteRoom}
            />
          </div>
          {editMode && (
            <div className="px-6 pb-4 text-xs text-slate-400 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              Drag to draw rooms · Drag room to move · Drag corners to resize · Select then click ✕ to delete
            </div>
          )}
        </div>

        {/* Camera / Scan panel */}
        {selectedRoom && !editMode && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg text-slate-900">
                Scanning: <span className="text-blue-600">{selectedRoom.name}</span>
              </h2>
              <button
                onClick={() => { setSelectedRoom(null); retake(); }}
                className="text-sm text-slate-500 hover:text-slate-800 underline underline-offset-2"
              >
                Change room
              </button>
            </div>

            <div className="bg-black rounded-3xl overflow-hidden relative shadow-xl ring-1 ring-slate-900/10">
              {!frameBase64 ? (
                <div className="relative aspect-video w-full bg-slate-900 flex items-center justify-center">
                  <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                  {cameraError ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70 p-8 z-10">
                      <AlertTriangle className="w-10 h-10 text-amber-400" />
                      <p className="text-center text-sm">{cameraError}</p>
                      <button onClick={startCamera} className="px-4 py-2 bg-white/20 backdrop-blur-md rounded-full text-white text-sm font-medium flex items-center gap-2">
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
                    <button onClick={retake} className="px-5 py-2.5 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full text-white font-medium flex items-center gap-2 transition-colors">
                      <RefreshCw className="w-4 h-4" /> Retake
                    </button>
                    {!isAnalyzing && !scanResult && (
                      <button onClick={() => analyzeImage()} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-full text-white font-medium flex items-center gap-2 transition-colors shadow-lg">
                        <Sparkles className="w-4 h-4" /> Analyze Room
                      </button>
                    )}
                    {!isAnalyzing && scanResult && !usedPro && (
                      <button onClick={() => analyzeImage('gemini-2.5-pro')} className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 rounded-full text-white font-medium flex items-center gap-2 transition-colors shadow-lg">
                        <Zap className="w-4 h-4" /> Re-scan with Pro
                      </button>
                    )}
                  </div>
                  {isSaving && (
                    <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-sm">
                      <Loader2 className="w-3 h-3 animate-spin" /> Saving…
                    </div>
                  )}
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
                <p className="font-medium animate-pulse">Analyzing {selectedRoom.name} with AI…</p>
              </div>
            )}

            {(scanResult || hermesResult || hermesComment) && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">

                {hermesResult && (
                  <section className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-3xl p-6 border border-indigo-100 shadow-sm">
                    <h2 className="text-lg font-semibold text-indigo-900 flex items-center gap-2 mb-4">
                      <Brain className="w-5 h-5 text-indigo-500" /> Hermes Memory
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                      <div className="bg-white/60 rounded-2xl p-3 border border-indigo-100/50">
                        <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">Status</div>
                        <div className="text-sm font-medium text-slate-800">{hermesResult.status}</div>
                      </div>
                      <div className="bg-white/60 rounded-2xl p-3 border border-indigo-100/50">
                        <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">Drift</div>
                        <div className="text-sm font-medium text-slate-800">{hermesResult.drift || 'None detected'}</div>
                      </div>
                      <div className="bg-white/60 rounded-2xl p-3 border border-indigo-100/50">
                        <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">Issues</div>
                        <div className="text-sm font-medium text-slate-800">{hermesResult.discrepancies.length}</div>
                      </div>
                    </div>
                    {hermesResult.discrepancies.length > 0 && (
                      <ul className="space-y-1.5 mb-3">
                        {hermesResult.discrepancies.map((d, i) => (
                          <li key={i} className="text-sm text-indigo-800 flex items-start gap-2">
                            <span className="mt-1.5 shrink-0 block w-1.5 h-1.5 rounded-full bg-indigo-400" />
                            {d}
                          </li>
                        ))}
                      </ul>
                    )}
                    {hermesResult.summary && (
                      <p className="text-sm text-indigo-700 italic">{hermesResult.summary}</p>
                    )}
                  </section>
                )}

                {hermesComment && (
                  <section className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                    <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-3">
                      <Sparkles className="w-4 h-4 text-amber-500" /> Hermes Says
                    </h2>
                    <p className="text-slate-700 text-sm leading-relaxed">{hermesComment}</p>
                  </section>
                )}

                {scanResult && (
                  <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm">
                    <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2 mb-6">
                      <Map className="w-5 h-5 text-indigo-500" /> Walkthrough Summary
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <div className="text-sm font-medium text-slate-500 mb-1">Overall Mess</div>
                        <span className={cn('px-2.5 py-0.5 rounded-full text-sm font-medium border', getBadgeColor(scanResult.houseScan.overallMessLevel))}>
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
                        {scanResult.houseScan.roomsSummary.map((room) => (
                          <div key={room.name} className="p-4 rounded-2xl border border-slate-200 hover:border-indigo-200 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-medium text-slate-900">{room.name}</h4>
                              <span className={cn('text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border', getBadgeColor(room.messLevel))}>
                                {room.messLevel}
                              </span>
                            </div>
                            <p className="text-sm text-slate-600"><span className="font-medium text-slate-900">{room.itemsOutOfPlace}</span> items out of place</p>
                            <p className="text-xs text-slate-500 mt-1">Clutter: {room.primaryClutterType}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                )}

                {scanResult && (
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
                                <div className="flex items-center gap-2 text-xs text-indigo-600/80 bg-indigo-50/50 px-3 py-2 rounded-xl flex-1 border border-indigo-100/50">
                                  <Info className="w-4 h-4 shrink-0" />
                                  <span className="line-clamp-2">{mission.funFact}</span>
                                </div>
                                {isAssigned ? (
                                  <div className="shrink-0 bg-green-50 text-green-700 px-4 py-2.5 rounded-xl flex items-center gap-2 border border-green-200 font-medium text-sm">
                                    <CheckSquare className="w-4 h-4" /> Assigned
                                  </div>
                                ) : (
                                  <form onSubmit={(e) => assignMission(mission, e)} className="shrink-0 flex items-center gap-2 w-full sm:w-auto">
                                    <select name="assignee" required className="w-full sm:w-32 text-sm px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500">
                                      <option value="">Assign to…</option>
                                      {childrenFilter.map((u: { id: string; name: string }) => (
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
                )}
              </div>
            )}

            {roomScans.length > 0 && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setShowHistory(h => !h)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
                >
                  <span className="font-semibold text-slate-900 flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-400" /> Scan History ({roomScans.length})
                  </span>
                  {showHistory ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {showHistory && (
                  <div className="px-6 pb-6 space-y-4 divide-y divide-slate-100">
                    {roomScans.slice(0, 10).map(scan => (
                      <div key={scan.id} className="pt-4 flex gap-4 items-start">
                        {scan.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={scan.imageUrl} alt="Scan" className="w-24 h-16 object-cover rounded-xl shrink-0 border border-slate-100" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-slate-400 mb-1">{format(scan.timestamp, 'MMM d, yyyy h:mm a')}</div>
                          {scan.hermesResult?.drift && (
                            <p className="text-sm text-slate-600"><span className="font-medium text-indigo-600">Drift:</span> {scan.hermesResult.drift}</p>
                          )}
                          {scan.hermesComment && (
                            <p className="text-sm text-slate-500 mt-1 line-clamp-2 italic">{scan.hermesComment}</p>
                          )}
                          <div className="text-xs text-slate-400 mt-1">{scan.missionCount} missions found</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!selectedRoom && !editMode && rooms.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400">
            <Camera className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Click a room on the floorplan to start scanning</p>
          </div>
        )}
      </div>
    </div>
  );
}
