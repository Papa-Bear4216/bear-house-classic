'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, Maximize2, Layers } from 'lucide-react';
import type { FloorplanRoom } from '@/hooks/use-floorplan';
import type { ChorePin } from '@/hooks/use-chore-pins';

const VB_W = 1000;
const VB_H = 580;
const MIN_SIZE = 80;
const HANDLE_R = 7;
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 1.4;

const PIN_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
};

type Corner = 'tl' | 'tr' | 'bl' | 'br';

type Drag =
  | { type: 'idle' }
  | { type: 'draw'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'move'; id: string; startX: number; startY: number; origX: number; origY: number }
  | { type: 'resize'; id: string; corner: Corner; startX: number; startY: number; orig: FloorplanRoom }
  | { type: 'pan'; startSX: number; startSY: number; origPan: { x: number; y: number } }
  | { type: 'pin'; pinId: string };

interface Props {
  rooms: FloorplanRoom[];
  selectedRoomId?: string;
  choreCounts?: Record<string, number>;
  editMode: boolean;
  onSelectRoom: (room: FloorplanRoom) => void;
  onAddRoom: (name: string, x: number, y: number, w: number, h: number) => void;
  onUpdateRoom: (id: string, patch: Partial<FloorplanRoom>) => void;
  onDeleteRoom: (id: string) => void;
  pins?: ChorePin[];
  canMovePin?: boolean;
  onMovePin?: (id: string, x: number, y: number) => void;
  drifts?: Record<string, any>;
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

export function Floorplan({
  rooms, selectedRoomId, choreCounts = {}, editMode,
  onSelectRoom, onAddRoom, onUpdateRoom, onDeleteRoom,
  pins = [], canMovePin = false, onMovePin, drifts = {},
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag>({ type: 'idle' });
  const [localRooms, setLocalRooms] = useState<FloorplanRoom[]>(rooms);
  const [localPins, setLocalPins] = useState<ChorePin[]>(pins);
  const [naming, setNaming] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredPin, setHoveredPin] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('3d');

  const currentViewMode = editMode ? '2d' : viewMode;
  const finalCanMovePin = canMovePin && currentViewMode === '2d';

  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  zoomRef.current = zoom;
  panRef.current = pan;

  useEffect(() => { setLocalRooms(rooms); }, [rooms]);
  useEffect(() => { setLocalPins(pins); }, [pins]);

  const vbW = VB_W / zoom;
  const vbH = VB_H / zoom;
  const viewBox = `${pan.x} ${pan.y} ${vbW} ${vbH}`;

  // Isometric projection helper
  const toIso = (x: number, y: number) => {
    const cx = VB_W / 2;
    const cy = VB_H / 6;
    const scale = 0.65;
    return {
      x: cx + (x - y) * 0.866 * scale,
      y: cy + (x + y) * 0.5 * scale,
    };
  };

  function toVB(e: React.MouseEvent | MouseEvent): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const vw = VB_W / zoomRef.current;
    const vh = VB_H / zoomRef.current;
    return {
      x: clamp(panRef.current.x + ((e.clientX - rect.left) / rect.width) * vw, 0, VB_W),
      y: clamp(panRef.current.y + ((e.clientY - rect.top) / rect.height) * vh, 0, VB_H),
    };
  }

  const clampPan = useCallback((p: { x: number; y: number }, z: number) => ({
    x: clamp(p.x, 0, Math.max(0, VB_W - VB_W / z)),
    y: clamp(p.y, 0, Math.max(0, VB_H - VB_H / z)),
  }), []);

  const zoomIn = useCallback(() => {
    setZoom(z => {
      const nz = Math.min(MAX_ZOOM, z * ZOOM_STEP);
      setPan(p => clampPan(p, nz));
      return nz;
    });
  }, [clampPan]);

  const zoomOut = useCallback(() => {
    setZoom(z => {
      const nz = Math.max(MIN_ZOOM, z / ZOOM_STEP);
      if (nz <= MIN_ZOOM) setPan({ x: 0, y: 0 });
      else setPan(p => clampPan(p, nz));
      return nz;
    });
  }, [clampPan]);

  const resetZoom = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  const onSvgMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const pt = toVB(e);

    if (!editMode && finalCanMovePin) {
      const hitPin = [...localPins].reverse().find(p => Math.hypot(p.x - pt.x, p.y - pt.y) <= 12);
      if (hitPin) { setDrag({ type: 'pin', pinId: hitPin.id }); return; }
    }

    if (editMode) {
      const hit = [...localRooms].reverse().find(r =>
        pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h
      );
      if (hit) {
        setDrag({ type: 'move', id: hit.id, startX: pt.x, startY: pt.y, origX: hit.x, origY: hit.y });
      } else {
        setDrag({ type: 'draw', x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
      }
    } else {
      setDrag({ type: 'pan', startSX: e.clientX, startSY: e.clientY, origPan: { ...panRef.current } });
    }
  }, [editMode, localRooms, localPins, finalCanMovePin]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSvgMouseMove = useCallback((e: React.MouseEvent) => {
    if (drag.type === 'idle') return;
    e.preventDefault();
    const pt = toVB(e);

    if (drag.type === 'draw') {
      setDrag(d => d.type === 'draw' ? { ...d, x1: pt.x, y1: pt.y } : d);
    } else if (drag.type === 'move') {
      const dx = pt.x - drag.startX;
      const dy = pt.y - drag.startY;
      setLocalRooms(prev => prev.map(r => {
        if (r.id !== drag.id) return r;
        return { ...r, x: clamp(drag.origX + dx, 0, VB_W - r.w), y: clamp(drag.origY + dy, 0, VB_H - r.h) };
      }));
    } else if (drag.type === 'resize') {
      const { orig, corner } = drag;
      const dx = pt.x - drag.startX;
      const dy = pt.y - drag.startY;
      let { x, y, w, h } = orig;
      if (corner === 'tl') {
        x = clamp(orig.x + dx, 0, orig.x + orig.w - MIN_SIZE);
        y = clamp(orig.y + dy, 0, orig.y + orig.h - MIN_SIZE);
        w = orig.w + (orig.x - x); h = orig.h + (orig.y - y);
      } else if (corner === 'tr') {
        w = clamp(orig.w + dx, MIN_SIZE, VB_W - orig.x);
        y = clamp(orig.y + dy, 0, orig.y + orig.h - MIN_SIZE);
        h = orig.h + (orig.y - y);
      } else if (corner === 'bl') {
        x = clamp(orig.x + dx, 0, orig.x + orig.w - MIN_SIZE);
        w = orig.w + (orig.x - x); h = clamp(orig.h + dy, MIN_SIZE, VB_H - orig.y);
      } else {
        w = clamp(orig.w + dx, MIN_SIZE, VB_W - orig.x);
        h = clamp(orig.h + dy, MIN_SIZE, VB_H - orig.y);
      }
      setLocalRooms(prev => prev.map(r => r.id === drag.id ? { ...r, x, y, w, h } : r));
    } else if (drag.type === 'pan') {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = (VB_W / zoomRef.current) / rect.width;
      const scaleY = (VB_H / zoomRef.current) / rect.height;
      const nx = drag.origPan.x - (e.clientX - drag.startSX) * scaleX;
      const ny = drag.origPan.y - (e.clientY - drag.startSY) * scaleY;
      setPan(clampPan({ x: nx, y: ny }, zoomRef.current));
    } else if (drag.type === 'pin') {
      setLocalPins(prev => prev.map(p => p.id === drag.pinId ? { ...p, x: pt.x, y: pt.y } : p));
    }
  }, [drag, clampPan]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSvgMouseUp = useCallback(() => {
    if (drag.type === 'draw') {
      const x = Math.min(drag.x0, drag.x1);
      const y = Math.min(drag.y0, drag.y1);
      const w = Math.abs(drag.x1 - drag.x0);
      const h = Math.abs(drag.y1 - drag.y0);
      if (w >= MIN_SIZE && h >= MIN_SIZE) { setNaming({ x, y, w, h }); setNameInput(''); }
    } else if (drag.type === 'move') {
      const room = localRooms.find(r => r.id === drag.id);
      if (room) onUpdateRoom(drag.id, { x: room.x, y: room.y });
    } else if (drag.type === 'resize') {
      const room = localRooms.find(r => r.id === drag.id);
      if (room) onUpdateRoom(drag.id, { x: room.x, y: room.y, w: room.w, h: room.h });
    } else if (drag.type === 'pin') {
      const pin = localPins.find(p => p.id === drag.pinId);
      if (pin) onMovePin?.(pin.id, pin.x, pin.y);
    }
    setDrag({ type: 'idle' });
  }, [drag, localRooms, localPins, onUpdateRoom, onMovePin]);

  const startResize = (e: React.MouseEvent, room: FloorplanRoom, corner: Corner) => {
    e.stopPropagation();
    const pt = toVB(e);
    setDrag({ type: 'resize', id: room.id, corner, startX: pt.x, startY: pt.y, orig: { ...room } });
  };

  const confirmRoom = () => {
    if (!naming || !nameInput.trim()) return;
    onAddRoom(nameInput.trim(), naming.x, naming.y, naming.w, naming.h);
    setNaming(null);
  };

  const drawRect = drag.type === 'draw' ? {
    x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1),
    w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0),
  } : null;

  const selectedRoom = localRooms.find(r => r.id === selectedRoomId);

  return (
    <div className="relative select-none h-full flex flex-col">
      {/* Zoom and view toggle controls */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        {!editMode && (
          <button
            onClick={() => setViewMode(v => v === '2d' ? '3d' : '2d')}
            className={`w-8 h-8 rounded-lg shadow-sm flex items-center justify-center border transition-colors ${
              viewMode === '3d'
                ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                : 'bg-white/90 border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            title={viewMode === '3d' ? 'Switch to 2D Blueprint' : 'Switch to 3D Dollhouse'}
          >
            <Layers className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={zoomIn}
          className="w-8 h-8 bg-white/90 backdrop-blur border border-slate-200 rounded-lg shadow-sm flex items-center justify-center hover:bg-slate-50 transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4 text-slate-600" />
        </button>
        <button
          onClick={zoomOut}
          disabled={zoom <= MIN_ZOOM}
          className="w-8 h-8 bg-white/90 backdrop-blur border border-slate-200 rounded-lg shadow-sm flex items-center justify-center hover:bg-slate-50 transition-colors disabled:opacity-40"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4 text-slate-600" />
        </button>
        {zoom > 1 && (
          <button
            onClick={resetZoom}
            className="w-8 h-8 bg-white/90 backdrop-blur border border-slate-200 rounded-lg shadow-sm flex items-center justify-center hover:bg-slate-50 transition-colors"
            title="Reset zoom"
          >
            <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
          </button>
        )}
      </div>

      {/* Pin legend */}
      {pins.length > 0 && (
        <div className="absolute top-2 left-2 z-10 flex gap-2 bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
          {([['high', '#ef4444', 'High'], ['medium', '#f59e0b', 'Med'], ['low', '#22c55e', 'Low']] as [string, string, string][])
            .filter(([k]) => pins.some(p => p.priority === k))
            .map(([k, c, l]) => (
              <span key={k} className="flex items-center gap-1 text-[10px] font-medium text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: c }} />
                {l}
              </span>
            ))}
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={viewBox}
        className={`w-full flex-1 rounded-2xl border border-slate-200 bg-slate-50 ${
          editMode ? 'cursor-crosshair'
          : drag.type === 'pan' ? 'cursor-grabbing'
          : zoom > 1 ? 'cursor-grab'
          : 'cursor-pointer'
        }`}
        style={{ touchAction: 'none', display: 'block' }}
        onMouseDown={onSvgMouseDown}
        onMouseMove={onSvgMouseMove}
        onMouseUp={onSvgMouseUp}
        onMouseLeave={onSvgMouseUp}
      >
        <style>
          {`
            @keyframes bounce3d {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-8px); }
            }
            @keyframes floatCloud {
              0%, 100% { transform: translateY(0) scale(1); opacity: 0.6; }
              50% { transform: translateY(-4px) scale(1.08); opacity: 0.85; }
            }
            .bounce-pin {
              animation: bounce3d 2s infinite ease-in-out;
              transform-origin: center;
            }
            .float-cloud {
              animation: floatCloud 3s infinite ease-in-out;
              transform-origin: center;
            }
          `}
        </style>
        <defs>
          <pattern id="fp-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
          </pattern>
        </defs>
        {currentViewMode === '2d' && <rect width={VB_W} height={VB_H} fill="url(#fp-grid)" />}
        {currentViewMode === '3d' && <rect width={VB_W} height={VB_H} fill="#f8fafc" />}

        {/* Rooms */}
        {localRooms.map(room => {
          const isSelected = room.id === selectedRoomId;
          const count = choreCounts[room.id] ?? 0;
          const drift = drifts[room.id] || { cleanliness: 100, driftScore: 0, status: 'clean', forecastMessage: 'All clear' };

          if (currentViewMode === '3d') {
            const p0 = toIso(room.x, room.y);
            const p1 = toIso(room.x + room.w, room.y);
            const p2 = toIso(room.x + room.w, room.y + room.h);
            const p3 = toIso(room.x, room.y + room.h);
            const wallH = 26;

            const textX = (p0.x + p2.x) / 2;
            const textY = (p0.y + p2.y) / 2;
            const fontSize = Math.min(Math.floor(room.w / (room.name.length * 0.5)), 14, Math.floor(room.h / 5));

            // Shading overlays
            const leftWallColor = '#000000';
            const rightWallColor = '#000000';

            return (
              <g
                key={room.id}
                onClick={(e) => { e.stopPropagation(); if (drag.type === 'idle') onSelectRoom(room); }}
                style={{ cursor: 'pointer' }}
              >
                {/* 3D Right Wall Face */}
                <polygon
                  points={`${p2.x},${p2.y} ${p1.x},${p1.y} ${p1.x},${p1.y + wallH} ${p2.x},${p2.y + wallH}`}
                  fill={room.color}
                  stroke={isSelected ? '#2563eb' : '#94a3b8'}
                  strokeWidth={0.5}
                />
                <polygon
                  points={`${p2.x},${p2.y} ${p1.x},${p1.y} ${p1.x},${p1.y + wallH} ${p2.x},${p2.y + wallH}`}
                  fill={rightWallColor}
                  fillOpacity={0.24}
                  style={{ pointerEvents: 'none' }}
                />

                {/* 3D Left Wall Face */}
                <polygon
                  points={`${p3.x},${p3.y} ${p2.x},${p2.y} ${p2.x},${p2.y + wallH} ${p3.x},${p3.y + wallH}`}
                  fill={room.color}
                  stroke={isSelected ? '#2563eb' : '#94a3b8'}
                  strokeWidth={0.5}
                />
                <polygon
                  points={`${p3.x},${p3.y} ${p2.x},${p2.y} ${p2.x},${p2.y + wallH} ${p3.x},${p3.y + wallH}`}
                  fill={leftWallColor}
                  fillOpacity={0.12}
                  style={{ pointerEvents: 'none' }}
                />

                {/* 3D Top Floor Face */}
                <polygon
                  points={`${p0.x},${p0.y} ${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`}
                  fill={room.color}
                  fillOpacity={0.88}
                  stroke={isSelected ? '#2563eb' : '#94a3b8'}
                  strokeWidth={isSelected ? 2.5 : 1}
                />

                {/* Text name floating on floor */}
                <text
                  x={textX} y={textY}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={Math.max(fontSize, 9)}
                  fill="#1e293b" fontWeight="600"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {room.name}
                </text>

                {/* Animated Dust Cloud if room is cluttered */}
                {drift.status === 'messy' && (
                  <g className="float-cloud" style={{ pointerEvents: 'none' }}>
                    <path
                      d={`M ${textX - 12} ${textY - 20} 
                          a 8 8 0 0 1 12 -6 
                          a 10 10 0 0 1 14 2 
                          a 8 8 0 0 1 2 12 
                          a 6 6 0 0 1 -8 6 
                          l -16 0 
                          a 6 6 0 0 1 -4 -14 z`}
                      fill="#94a3b8"
                      fillOpacity={0.6}
                    />
                    <circle cx={textX - 10} cy={textY - 24} r={1.5} fill="#475569" fillOpacity={0.5} />
                    <circle cx={textX + 12} cy={textY - 26} r={2} fill="#475569" fillOpacity={0.5} />
                  </g>
                )}

                {/* Chore notifications badge */}
                {count > 0 && (
                  <g style={{ pointerEvents: 'none' }}>
                    <circle cx={p1.x - 14} cy={p1.y + 14} r={10} fill="#ef4444" />
                    <text
                      x={p1.x - 14} y={p1.y + 14}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={8} fill="white" fontWeight="bold"
                      style={{ userSelect: 'none' }}
                    >
                      {count > 9 ? '9+' : count}
                    </text>
                  </g>
                )}
              </g>
            );
          } else {
            const fontSize = Math.min(Math.floor(room.w / (room.name.length * 0.65)), 20, Math.floor(room.h / 4));
            return (
              <g
                key={room.id}
                onClick={(e) => { e.stopPropagation(); if (!editMode || drag.type === 'idle') onSelectRoom(room); }}
                style={{ cursor: editMode ? 'move' : 'pointer' }}
              >
                <rect
                  x={room.x} y={room.y} width={room.w} height={room.h}
                  fill={room.color}
                  stroke={isSelected ? '#2563eb' : '#94a3b8'}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  rx={6}
                />
                <text
                  x={room.x + room.w / 2} y={room.y + room.h / 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={Math.max(fontSize, 10)}
                  fill="#1e293b" fontWeight="600"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {room.name}
                </text>
                {count > 0 && (
                  <g style={{ pointerEvents: 'none' }}>
                    <circle cx={room.x + room.w - 14} cy={room.y + 14} r={12} fill="#ef4444" />
                    <text
                      x={room.x + room.w - 14} y={room.y + 14}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={9} fill="white" fontWeight="bold"
                      style={{ userSelect: 'none' }}
                    >
                      {count > 9 ? '9+' : count}
                    </text>
                  </g>
                )}
                {editMode && isSelected && (
                  <>
                    {(['tl', 'tr', 'bl', 'br'] as Corner[]).map(corner => {
                      const cx = corner.endsWith('l') ? room.x : room.x + room.w;
                      const cy = corner.startsWith('t') ? room.y : room.y + room.h;
                      return (
                        <rect
                          key={corner}
                          x={cx - HANDLE_R} y={cy - HANDLE_R}
                          width={HANDLE_R * 2} height={HANDLE_R * 2}
                          fill="white" stroke="#2563eb" strokeWidth={1.5} rx={2}
                          style={{ cursor: corner === 'tl' || corner === 'br' ? 'nwse-resize' : 'nesw-resize' }}
                          onMouseDown={e => startResize(e, room, corner)}
                        />
                      );
                    })}
                  </>
                )}
              </g>
            );
          }
        })}

        {/* Chore pins */}
        {!editMode && localPins.map(pin => {
          const color = PIN_COLORS[pin.priority] ?? '#94a3b8';
          const isHovered = hoveredPin === pin.id;
          const label = pin.choreTitle.length > 22 ? pin.choreTitle.slice(0, 20) + '…' : pin.choreTitle;
          const labelW = label.length * 6.5 + 16;

          if (currentViewMode === '3d') {
            const pos = toIso(pin.x, pin.y);
            const px = pos.x;
            const py = pos.y - 12;

            return (
              <g
                key={pin.id}
                className="bounce-pin"
                onMouseEnter={() => setHoveredPin(pin.id)}
                onMouseLeave={() => setHoveredPin(null)}
                style={{ cursor: 'default' }}
              >
                <circle cx={px + 1} cy={py + 2} r={9} fill="rgba(0,0,0,0.15)" />
                <circle cx={px} cy={py} r={9} fill={color} stroke="white" strokeWidth={2} />
                <text
                  x={px} y={py}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={8} fill="white" fontWeight="bold"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {pin.priority === 'high' ? '!' : pin.priority === 'medium' ? '~' : '✓'}
                </text>
                {isHovered && (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect x={px - labelW / 2} y={py - 32} width={labelW} height={20} rx={4} fill="rgba(15,23,42,0.85)" />
                    <text x={px} y={py - 20} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="white" style={{ userSelect: 'none' }}>
                      {label}
                    </text>
                  </g>
                )}
              </g>
            );
          } else {
            return (
              <g
                key={pin.id}
                style={{ cursor: finalCanMovePin ? 'grab' : 'default' }}
                onMouseEnter={() => setHoveredPin(pin.id)}
                onMouseLeave={() => setHoveredPin(null)}
                onMouseDown={e => {
                  if (!finalCanMovePin) return;
                  e.stopPropagation();
                  setDrag({ type: 'pin', pinId: pin.id });
                }}
              >
                <circle cx={pin.x + 1} cy={pin.y + 2} r={9} fill="rgba(0,0,0,0.15)" />
                <circle cx={pin.x} cy={pin.y} r={9} fill={color} stroke="white" strokeWidth={2} />
                <text
                  x={pin.x} y={pin.y}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={8} fill="white" fontWeight="bold"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {pin.priority === 'high' ? '!' : pin.priority === 'medium' ? '~' : '✓'}
                </text>
                {isHovered && (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect x={pin.x - labelW / 2} y={pin.y - 32} width={labelW} height={20} rx={4} fill="rgba(15,23,42,0.85)" />
                    <text x={pin.x} y={pin.y - 20} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="white" style={{ userSelect: 'none' }}>
                      {label}
                    </text>
                  </g>
                )}
              </g>
            );
          }
        })}

        {/* Draw preview */}
        {drawRect && drawRect.w > 4 && drawRect.h > 4 && (
          <rect
            x={drawRect.x} y={drawRect.y} width={drawRect.w} height={drawRect.h}
            fill="#bfdbfe" fillOpacity={0.5}
            stroke="#2563eb" strokeWidth={1.5} strokeDasharray="8 4" rx={6}
          />
        )}

        {localRooms.length === 0 && (
          <text x={VB_W / 2} y={VB_H / 2} textAnchor="middle" dominantBaseline="middle" fontSize={18} fill="#94a3b8" style={{ userSelect: 'none' }}>
            {editMode ? 'Click and drag to draw your first room' : 'Enable edit mode to add rooms'}
          </text>
        )}
      </svg>

      {/* Name dialog */}
      {naming && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-2xl z-20">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-72" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-900 mb-3">Name this room</h3>
            <input
              autoFocus type="text" value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmRoom(); if (e.key === 'Escape') setNaming(null); }}
              placeholder="e.g. Living Room"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setNaming(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
              <button onClick={confirmRoom} disabled={!nameInput.trim()} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50">
                Add Room
              </button>
            </div>
          </div>
        </div>
      )}

      {editMode && selectedRoom && (
        <button
          onClick={() => onDeleteRoom(selectedRoom.id)}
          title={`Delete ${selectedRoom.name}`}
          className="absolute top-2 right-12 p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 shadow-sm z-10"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
