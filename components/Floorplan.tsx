'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import type { FloorplanRoom } from '@/hooks/use-floorplan';

const VB_W = 1000;
const VB_H = 580;
const MIN_SIZE = 80;
const HANDLE_R = 7;

type Corner = 'tl' | 'tr' | 'bl' | 'br';

type Drag =
  | { type: 'idle' }
  | { type: 'draw'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'move'; id: string; startX: number; startY: number; origX: number; origY: number }
  | { type: 'resize'; id: string; corner: Corner; startX: number; startY: number; orig: FloorplanRoom };

interface Props {
  rooms: FloorplanRoom[];
  selectedRoomId?: string;
  choreCounts?: Record<string, number>;
  editMode: boolean;
  onSelectRoom: (room: FloorplanRoom) => void;
  onAddRoom: (name: string, x: number, y: number, w: number, h: number) => void;
  onUpdateRoom: (id: string, patch: Partial<FloorplanRoom>) => void;
  onDeleteRoom: (id: string) => void;
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

export function Floorplan({ rooms, selectedRoomId, choreCounts = {}, editMode, onSelectRoom, onAddRoom, onUpdateRoom, onDeleteRoom }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag>({ type: 'idle' });
  const [localRooms, setLocalRooms] = useState<FloorplanRoom[]>(rooms);
  const [naming, setNaming] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [nameInput, setNameInput] = useState('');

  useEffect(() => { setLocalRooms(rooms); }, [rooms]);

  function toVB(e: React.MouseEvent | MouseEvent): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * VB_W, 0, VB_W),
      y: clamp(((e.clientY - rect.top) / rect.height) * VB_H, 0, VB_H),
    };
  }

  const onSvgMouseDown = useCallback((e: React.MouseEvent) => {
    if (!editMode) return;
    e.preventDefault();
    const pt = toVB(e);
    const hit = [...localRooms].reverse().find(r =>
      pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h
    );
    if (hit) {
      setDrag({ type: 'move', id: hit.id, startX: pt.x, startY: pt.y, origX: hit.x, origY: hit.y });
    } else {
      setDrag({ type: 'draw', x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, localRooms]);

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
        w = orig.w + (orig.x - x);
        h = orig.h + (orig.y - y);
      } else if (corner === 'tr') {
        w = clamp(orig.w + dx, MIN_SIZE, VB_W - orig.x);
        y = clamp(orig.y + dy, 0, orig.y + orig.h - MIN_SIZE);
        h = orig.h + (orig.y - y);
      } else if (corner === 'bl') {
        x = clamp(orig.x + dx, 0, orig.x + orig.w - MIN_SIZE);
        w = orig.w + (orig.x - x);
        h = clamp(orig.h + dy, MIN_SIZE, VB_H - orig.y);
      } else {
        w = clamp(orig.w + dx, MIN_SIZE, VB_W - orig.x);
        h = clamp(orig.h + dy, MIN_SIZE, VB_H - orig.y);
      }
      setLocalRooms(prev => prev.map(r => r.id === drag.id ? { ...r, x, y, w, h } : r));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  const onSvgMouseUp = useCallback(() => {
    if (drag.type === 'draw') {
      const x = Math.min(drag.x0, drag.x1);
      const y = Math.min(drag.y0, drag.y1);
      const w = Math.abs(drag.x1 - drag.x0);
      const h = Math.abs(drag.y1 - drag.y0);
      if (w >= MIN_SIZE && h >= MIN_SIZE) {
        setNaming({ x, y, w, h });
        setNameInput('');
      }
    } else if (drag.type === 'move') {
      const room = localRooms.find(r => r.id === drag.id);
      if (room) onUpdateRoom(drag.id, { x: room.x, y: room.y });
    } else if (drag.type === 'resize') {
      const room = localRooms.find(r => r.id === drag.id);
      if (room) onUpdateRoom(drag.id, { x: room.x, y: room.y, w: room.w, h: room.h });
    }
    setDrag({ type: 'idle' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, localRooms, onUpdateRoom]);

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
    x: Math.min(drag.x0, drag.x1),
    y: Math.min(drag.y0, drag.y1),
    w: Math.abs(drag.x1 - drag.x0),
    h: Math.abs(drag.y1 - drag.y0),
  } : null;

  const selectedRoom = localRooms.find(r => r.id === selectedRoomId);

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className={`w-full rounded-2xl border border-slate-200 bg-slate-50 ${editMode ? 'cursor-crosshair' : 'cursor-pointer'}`}
        style={{ touchAction: 'none' }}
        onMouseDown={onSvgMouseDown}
        onMouseMove={onSvgMouseMove}
        onMouseUp={onSvgMouseUp}
        onMouseLeave={onSvgMouseUp}
      >
        <defs>
          <pattern id="fp-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={VB_W} height={VB_H} fill="url(#fp-grid)" />

        {localRooms.map(room => {
          const isSelected = room.id === selectedRoomId;
          const count = choreCounts[room.id] ?? 0;
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
                x={room.x + room.w / 2}
                y={room.y + room.h / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={Math.max(fontSize, 10)}
                fill="#1e293b"
                fontWeight="600"
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
        })}

        {drawRect && drawRect.w > 4 && drawRect.h > 4 && (
          <rect
            x={drawRect.x} y={drawRect.y} width={drawRect.w} height={drawRect.h}
            fill="#bfdbfe" fillOpacity={0.5}
            stroke="#2563eb" strokeWidth={1.5} strokeDasharray="8 4"
            rx={6}
          />
        )}

        {localRooms.length === 0 && (
          <text
            x={VB_W / 2} y={VB_H / 2}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={18} fill="#94a3b8"
            style={{ userSelect: 'none' }}
          >
            {editMode ? 'Click and drag to draw your first room' : 'Enable edit mode to add rooms'}
          </text>
        )}
      </svg>

      {naming && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-2xl z-10">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-72" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-900 mb-3">Name this room</h3>
            <input
              autoFocus
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmRoom(); if (e.key === 'Escape') setNaming(null); }}
              placeholder="e.g. Living Room"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setNaming(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">
                Cancel
              </button>
              <button
                onClick={confirmRoom}
                disabled={!nameInput.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
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
          className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 shadow-sm z-10"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
