import React, { useState, useMemo } from 'react';
import {
  Home,
  Power,
  CheckCircle2,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  MapPin,
  Layers,
  X,
  Lightbulb,
  Fan,
} from 'lucide-react';
import {
  RoomDefinition,
  loadRoomMap,
  saveRoomMap,
  formatDueBadge,
  daysUntilDue,
  isOverdue,
} from '@/lib/familyos';

interface Task {
  id: string;
  text: string;
  person: string;
  priority: string;
  category: string;
  room?: string;
  haEntityId?: string;
  dueEstimate?: string;
  dueDate?: number | null;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  steps?: string[];
  stepsCompleted?: boolean[];
  estimatedMinutes?: number;
  snoozedUntil?: number | null;
}

interface RoomMapViewProps {
  tasks: Task[];
  onCompleteTask: (taskId: string) => void;
  onAddTaskToRoom: (text: string, room: string, haEntityId?: string) => void;
  onTriggerHaDevice: (entityId: string) => Promise<{ ok: boolean; error?: string }>;
  haBusyId: string | null;
}

const ZONE_LABELS: Record<string, string> = {
  all: 'All Rooms',
  main: 'Main Floor',
  upstairs: 'Upstairs / Bedrooms',
  work: 'Work & Utility',
  outdoor: 'Outdoor',
  basement: 'Basement',
};

const DOMAIN_ICONS: Record<string, React.FC<{ className?: string }>> = {
  light: Lightbulb,
  fan: Fan,
  switch: Power,
  vacuum: Home,
  default: Power,
};

export const RoomMapView: React.FC<RoomMapViewProps> = ({
  tasks,
  onCompleteTask,
  onAddTaskToRoom,
  onTriggerHaDevice,
  haBusyId,
}) => {
  const [rooms, setRooms] = useState<RoomDefinition[]>(() => loadRoomMap());
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [newChoreText, setNewChoreText] = useState('');
  const [newEntityId, setNewEntityId] = useState('');
  const [displayMode, setDisplayMode] = useState<'blueprint' | 'cards'>('blueprint');

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) || null,
    [rooms, selectedRoomId]
  );

  const roomStats = useMemo(() => {
    const stats: Record<
      string,
      { total: number; overdue: number; today: number; tasks: Task[] }
    > = {};

    rooms.forEach((r) => {
      const roomTasks = tasks.filter(
        (t) => !t.completed && (t.room || '').trim().toLowerCase() === r.name.trim().toLowerCase()
      );
      const overdue = roomTasks.filter((t) => isOverdue(t)).length;
      const today = roomTasks.filter((t) => {
        if (t.dueDate) return daysUntilDue(t.dueDate) === 0;
        return t.dueEstimate === 'Today';
      }).length;

      stats[r.id] = {
        total: roomTasks.length,
        overdue,
        today,
        tasks: roomTasks,
      };
    });

    return stats;
  }, [rooms, tasks]);

  const filteredRooms = useMemo(() => {
    if (zoneFilter === 'all') return rooms;
    return rooms.filter((r) => (r.zone || 'main') === zoneFilter);
  }, [rooms, zoneFilter]);

  const handleAddChore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom || !newChoreText.trim()) return;
    const defaultEntity = selectedRoom.haEntities && selectedRoom.haEntities.length > 0
      ? selectedRoom.haEntities[0]
      : undefined;
    onAddTaskToRoom(newChoreText.trim(), selectedRoom.name, defaultEntity);
    setNewChoreText('');
  };

  const handleAddEntity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom || !newEntityId.trim()) return;
    const clean = newEntityId.trim().toLowerCase();
    if (!clean.includes('.')) return;

    const currentEntities = selectedRoom.haEntities || [];
    if (!currentEntities.includes(clean)) {
      const updatedRooms = rooms.map((r) =>
        r.id === selectedRoom.id ? { ...r, haEntities: [...currentEntities, clean] } : r
      );
      setRooms(updatedRooms);
      saveRoomMap(updatedRooms);
    }
    setNewEntityId('');
  };

  const handleRemoveEntity = (entityToRemove: string) => {
    if (!selectedRoom) return;
    const updatedEntities = (selectedRoom.haEntities || []).filter((e) => e !== entityToRemove);
    const updatedRooms = rooms.map((r) =>
      r.id === selectedRoom.id ? { ...r, haEntities: updatedEntities } : r
    );
    setRooms(updatedRooms);
    saveRoomMap(updatedRooms);
  };

  const getDomainIcon = (entityId: string) => {
    const domain = entityId.split('.')[0] || 'default';
    return DOMAIN_ICONS[domain] || DOMAIN_ICONS.default;
  };

  return (
    <div className="space-y-4">
      {/* Controls Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-orange-400" />
            <h3 className="text-lg font-bold text-white">Interactive Room Map & Automations</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Tap any room or pin to view active chores, manage linked devices, and trigger automations.
          </p>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {/* Sub-view switcher: Blueprint vs Cards */}
          <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setDisplayMode('blueprint')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition ${
                displayMode === 'blueprint'
                  ? 'bg-orange-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Floor Plan
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('cards')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition ${
                displayMode === 'cards'
                  ? 'bg-orange-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Room Cards
            </button>
          </div>
        </div>
      </div>

      {/* Zone Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {(['all', 'main', 'upstairs', 'work', 'basement', 'outdoor'] as const).map((z) => {
          const count = z === 'all' ? rooms.length : rooms.filter((r) => (r.zone || 'main') === z).length;
          if (z !== 'all' && count === 0) return null;
          return (
            <button
              key={z}
              onClick={() => setZoneFilter(z)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition flex items-center gap-1.5 ${
                zoneFilter === z
                  ? 'bg-orange-600 text-white font-medium shadow'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <span>{ZONE_LABELS[z]}</span>
              <span className="opacity-60 text-[10px]">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Main Map Content + Inspector Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left / Center: Map Canvas or Room Cards */}
        <div className={`${selectedRoom ? 'lg:col-span-7' : 'lg:col-span-12'} transition-all`}>
          {displayMode === 'blueprint' ? (
            /* Interactive Architectural Blueprint Floor Plan */
            <div className="bg-slate-950 border-2 border-slate-700/80 rounded-2xl p-5 shadow-2xl relative overflow-hidden min-h-[460px]">
              {/* Blueprint Grid pattern */}
              <div
                className="absolute inset-0 opacity-[0.07] pointer-events-none"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 1px 1px, #38bdf8 1px, transparent 0)',
                  backgroundSize: '24px 24px',
                }}
              />

              <div className="relative z-10 flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-300">
                    Architectural Layout · Bear House
                  </span>
                </div>
                <span className="text-[11px] text-slate-400">
                  Select a room to open controls
                </span>
              </div>

              {/* Floor Plan Blueprint Grid Layout */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {filteredRooms.map((room) => {
                  const stat = roomStats[room.id] || { total: 0, overdue: 0, today: 0 };
                  const isSelected = selectedRoom?.id === room.id;
                  const hasEntities = (room.haEntities?.length ?? 0) > 0;
                  const firstEntity = room.haEntities?.[0];

                  return (
                    <div
                      key={room.id}
                      onClick={() => setSelectedRoomId(room.id)}
                      className={`group cursor-pointer rounded-xl p-3.5 border transition relative flex flex-col justify-between min-h-[110px] ${
                        isSelected
                          ? 'bg-slate-800/90 border-orange-500 shadow-lg ring-2 ring-orange-500/30'
                          : 'bg-slate-900/80 border-slate-700/80 hover:border-slate-500 hover:bg-slate-850'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <MapPin
                              className={`w-3.5 h-3.5 ${
                                isSelected
                                  ? 'text-orange-400'
                                  : stat.overdue > 0
                                  ? 'text-rose-400 animate-bounce'
                                  : 'text-slate-400'
                              }`}
                            />
                            <span className="font-semibold text-sm text-white truncate">
                              {room.name}
                            </span>
                          </div>
                          {room.description && (
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {room.description}
                            </p>
                          )}
                        </div>

                        {/* Chore count badge */}
                        {stat.total > 0 ? (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                              stat.overdue > 0
                                ? 'bg-rose-600 text-white animate-pulse'
                                : stat.today > 0
                                ? 'bg-amber-500 text-slate-950 font-semibold'
                                : 'bg-slate-700 text-slate-200'
                            }`}
                          >
                            {stat.total} chore{stat.total > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-[10px] bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Clean
                          </span>
                        )}
                      </div>

                      {/* Bottom row: Device triggers and quick stats */}
                      <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-slate-800/60">
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Home className="w-3 h-3 text-sky-400" />
                          <span>{room.haEntities?.length || 0} HA dev</span>
                        </div>

                        {/* Quick Trigger Button for Primary HA Device */}
                        {hasEntities && firstEntity && (
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              await onTriggerHaDevice(firstEntity);
                            }}
                            disabled={haBusyId === firstEntity}
                            title={`Trigger ${firstEntity}`}
                            className="bg-sky-950/80 hover:bg-sky-800/80 border border-sky-500/40 text-sky-200 text-[10px] font-medium px-2 py-1 rounded flex items-center gap-1 transition"
                          >
                            {haBusyId === firstEntity ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <Power className="w-2.5 h-2.5 text-emerald-400" />
                            )}
                            <span className="truncate max-w-[80px]">
                              {firstEntity.split('.')[1] || 'toggle'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Responsive Room Cards Grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {filteredRooms.map((room) => {
                const stat = roomStats[room.id] || { total: 0, overdue: 0, today: 0 };
                const isSelected = selectedRoom?.id === room.id;
                return (
                  <div
                    key={room.id}
                    onClick={() => setSelectedRoomId(room.id)}
                    className={`cursor-pointer rounded-xl p-4 border transition ${
                      isSelected
                        ? 'bg-slate-800 border-orange-500 shadow-md ring-2 ring-orange-500/20'
                        : 'bg-slate-800/60 border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-white">{room.name}</div>
                      <span className="text-xs text-slate-400 capitalize">
                        {room.zone || 'main'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs mt-3 pt-2 border-t border-slate-700/60">
                      <span className="text-slate-300">
                        {stat.total} chore{stat.total === 1 ? '' : 's'}
                      </span>
                      <span className="text-sky-300">
                        {room.haEntities?.length || 0} device{room.haEntities?.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right / Side Panel: Selected Room Inspector */}
        {selectedRoom && (
          <div className="lg:col-span-5 bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-5 shadow-xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xl font-bold text-white">{selectedRoom.name}</h4>
                  <span className="text-[10px] uppercase font-semibold tracking-wider bg-slate-800 text-orange-300 px-2 py-0.5 rounded">
                    {selectedRoom.zone || 'main'}
                  </span>
                </div>
                {selectedRoom.description && (
                  <p className="text-xs text-slate-400 mt-1">{selectedRoom.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedRoomId(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                aria-label="Close room details"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Smart Home Automations Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Home className="w-4 h-4 text-sky-400" />
                  <span className="text-sm font-semibold text-white">
                    Home Assistant Automations
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  {selectedRoom.haEntities?.length || 0} linked
                </span>
              </div>

              {/* Linked Entities List */}
              <div className="space-y-2">
                {(!selectedRoom.haEntities || selectedRoom.haEntities.length === 0) ? (
                  <div className="text-xs text-slate-400 bg-slate-800/40 rounded-lg p-3 text-center border border-dashed border-slate-700">
                    No Home Assistant devices linked to {selectedRoom.name} yet.
                  </div>
                ) : (
                  selectedRoom.haEntities.map((ent) => {
                    const Icon = getDomainIcon(ent);
                    const isBusy = haBusyId === ent;

                    return (
                      <div
                        key={ent}
                        className="flex items-center justify-between bg-slate-800/90 border border-slate-700/80 rounded-lg p-2.5 hover:border-slate-600 transition"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-md bg-sky-950/80 border border-sky-500/30 flex items-center justify-center shrink-0">
                            <Icon className="w-3.5 h-3.5 text-sky-400" />
                          </div>
                          <span className="text-xs font-mono text-slate-200 truncate">{ent}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onTriggerHaDevice(ent)}
                            disabled={isBusy}
                            title={`Trigger automation for ${ent}`}
                            className="bg-emerald-900/30 hover:bg-emerald-800/50 border border-emerald-500/40 text-emerald-300 px-2.5 py-1 rounded text-xs flex items-center gap-1.5 transition font-medium"
                          >
                            {isBusy ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Power className="w-3 h-3 text-emerald-400" />
                            )}
                            <span>Toggle</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveEntity(ent)}
                            title="Unlink device"
                            className="text-slate-500 hover:text-rose-400 p-1 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Add HA Device Form */}
              <form onSubmit={handleAddEntity} className="flex gap-2">
                <input
                  type="text"
                  value={newEntityId}
                  onChange={(e) => setNewEntityId(e.target.value)}
                  placeholder="Link device e.g. light.living_room"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500"
                />
                <button
                  type="submit"
                  disabled={!newEntityId.trim() || !newEntityId.includes('.')}
                  className="bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:hover:bg-sky-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition shrink-0"
                >
                  <Plus className="w-3 h-3" /> Link
                </button>
              </form>
            </div>

            {/* Active Chores in Room Section */}
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-orange-400" />
                  <span className="text-sm font-semibold text-white">Active Chores</span>
                </div>
                <span className="text-xs text-slate-400">
                  {roomStats[selectedRoom.id]?.total || 0} active
                </span>
              </div>

              {/* Chore List */}
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {(roomStats[selectedRoom.id]?.tasks || []).length === 0 ? (
                  <div className="text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-800/40 rounded-lg p-3 text-center flex items-center justify-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>All clear! No pending chores in {selectedRoom.name}.</span>
                  </div>
                ) : (
                  roomStats[selectedRoom.id].tasks.map((task) => {
                    const dueBadge = task.dueDate ? formatDueBadge(task.dueDate) : null;
                    return (
                      <div
                        key={task.id}
                        className="bg-slate-800/80 border border-slate-700 rounded-lg p-2.5 flex items-start gap-2.5"
                      >
                        <button
                          type="button"
                          onClick={() => onCompleteTask(task.id)}
                          className="text-slate-400 hover:text-emerald-400 mt-0.5 shrink-0"
                          title="Complete chore"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white break-words">{task.text}</p>
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            <span className="text-[9px] bg-slate-700 text-slate-300 px-1 py-0.5 rounded">
                              {task.person}
                            </span>
                            <span className="text-[9px] bg-orange-950/60 text-orange-300 px-1 py-0.5 rounded">
                              {task.priority}
                            </span>
                            {dueBadge && (
                              <span className="text-[9px] bg-slate-700 text-slate-200 px-1 py-0.5 rounded">
                                {dueBadge.label}
                              </span>
                            )}
                            {task.haEntityId && (
                              <button
                                type="button"
                                onClick={() => onTriggerHaDevice(task.haEntityId!)}
                                className="text-[9px] bg-sky-900/60 border border-sky-500/40 text-sky-200 px-1 py-0.5 rounded flex items-center gap-0.5 hover:bg-sky-800"
                              >
                                <Power className="w-2 h-2 text-emerald-400" />
                                <span>{task.haEntityId}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Quick Add Chore to Room */}
              <form onSubmit={handleAddChore} className="flex gap-2">
                <input
                  type="text"
                  value={newChoreText}
                  onChange={(e) => setNewChoreText(e.target.value)}
                  placeholder={`Add a chore in ${selectedRoom.name}...`}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-orange-500"
                />
                <button
                  type="submit"
                  disabled={!newChoreText.trim()}
                  className="bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition shrink-0"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomMapView;
