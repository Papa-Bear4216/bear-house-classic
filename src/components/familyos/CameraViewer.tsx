import React, { useEffect, useState } from 'react';
import { Camera, RefreshCw, ChevronDown } from 'lucide-react';
import { KEYS } from '@/lib/familyos';

interface CameraEntity {
  entityId: string;
  name: string;
  state: string;
}

const CameraViewer: React.FC = () => {
  const [cameras, setCameras] = useState<CameraEntity[] | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cameraToken = () => localStorage.getItem(KEYS.cameraToken) || '';

  useEffect(() => {
    const token = cameraToken();
    if (!token) { setError('Add a camera token in Settings to view cameras.'); return; }
    fetch('/api/ha-cameras', { headers: { 'x-camera-token': token } })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setCameras(d.cameras || []);
        if (d.cameras?.length) setSelected(d.cameras[0].entityId);
      })
      .catch(() => setError('Could not reach Home Assistant'));
  }, []);

  const loadSnapshot = async (entityId: string) => {
    if (!entityId) return;
    const token = cameraToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ha-cameras?entity=${encodeURIComponent(entityId)}`, { headers: { 'x-camera-token': token } });
      const d = await res.json();
      if (d.error) { setError(d.error); setImage(null); }
      else setImage(d.image);
    } catch {
      setError('Snapshot failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (selected) loadSnapshot(selected); }, [selected]);

  if (error && !cameras) {
    return (
      <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 text-slate-500 text-xs flex items-center gap-2">
        <Camera className="w-4 h-4" /> {error}
      </div>
    );
  }
  if (!cameras) {
    return <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 animate-pulse h-40" />;
  }
  if (cameras.length === 0) {
    return (
      <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 text-slate-500 text-xs flex items-center gap-2">
        <Camera className="w-4 h-4" /> No cameras found on Home Assistant.
      </div>
    );
  }

  return (
    <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-white text-sm font-medium">
          <Camera className="w-4 h-4 text-orange-400" /> Cameras
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={selected}
              onChange={e => setSelected(e.target.value)}
              className="appearance-none bg-slate-900 border border-slate-600 rounded-lg pl-3 pr-7 py-1.5 text-white text-xs focus:border-orange-500 outline-none"
            >
              {cameras.map(c => <option key={c.entityId} value={c.entityId}>{c.name}</option>)}
            </select>
            <ChevronDown className="w-3 h-3 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <button onClick={() => loadSnapshot(selected)} className="text-slate-400 hover:text-white transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="rounded-lg overflow-hidden bg-slate-950 aspect-video flex items-center justify-center">
        {error ? (
          <div className="text-rose-400 text-xs p-4 text-center">{error}</div>
        ) : image ? (
          <img src={image} alt="Camera snapshot" className="w-full h-full object-cover" />
        ) : (
          <div className="text-slate-600 text-xs">Loading snapshot...</div>
        )}
      </div>
    </div>
  );
};

export default CameraViewer;
