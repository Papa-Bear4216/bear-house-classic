'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Camera, RefreshCw, Plus, Loader2, Sparkles, CheckSquare, Map,
  Clock, ShieldAlert, Zap, Info, AlertTriangle, Pencil, Check,
  History, ChevronDown, ChevronUp, Brain, ChevronRight, X, Wifi,
  Lock, Wallet, BrainCircuit,
} from 'lucide-react';
import Link from 'next/link';
import { authFetch } from '@/lib/api-client';
import { useTasks } from '@/hooks/use-tasks';
import { useFamilyMembers } from '@/hooks/use-family';
import { useFloorplan } from '@/hooks/use-floorplan';
import { useScans } from '@/hooks/use-scans';
import { useChorePins } from '@/hooks/use-chore-pins';
import { useRoomMemories } from '@/hooks/use-room-memories';
import { askHermes } from '@/lib/hermes';
import { Floorplan } from '@/components/Floorplan';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { FloorplanRoom } from '@/hooks/use-floorplan';
import type { HermesResult } from '@/hooks/use-scans';
import type { ChorePin } from '@/hooks/use-chore-pins';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useRoomDrift } from '@/hooks/use-room-drift';
import { useWyzeCameras } from '@/hooks/use-wyze-cameras';
import { suggestCameraForRoom } from '@/lib/camera-match';

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

function pinPosition(index: number, total: number, room: FloorplanRoom): { x: number; y: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
  const rows = Math.ceil(total / cols);
  const col = index % cols;
  const row = Math.floor(index / cols);
  const padX = Math.max(18, room.w * 0.15);
  const padY = Math.max(18, room.h * 0.2);
  const cellW = (room.w - padX * 2) / Math.max(cols, 1);
  const cellH = (room.h - padY * 2) / Math.max(rows, 1);
  return {
    x: Math.round(room.x + padX + cellW * (col + 0.5)),
    y: Math.round(room.y + padY + cellH * (row + 0.5)),
  };
}

export default function ScannerPage() {
  const { rooms, addRoom, updateRoom, deleteRoom } = useFloorplan();
  const { scans, saveScan } = useScans();
  const { pins, addPins, updatePinPosition, deletePin, clearRoomPins } = useChorePins();
  const { memories, setMemory } = useRoomMemories();
  const drifts = useRoomDrift(rooms);
  const [editMode, setEditMode] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<FloorplanRoom | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lockedRoomMessage, setLockedRoomMessage] = useState<string | null>(null);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [memorySaved, setMemorySaved] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrateMessage, setMigrateMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [frameBase64, setFrameBase64] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [isFetchingWyze, setIsFetchingWyze] = useState(false);
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
  const { cameras, loading: camerasLoading, error: camerasError } = useWyzeCameras();

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';
  const childrenFilter = users.filter((u: { role: string; isExempt?: boolean }) => u.role === 'child' && !u.isExempt);

  // Chore pin counts per room for badge display
  const choreCounts: Record<string, number> = {};
  pins.forEach(pin => { choreCounts[pin.roomId] = (choreCounts[pin.roomId] ?? 0) + 1; });

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
    if (selectedRoom && drawerOpen) startCamera();
    return () => { if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, [selectedRoom, drawerOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the selected room in sync with live floorplan data (e.g. after
  // picking a camera from the dropdown) instead of the stale click-time snapshot.
  useEffect(() => {
    if (!selectedRoom) return;
    const fresh = rooms.find(r => r.id === selectedRoom.id);
    if (fresh && fresh.cameraEntity !== selectedRoom.cameraEntity) setSelectedRoom(fresh);
  }, [rooms]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestedCamera = useMemo(() => {
    if (!selectedRoom || selectedRoom.cameraEntity || cameras.length === 0) return null;
    return suggestCameraForRoom(selectedRoom.name, cameras);
  }, [selectedRoom, cameras]);

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

  const captureFromWyze = useCallback(async (entity: string) => {
    setIsFetchingWyze(true);
    setError(null);
    try {
      const res = await authFetch(`/api/wyze/snapshot?entity=${encodeURIComponent(entity)}`);
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg ?? `Snapshot failed (${res.status})`);
      }
      const { image } = await res.json();
      setFrameBase64(image);
      if (stream) { stream.getTracks().forEach(t => t.stop()); setStream(null); }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch Wyze snapshot');
    } finally {
      setIsFetchingWyze(false);
    }
  }, [stream]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (room.restrictedToAdults && !isAdmin) {
      setLockedRoomMessage(`${room.name} is a parents-only room — ask a parent to open it for you.`);
      setTimeout(() => setLockedRoomMessage(null), 3500);
      return;
    }
    setLockedRoomMessage(null);
    setSelectedRoom(room);
    setMemoryDraft(memories[room.id]?.note ?? '');
    setMemorySaved(false);
    retake();
    setShowHistory(false);
    setDrawerOpen(true);
  };

  const saveMemory = async () => {
    if (!selectedRoom) return;
    await setMemory(selectedRoom.id, memoryDraft, currentUser?.name);
    setMemorySaved(true);
    setTimeout(() => setMemorySaved(false), 2000);
  };

  const runLayoutMigration = async () => {
    setMigrating(true);
    setMigrateMessage(null);
    try {
      const res = await authFetch('/api/admin/migrate-house-layout', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Migration failed');
      setMigrateMessage({
        type: 'success',
        text: data.changes?.length ? `Updated ${data.changes.length} room(s) to the corrected layout.` : (data.message ?? 'Already up to date.'),
      });
    } catch (e: unknown) {
      setMigrateMessage({ type: 'error', text: e instanceof Error ? e.message : 'Migration failed' });
    } finally {
      setMigrating(false);
      setTimeout(() => setMigrateMessage(null), 6000);
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    if (stream) stream.getTracks().forEach(t => t.stop());
    setStream(null);
    setTimeout(() => { setSelectedRoom(null); retake(); }, 300);
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

      // Place chore pins on floorplan
      if (missions && selectedRoom) {
        const allChores = missions.choreMissions.flatMap(m => m.relatedChores);
        const newPins: Omit<ChorePin, 'id'>[] = allChores.map((chore, i) => {
          const pos = pinPosition(i, allChores.length, selectedRoom);
          const rawPriority = chore.priority?.toLowerCase();
          const priority = (['high', 'medium', 'low'].includes(rawPriority) ? rawPriority : 'medium') as ChorePin['priority'];
          return {
            roomId: selectedRoom.id,
            roomName: selectedRoom.name,
            choreTitle: chore.choreTitle,
            priority,
            x: pos.x,
            y: pos.y,
            scanId: 'latest',
            movedByParent: false,
          };
        });
        try {
          await clearRoomPins(selectedRoom.id);
          if (newPins.length > 0) await addPins(newPins);
        } catch {
          // non-fatal
        }
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

  const handleMovePin = async (id: string, x: number, y: number) => {
    await updatePinPosition(id, x, y);
    const pin = pins.find(p => p.id === id);
    if (pin) {
      try {
        await askHermes([{
          role: 'user',
          content: `ADD TO MEMORY: Parent manually repositioned chore pin "${pin.choreTitle}" in ${pin.roomName}. Learn this correction for smarter future placements.`,
        }], { currentUser });
      } catch {
        // non-fatal
      }
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
        roomId: selectedRoom?.id,
      });
      // Remove matching pin from the map
      const match = pins.find(p =>
        p.roomId === selectedRoom?.id &&
        p.choreTitle.toLowerCase() === chore.choreTitle.toLowerCase()
      );
      if (match) deletePin(match.id);
    });
    setAssignedMissions(prev => new Set(prev).add(mission.missionId));
  };

  const roomScans = selectedRoom ? scans.filter(s => s.roomId === selectedRoom.id) : [];
  const roomPins = selectedRoom ? pins.filter(p => p.roomId === selectedRoom.id) : [];

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden relative">
      {/* Compact header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-blue-600" />
          <h1 className="font-semibold text-slate-900 text-base">Scanner & Floorplan</h1>
          {selectedRoom && !editMode && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full border border-blue-200">
              {selectedRoom.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedRoom && !editMode && (
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" /> Scan
            </button>
          )}
          {isAdmin && !editMode && (
            <button
              onClick={runLayoutMigration}
              disabled={migrating}
              title="Apply the corrected room names/layout to this household's existing floorplan data"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50"
            >
              {migrating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Sync Room Layout
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => { setEditMode(e => !e); setSelectedRoom(null); setDrawerOpen(false); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors',
                editMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              {editMode ? <><Check className="w-3.5 h-3.5" /> Done</> : <><Pencil className="w-3.5 h-3.5" /> Edit Layout</>}
            </button>
          )}
        </div>
      </header>
      {migrateMessage && (
        <div className={cn(
          'px-4 py-2 border-b text-xs flex items-center gap-1.5',
          migrateMessage.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-700'
        )}>
          {migrateMessage.type === 'success' ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {migrateMessage.text}
        </div>
      )}

      {/* Floorplan & Drift Panel — side-by-side on desktop */}
      <div className="flex-1 min-h-0 p-2 flex flex-col md:flex-row gap-2">
        <div className="relative flex-1 min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-2">
          <Floorplan
            rooms={rooms}
            selectedRoomId={selectedRoom?.id}
            choreCounts={choreCounts}
            editMode={editMode}
            onSelectRoom={selectRoom}
            onAddRoom={addRoom}
            onUpdateRoom={(id, patch) => updateRoom(id, patch)}
            onDeleteRoom={deleteRoom}
            pins={pins}
            canMovePin={isAdmin && !editMode}
            onMovePin={handleMovePin}
            drifts={drifts}
            restrictedUnlocked={isAdmin}
          />
          {lockedRoomMessage && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-3 py-2 rounded-full flex items-center gap-1.5 shadow-lg z-20 animate-in fade-in slide-in-from-bottom-2">
              <Lock className="w-3.5 h-3.5 text-amber-400" /> {lockedRoomMessage}
            </div>
          )}
        </div>

        {/* Drift & Forecasting Panel */}
        {!editMode && rooms.length > 0 && (
          <div className="w-full md:w-80 shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-y-auto p-4 flex flex-col gap-3 max-h-[30vh] md:max-h-none">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                <Brain className="w-4 h-4 text-blue-600 animate-pulse" />
                Drift & Forecasting
              </h2>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full font-bold border border-emerald-200">
                1.5x Streak 🔥
              </span>
            </div>

            <div className="space-y-3">
              {rooms.map(room => {
                const drift = drifts[room.id] || { cleanliness: 100, driftScore: 0, status: 'clean', forecastMessage: 'All clear' };
                const isSelected = room.id === selectedRoom?.id;
                
                const barColor = 
                  drift.status === 'clean' ? 'bg-emerald-500' :
                  drift.status === 'drifting' ? 'bg-amber-500' : 'bg-red-500';

                const statusText = 
                  drift.status === 'clean' ? 'Spic & Span' :
                  drift.status === 'drifting' ? 'Drifting' : 'Cluttered';

                const badgeStyle = 
                  drift.status === 'clean' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  drift.status === 'drifting' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200';

                return (
                  <div 
                    key={room.id}
                    onClick={() => selectRoom(room)}
                    className={cn(
                      "p-2.5 rounded-xl border transition-all cursor-pointer hover:border-blue-300 hover:bg-slate-50",
                      isSelected ? "border-blue-500 bg-blue-50/30" : "border-slate-100 bg-white"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-medium text-slate-800 text-xs truncate">{room.name}</span>
                      <span className={cn("text-[9px] px-1.5 py-0.5 rounded-md font-semibold border", badgeStyle)}>
                        {statusText} ({drift.driftScore}%)
                      </span>
                    </div>

                    <div className="w-full bg-slate-100 rounded-full h-1.5 mb-1.5 overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all duration-500", barColor)} style={{ width: `${drift.driftScore}%` }} />
                    </div>

                    <div className="text-[10px] text-slate-400 flex items-center justify-between">
                      <span>Forecast:</span>
                      <span className={cn("font-medium", drift.status === 'messy' ? 'text-red-500' : 'text-slate-500')}>
                        {drift.forecastMessage}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {editMode && (
        <p className="px-4 pb-2 text-xs text-slate-400 flex items-center gap-1.5 shrink-0">
          <Info className="w-3.5 h-3.5" />
          Drag to draw rooms · Move/resize rooms · Select then ✕ to delete
        </p>
      )}

      {!selectedRoom && !editMode && rooms.length > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-800/75 backdrop-blur text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 pointer-events-none">
          <Map className="w-3.5 h-3.5" /> Tap a room to scan it
        </div>
      )}

      {/* Slide-up camera / scan drawer */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl border-t border-slate-200 z-50',
          'transition-transform duration-300 ease-out',
          drawerOpen && selectedRoom ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ maxHeight: '72vh', overflowY: 'auto' }}
      >
        {/* Drawer header */}
        <div className="sticky top-0 bg-white pt-3 pb-2 px-4 border-b border-slate-100 z-10">
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
              <Camera className="w-4 h-4 text-blue-500" />
              Scanning: <span className="text-blue-600">{selectedRoom?.name}</span>
            </h2>
            <button onClick={closeDrawer} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          {isAdmin && selectedRoom && (
            <div className="mt-2 flex items-center gap-2">
              <Wifi className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
              {camerasLoading ? (
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading cameras…
                </span>
              ) : camerasError ? (
                <input
                  type="text"
                  placeholder="Wyze entity (e.g. camera.kitchen_wyze)"
                  defaultValue={selectedRoom.cameraEntity ?? ''}
                  onBlur={e => {
                    const val = e.target.value.trim();
                    if (val !== (selectedRoom.cameraEntity ?? '')) {
                      updateRoom(selectedRoom.id, { cameraEntity: val || undefined });
                    }
                  }}
                  className="flex-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 text-slate-700 placeholder-slate-400"
                />
              ) : (
                <>
                  <select
                    value={selectedRoom.cameraEntity ?? ''}
                    onChange={e => updateRoom(selectedRoom.id, { cameraEntity: e.target.value || undefined })}
                    className="flex-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 text-slate-700 bg-white"
                  >
                    <option value="">No camera linked</option>
                    {cameras.map(cam => (
                      <option key={cam.entityId} value={cam.entityId}>{cam.name}</option>
                    ))}
                  </select>
                  {suggestedCamera && (
                    <button
                      type="button"
                      onClick={() => updateRoom(selectedRoom.id, { cameraEntity: suggestedCamera.entityId })}
                      className="shrink-0 text-xs px-2 py-1.5 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-lg hover:bg-cyan-100 font-medium whitespace-nowrap"
                    >
                      Use {suggestedCamera.name}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="p-4 space-y-4 pb-8">
          {/* Linked feature deep-link (e.g. Master Walk-In Closet -> Budget & Banking) */}
          {selectedRoom?.linkedFeature && isAdmin && (
            <Link
              href={selectedRoom.linkedFeature}
              className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 text-emerald-800 text-sm font-medium hover:bg-emerald-100 transition-colors"
            >
              <Wallet className="w-4 h-4 shrink-0" />
              Open Budget & Banking
              <ChevronRight className="w-3.5 h-3.5 ml-auto" />
            </Link>
          )}

          {/* Memory notes — personal notes tied to this room ("mind palace") */}
          {selectedRoom && selectedRoom.color === '#ffedd5' && (
            <section className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
              <h2 className="text-sm font-semibold text-purple-900 flex items-center gap-2 mb-2">
                <BrainCircuit className="w-4 h-4 text-purple-500" /> Memory Notes
              </h2>
              <textarea
                value={memoryDraft}
                onChange={e => setMemoryDraft(e.target.value)}
                placeholder="Personal notes, preferences, reminders for whoever's room this is…"
                rows={3}
                className="w-full text-sm px-3 py-2 border border-purple-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
              />
              <div className="mt-2 flex items-center justify-between">
                {memories[selectedRoom.id]?.updatedBy && (
                  <span className="text-[11px] text-purple-500">Last updated by {memories[selectedRoom.id]!.updatedBy}</span>
                )}
                <button
                  onClick={saveMemory}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl transition-colors"
                >
                  {memorySaved ? <><Check className="w-3.5 h-3.5" /> Saved</> : 'Save'}
                </button>
              </div>
            </section>
          )}

          {/* Camera / captured frame */}
          <div className="bg-black rounded-2xl overflow-hidden relative shadow-lg ring-1 ring-slate-900/10">
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
                  <div className="absolute bottom-6 left-0 right-0 flex justify-center items-center gap-4 z-10">
                    {selectedRoom?.cameraEntity && (
                      <button
                        onClick={() => captureFromWyze(selectedRoom.cameraEntity!)}
                        disabled={isFetchingWyze}
                        className="px-3 py-2 bg-cyan-500/80 hover:bg-cyan-500 backdrop-blur-md rounded-full text-white text-xs font-medium flex items-center gap-1.5 shadow-lg disabled:opacity-50 transition-colors"
                      >
                        {isFetchingWyze ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                        Wyze
                      </button>
                    )}
                    <button
                      onClick={captureFrame}
                      className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-full border-4 border-white flex items-center justify-center hover:scale-105 transition-transform shadow-xl active:scale-95"
                    >
                      <div className="w-10 h-10 bg-white rounded-full" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative aspect-video w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={frameBase64} alt="Captured" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex gap-3 justify-center">
                  <button onClick={retake} className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full text-white font-medium flex items-center gap-2 text-sm">
                    <RefreshCw className="w-4 h-4" /> Retake
                  </button>
                  {!isAnalyzing && !scanResult && (
                    <button onClick={() => analyzeImage()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-full text-white font-medium flex items-center gap-2 text-sm shadow-lg">
                      <Sparkles className="w-4 h-4" /> Analyze Room
                    </button>
                  )}
                  {!isAnalyzing && scanResult && !usedPro && (
                    <button onClick={() => analyzeImage('gemini-2.5-pro')} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-full text-white font-medium flex items-center gap-2 text-sm shadow-lg">
                      <Zap className="w-4 h-4" /> Re-scan Pro
                    </button>
                  )}
                </div>
                {isSaving && (
                  <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1.5">
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
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center text-slate-500 space-y-3">
              <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
              <p className="font-medium text-sm animate-pulse">Analyzing {selectedRoom?.name} with AI…</p>
            </div>
          )}

          {(scanResult || hermesResult || hermesComment) && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">

              {/* Pin placement confirmation */}
              {roomPins.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-blue-800 text-sm">
                  <Map className="w-4 h-4 shrink-0" />
                  <span>
                    <strong>{roomPins.length} pins</strong> placed on floorplan.
                    {isAdmin && ' Drag them to reposition.'}
                  </span>
                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    {isAdmin && (
                      <button
                        onClick={() => selectedRoom && clearRoomPins(selectedRoom.id)}
                        className="flex items-center gap-1 text-red-500 font-medium text-xs hover:text-red-700"
                      >
                        <X className="w-3 h-3" /> Clear
                      </button>
                    )}
                    <button onClick={closeDrawer} className="flex items-center gap-1 text-blue-600 font-medium text-xs hover:text-blue-800">
                      View map <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {hermesResult && (
                <section className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-4 border border-indigo-100">
                  <h2 className="text-sm font-semibold text-indigo-900 flex items-center gap-2 mb-3">
                    <Brain className="w-4 h-4 text-indigo-500" /> Hermes Memory
                  </h2>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[['Status', hermesResult.status], ['Drift', hermesResult.drift || 'None'], ['Issues', String(hermesResult.discrepancies.length)]].map(([label, val]) => (
                      <div key={label} className="bg-white/60 rounded-xl p-2 border border-indigo-100/50">
                        <div className="text-[10px] font-semibold text-indigo-600 uppercase mb-0.5">{label}</div>
                        <div className="text-xs font-medium text-slate-800">{val}</div>
                      </div>
                    ))}
                  </div>
                  {hermesResult.summary && <p className="text-xs text-indigo-700 italic">{hermesResult.summary}</p>}
                </section>
              )}

              {hermesComment && (
                <section className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                  <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-amber-500" /> Hermes Says
                  </h2>
                  <p className="text-slate-700 text-sm leading-relaxed">{hermesComment}</p>
                </section>
              )}

              {scanResult && (
                <section className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div className="text-xs font-medium text-slate-500 mb-1">Overall Mess</div>
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', getBadgeColor(scanResult.houseScan.overallMessLevel))}>
                        {scanResult.houseScan.overallMessLevel.toUpperCase()}
                      </span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div className="text-xs font-medium text-slate-500 mb-1">Chores Found</div>
                      <div className="text-xl font-semibold text-indigo-600">{scanResult.houseScan.totalChoresIdentified}</div>
                    </div>
                  </div>
                </section>
              )}

              {scanResult && (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" /> Recommended Missions
                  </h2>
                  {scanResult.choreMissions.map((mission) => {
                    const isAssigned = assignedMissions.has(mission.missionId);
                    return (
                      <div key={mission.missionId} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 opacity-[0.03] rotate-12 scale-150 pointer-events-none">
                          <ShieldAlert className="w-24 h-24" />
                        </div>
                        <div className="flex justify-between items-start gap-3 mb-2">
                          <h3 className="font-bold text-slate-900 text-sm leading-tight">{mission.missionName}</h3>
                          <span className="shrink-0 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg text-xs font-semibold flex items-center gap-1 border border-blue-100">
                            <Clock className="w-3 h-3" /> {mission.totalTimeEstimate}
                          </span>
                        </div>
                        <p className="text-slate-600 text-xs mb-3">{mission.description}</p>
                        <ul className="space-y-1 mb-4">
                          {mission.relatedChores.map(chore => (
                            <li key={chore.choreId} className="text-xs flex items-start gap-2">
                              <span className="mt-1.5 shrink-0 block w-1.5 h-1.5 rounded-full bg-amber-400" />
                              <span>
                                <span className="font-medium text-slate-800">{chore.choreTitle}</span>
                                <span className="text-slate-500 ml-1">({chore.estimatedTime})</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                        <div className="flex gap-2 items-center pt-3 border-t border-slate-100">
                          <div className="flex items-start gap-1.5 text-xs text-indigo-600/80 bg-indigo-50/50 px-2.5 py-1.5 rounded-xl flex-1 border border-indigo-100/50">
                            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{mission.funFact}</span>
                          </div>
                          {isAssigned ? (
                            <div className="shrink-0 bg-green-50 text-green-700 px-3 py-1.5 rounded-xl flex items-center gap-1.5 border border-green-200 font-medium text-xs">
                              <CheckSquare className="w-3.5 h-3.5" /> Assigned
                            </div>
                          ) : (
                            <form onSubmit={(e) => assignMission(mission, e)} className="shrink-0 flex items-center gap-1.5">
                              <select name="assignee" required className="text-xs px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">Assign…</option>
                                {childrenFilter.map((u: { id: string; name: string }) => (
                                  <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                              </select>
                              <button type="submit" className="p-1.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800">
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </section>
              )}

              {roomScans.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <button
                    onClick={() => setShowHistory(h => !h)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50"
                  >
                    <span className="font-semibold text-slate-900 text-xs flex items-center gap-2">
                      <History className="w-3.5 h-3.5 text-slate-400" /> Scan History ({roomScans.length})
                    </span>
                    {showHistory ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>
                  {showHistory && (
                    <div className="px-4 pb-4 space-y-3 divide-y divide-slate-100">
                      {roomScans.slice(0, 10).map(scan => (
                        <div key={scan.id} className="pt-3 flex gap-3 items-start">
                          {scan.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={scan.imageUrl} alt="Scan" className="w-16 h-12 object-cover rounded-xl shrink-0 border border-slate-100" />
                          )}
                          <div className="min-w-0">
                            <div className="text-xs text-slate-400 mb-1">{format(scan.timestamp, 'MMM d, yyyy h:mm a')}</div>
                            {scan.hermesResult?.drift && (
                              <p className="text-xs text-slate-600"><span className="font-medium text-indigo-600">Drift:</span> {scan.hermesResult.drift}</p>
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
        </div>
      </div>
    </div>
  );
}
