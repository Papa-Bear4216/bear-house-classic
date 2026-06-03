import React, { useState, useEffect } from 'react';
import { X, Key, Bell, Clock, Users, Trash2, Plus, Download, Eye, EyeOff } from 'lucide-react';
import { KEYS, DEFAULT_API_KEY, DEFAULT_SETTINGS, DEFAULT_PRESENCE_ZONES, loadJSON, saveJSON, uid } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<Props> = ({ open, onClose }) => {
  const { currentRole } = useAppContext();
  const isAdmin = currentRole === 'superadmin' || currentRole === 'admin';

  const [apiKey, setApiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [zones, setZones] = useState<any[]>(DEFAULT_PRESENCE_ZONES);
  const [newZone, setNewZone] = useState({ name: '', startHour: 18, endHour: 21, days: '1,2,3,4,5' });

  useEffect(() => {
    if (open) {
      setApiKey(localStorage.getItem(KEYS.apiKey) || DEFAULT_API_KEY);
      setGeminiKey(localStorage.getItem(KEYS.geminiApiKey) || '');
      setSettings(loadJSON(KEYS.settings, DEFAULT_SETTINGS));
      setZones(loadJSON(KEYS.presenceZones, DEFAULT_PRESENCE_ZONES));
    }
  }, [open]);

  const saveAll = () => {
    if (isAdmin) {
      localStorage.setItem(KEYS.apiKey, apiKey);
      localStorage.setItem(KEYS.geminiApiKey, geminiKey);
    }
    saveJSON(KEYS.settings, settings);
    saveJSON(KEYS.presenceZones, zones);
    onClose();
  };

  const addZone = () => {
    if (!newZone.name) return;
    const days = newZone.days.split(',').map((d) => parseInt(d.trim())).filter((d) => !isNaN(d));
    setZones([...zones, { id: uid(), name: newZone.name, startHour: newZone.startHour, endHour: newZone.endHour, days }]);
    setNewZone({ name: '', startHour: 18, endHour: 21, days: '1,2,3,4,5' });
  };

  const removeZone = (id: string) => setZones(zones.filter((z) => z.id !== id));

  const exportData = () => {
    const data: any = {};
    Object.values(KEYS).forEach((k) => {
      const v = localStorage.getItem(k);
      if (v) data[k] = JSON.parse(v);
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `familyos-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-2xl w-full mx-auto my-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-slate-700 sticky top-0 bg-slate-800 rounded-t-2xl">
          <h2 className="text-2xl font-bold text-white">Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* API Keys — parents only */}
          {isAdmin && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Key className="w-4 h-4 text-amber-400" />
                <h3 className="font-semibold text-white">API Keys</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Anthropic (Claude)</label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-ant-..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 pr-10 text-white text-sm focus:border-amber-500 outline-none"
                    />
                    <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-3 text-slate-400 hover:text-white">
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Google Gemini <span className="text-emerald-400">(free tier — recommended for camera scanner)</span></label>
                  <div className="relative">
                    <input
                      type={showGeminiKey ? 'text' : 'password'}
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      placeholder="AIza..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 pr-10 text-white text-sm focus:border-emerald-500 outline-none"
                    />
                    <button onClick={() => setShowGeminiKey(!showGeminiKey)} className="absolute right-3 top-3 text-slate-400 hover:text-white">
                      {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500">Stored locally on this device only.</p>
              </div>
            </section>
          )}

          {/* Toggles */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Bell className="w-4 h-4 text-indigo-400" />
              <h3 className="font-semibold text-white">Preferences</h3>
            </div>
            <label className="flex items-center justify-between bg-slate-900 rounded-lg px-4 py-3 cursor-pointer">
              <span className="text-slate-200 text-sm">AI features enabled</span>
              <input
                type="checkbox"
                checked={settings.aiEnabled}
                onChange={(e) => setSettings({ ...settings, aiEnabled: e.target.checked })}
                className="w-5 h-5 accent-indigo-500"
              />
            </label>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="bg-slate-900 rounded-lg px-4 py-3">
                <label className="text-xs text-slate-400 block mb-1">Overdue threshold (days)</label>
                <input
                  type="number"
                  value={settings.overdueThreshold}
                  onChange={(e) => setSettings({ ...settings, overdueThreshold: parseInt(e.target.value) || 3 })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-sm"
                />
              </div>
              <div className="bg-slate-900 rounded-lg px-4 py-3">
                <label className="text-xs text-slate-400 block mb-1">Pre-activity reminder (min)</label>
                <input
                  type="number"
                  value={settings.preActivityReminder}
                  onChange={(e) => setSettings({ ...settings, preActivityReminder: parseInt(e.target.value) || 30 })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-sm"
                />
              </div>
            </div>
          </section>

          {/* Presence Zones */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-orange-400" />
              <h3 className="font-semibold text-white">Presence Zones</h3>
            </div>
            <div className="space-y-2 mb-3">
              {zones.map((z) => (
                <div key={z.id} className="flex items-center justify-between bg-slate-900 rounded-lg px-4 py-3">
                  <div>
                    <div className="text-white text-sm font-medium">{z.name}</div>
                    <div className="text-xs text-slate-400">
                      {z.startHour}:00 - {z.endHour}:00 · Days: {z.days.join(', ')}
                    </div>
                  </div>
                  <button onClick={() => removeZone(z.id)} className="text-rose-400 hover:text-rose-300">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="bg-slate-900 rounded-lg p-3 space-y-2">
              <input
                placeholder="Zone name"
                value={newZone.name}
                onChange={(e) => setNewZone({ ...newZone, name: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  placeholder="Start"
                  value={newZone.startHour}
                  onChange={(e) => setNewZone({ ...newZone, startHour: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm"
                />
                <input
                  type="number"
                  placeholder="End"
                  value={newZone.endHour}
                  onChange={(e) => setNewZone({ ...newZone, endHour: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm"
                />
                <input
                  placeholder="Days 0-6"
                  value={newZone.days}
                  onChange={(e) => setNewZone({ ...newZone, days: e.target.value })}
                  className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm"
                />
              </div>
              <button onClick={addZone} className="w-full bg-orange-600 hover:bg-orange-500 text-white rounded py-2 text-sm flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> Add Zone
              </button>
            </div>
          </section>

          {/* Family info */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-pink-400" />
              <h3 className="font-semibold text-white">Family</h3>
            </div>
            <div className="bg-slate-900 rounded-lg p-4 text-sm text-slate-300 space-y-1">
              <div>Daddy <span className="text-slate-500">— you</span></div>
              <div>Mommy <span className="text-slate-500">— Mommy</span></div>
              <div>Abriana <span className="text-slate-500">— child</span></div>
              <div>Julia <span className="text-slate-500">— child</span></div>
              <div>Lucy <span className="text-slate-500">— pet dog</span></div>
            </div>
          </section>

          {/* Export */}
          <section>
            <button onClick={exportData} className="w-full bg-slate-700 hover:bg-slate-600 text-white rounded-lg py-2.5 flex items-center justify-center gap-2 text-sm font-medium">
              <Download className="w-4 h-4" /> Export All Data (JSON)
            </button>
          </section>
        </div>

        <div className="p-6 border-t border-slate-700 sticky bottom-0 bg-slate-800 rounded-b-2xl">
          <button onClick={saveAll} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-3 font-semibold transition">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
