'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { MapContainer, ImageOverlay, Marker, Popup, useMap, useMapEvents, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useFamilyMembers } from '@/hooks/use-family';
import { useTasks } from '@/hooks/use-tasks';
import { UploadCloud, CheckCircle2, MapPin, X, ChevronDown, Home } from 'lucide-react';

// ─── localStorage helpers ────────────────────────────────────────────────────

function useLocalStorage<T>(key: string, initialValue: T): [T, (v: T) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initialValue; } catch { return initialValue; }
  });
  const set = useCallback((v: T) => { setValue(v); try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key]);
  const remove = useCallback(() => { setValue(initialValue); try { localStorage.removeItem(key); } catch {} }, [key, initialValue]);
  return [value, set, remove];
}

// ─── Room definitions — coordinates in Leaflet [y, x] for 2600×1950 image ──
// Formula: [imageHeight - pixelFromTop, pixelFromLeft]

export const ROOMS: { id: string; label: string; pos: [number, number]; color: string }[] = [
  { id: 'kitchen',   label: 'Kitchen',         pos: [1722, 351],  color: '#f97316' },
  { id: 'laundry',   label: 'Laundry',         pos: [1410, 137],  color: '#3b82f6' },
  { id: 'bar',       label: 'Bar',             pos: [1378, 348],  color: '#a855f7' },
  { id: 'storage',   label: 'Storage',         pos: [1014, 101],  color: '#6b7280' },
  { id: 'dining',    label: 'Dining Area',     pos: [1014, 348],  color: '#eab308' },
  { id: 'foyer',     label: 'Foyer',           pos: [929,  660],  color: '#14b8a6' },
  { id: 'living',    label: 'Living Room',     pos: [1391, 712],  color: '#22c55e' },
  { id: 'bath1',     label: 'Bath',            pos: [1748, 1066], color: '#3b82f6' },
  { id: 'wic',       label: 'W.I.C.',          pos: [1589, 1066], color: '#8b5cf6' },
  { id: 'bath2',     label: 'Bath (Hall)',      pos: [1358, 1050], color: '#3b82f6' },
  { id: 'hall',      label: 'Hall',            pos: [1163, 1147], color: '#94a3b8' },
  { id: 'primary',   label: 'Primary Bedroom', pos: [1670, 1430], color: '#ec4899' },
  { id: 'bedroom2',  label: 'Bedroom',         pos: [1287, 1463], color: '#f59e0b' },
  { id: 'bedroom3',  label: 'Bedroom',         pos: [942,  988],  color: '#f59e0b' },
  { id: 'bedroom4',  label: 'Bedroom',         pos: [962,  1456], color: '#f59e0b' },
];

// ─── Leaflet icon setup ───────────────────────────────────────────────────────

const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

function makeColorIcon(color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}" stroke="white" stroke-width="2"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`;
  return L.icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
    iconSize: [24, 36], iconAnchor: [12, 36], popupAnchor: [0, -36],
  });
}

// ─── Map controller — fit bounds once on mount ────────────────────────────────

function MapController({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    const lb = L.latLngBounds(bounds as L.LatLngBoundsLiteral);
    map.fitBounds(lb, { padding: [20, 20] });
    map.setMaxBounds(lb.pad(0.15));
    const fitZoom = map.getBoundsZoom(lb, false);
    map.setMinZoom(fitZoom - 1);
    map.setMaxZoom(fitZoom + 5);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// ─── Click-to-place handler ───────────────────────────────────────────────────

function ClickHandler({ onMapClick }: { onMapClick: (pos: [number, number]) => void }) {
  useMapEvents({
    click(e) { onMapClick([e.latlng.lat, e.latlng.lng]); },
  });
  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────

type TaskRoom = Record<string, string>; // taskId → roomId

export default function FamilyMap() {
  const { users } = useFamilyMembers();
  const { tasks, updateTaskStatus } = useTasks();
  const [floorPlanData, setFloorPlanData, removeFloorPlanData] = useLocalStorage<string>('bearhouse_floorplan', '');
  const [taskRooms, setTaskRooms] = useLocalStorage<TaskRoom>('bearhouse_task_rooms', {});
  const [imgBounds, setImgBounds] = useState<L.LatLngBoundsExpression | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [assigningRoom, setAssigningRoom] = useState(false);

  useEffect(() => {
    if (!floorPlanData) { setImgBounds(null); return; }
    const img = new window.Image();
    img.onload = () => setImgBounds([[0, 0], [img.height, img.width]]);
    img.src = floorPlanData;
  }, [floorPlanData]);

  const activeTasks = tasks.filter(t => t.status !== 'done' && t.completed !== true);
  const unplacedTasks = activeTasks.filter(t => !taskRooms[t.id]);

  function assignTaskToRoom(taskId: string, roomId: string) {
    setTaskRooms({ ...taskRooms, [taskId]: roomId });
    setSelectedTaskId(null);
    setAssigningRoom(false);
  }

  function removeTaskPlacement(taskId: string) {
    const next = { ...taskRooms };
    delete next[taskId];
    setTaskRooms(next);
  }

  // Group placed tasks by room
  const tasksByRoom: Record<string, typeof activeTasks> = {};
  for (const task of activeTasks) {
    const rid = taskRooms[task.id];
    if (rid) {
      if (!tasksByRoom[rid]) tasksByRoom[rid] = [];
      tasksByRoom[rid].push(task);
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setFloorPlanData(reader.result as string);
    reader.readAsDataURL(file);
  };

  // ─── Upload screen ──────────────────────────────────────────────────────────

  if (!floorPlanData || !imgBounds) {
    return (
      <div className="w-full h-full min-h-[500px] bg-slate-900 border border-slate-700 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-slate-800 border border-slate-600 rounded-2xl flex items-center justify-center mb-5">
          <UploadCloud className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Upload Home Floorplan</h3>
        <p className="text-slate-400 text-sm mb-7 max-w-sm">
          Upload your floor plan to pin tasks to specific rooms.
        </p>
        <label
          className="cursor-pointer font-semibold text-white bg-indigo-600 hover:bg-indigo-500 px-6 py-3 rounded-xl text-sm transition-colors"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onloadend = () => setFloorPlanData(reader.result as string);
            reader.readAsDataURL(file);
          }}
        >
          Select or drag image here
          <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        </label>
      </div>
    );
  }

  // ─── Map screen ─────────────────────────────────────────────────────────────

  return (
    <div className="w-full h-full min-h-[600px] flex gap-4">

      {/* Side panel */}
      <div className="w-64 flex-shrink-0 flex flex-col gap-3">

        {/* Assign mode */}
        {assigningRoom ? (
          <div className="bg-indigo-900/40 border border-indigo-500/40 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-indigo-300">Click a room to assign:</p>
              <button onClick={() => { setAssigningRoom(false); setSelectedTaskId(null); }}
                className="text-slate-500 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {selectedTaskId && (
              <p className="text-sm text-white font-medium truncate">
                {activeTasks.find(t => t.id === selectedTaskId)?.title}
              </p>
            )}
            <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
              {ROOMS.map(r => (
                <button key={r.id}
                  onClick={() => selectedTaskId && assignTaskToRoom(selectedTaskId, r.id)}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-slate-700 hover:text-white flex items-center gap-2 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Unplaced Tasks ({unplacedTasks.length})
            </p>
            {unplacedTasks.length === 0 ? (
              <p className="text-xs text-slate-600">All tasks are pinned!</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {unplacedTasks.map(task => {
                  const user = users.find(u => u.id === task.assigneeId);
                  return (
                    <button key={task.id}
                      onClick={() => { setSelectedTaskId(task.id); setAssigningRoom(true); }}
                      className="w-full text-left px-2.5 py-2 rounded-lg bg-slate-700/50 hover:bg-indigo-900/40 hover:border-indigo-500/40 border border-transparent transition-colors"
                    >
                      <p className="text-xs text-white font-medium truncate">{task.title}</p>
                      {user && <p className="text-[10px] text-slate-500 mt-0.5">{user.name.split(' ')[0]}</p>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Room summary */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 flex-1 overflow-y-auto">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">By Room</p>
          <div className="space-y-1.5">
            {ROOMS.filter(r => tasksByRoom[r.id]?.length).map(room => (
              <div key={room.id} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: room.color }} />
                <span className="text-xs text-slate-300 flex-1 truncate">{room.label}</span>
                <span className="text-[10px] font-bold text-slate-500">{tasksByRoom[room.id].length}</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => removeFloorPlanData()}
          className="text-xs text-slate-600 hover:text-red-400 transition-colors text-left px-1"
        >
          Change floorplan image
        </button>
      </div>

      {/* Map */}
      <div className="flex-1 rounded-2xl overflow-hidden border border-slate-700 relative">
        <MapContainer
          crs={L.CRS.Simple}
          bounds={imgBounds as L.LatLngBoundsExpression}
          scrollWheelZoom="center"
          doubleClickZoom={true}
          zoomSnap={0.25}
          zoomDelta={0.5}
          wheelDebounceTime={80}
          style={{ height: '100%', width: '100%', zIndex: 0, background: '#020817' }}
        >
          <MapController bounds={imgBounds} />
          <ImageOverlay url={floorPlanData} bounds={imgBounds} />

          {/* Room markers */}
          {ROOMS.map(room => {
            const roomTasks = tasksByRoom[room.id] ?? [];
            return (
              <CircleMarker
                key={room.id}
                center={room.pos}
                radius={roomTasks.length > 0 ? 12 : 7}
                pathOptions={{
                  color: room.color,
                  fillColor: room.color,
                  fillOpacity: roomTasks.length > 0 ? 0.85 : 0.3,
                  weight: roomTasks.length > 0 ? 2 : 1,
                }}
              >
                <Tooltip permanent={roomTasks.length > 0} direction="top" offset={[0, -8]}
                  className="leaflet-tooltip-dark"
                >
                  <span style={{ fontWeight: 700, fontSize: 11, color: '#fff', background: 'transparent' }}>
                    {roomTasks.length > 0 ? `${room.label} (${roomTasks.length})` : room.label}
                  </span>
                </Tooltip>
                {roomTasks.length > 0 && (
                  <Popup>
                    <div style={{ minWidth: 180 }}>
                      <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: room.color }}>{room.label}</p>
                      {roomTasks.map(task => {
                        const u = users.find(x => x.id === task.assigneeId);
                        return (
                          <div key={task.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #e2e8f0' }}>
                            <p style={{ fontWeight: 600, fontSize: 12, color: '#1e293b', marginBottom: 4 }}>{task.title}</p>
                            {u && <p style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{u.name.split(' ')[0]}</p>}
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => updateTaskStatus(task.id, 'done')}
                                style={{ flex: 1, padding: '4px 8px', background: '#22c55e', color: 'white', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                              >
                                ✓ Done
                              </button>
                              <button
                                onClick={() => removeTaskPlacement(task.id)}
                                style={{ padding: '4px 8px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}
                              >
                                Unpin
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Popup>
                )}
              </CircleMarker>
            );
          })}
        </MapContainer>

        {/* Tooltip style override */}
        <style>{`
          .leaflet-tooltip { background: transparent !important; border: none !important; box-shadow: none !important; }
          .leaflet-tooltip::before { display: none !important; }
        `}</style>
      </div>
    </div>
  );
}
