'use client';

import { useState } from 'react';
import { sampleHouse } from '../../src/lib/sampleHouse';
import type { House } from '../../src/lib/houseTypes';
import { buildEmptyHouse } from '../../src/lib/buildHouse';
import { saveHouseToLocalStorage, loadHouseFromLocalStorage, exportHouseAsJson, importHouseFromJsonString } from '../../src/lib/houseStore';
import { addRoom as addRoomToHouse } from '../../src/lib/buildHouse';
import { v4 as uuidv4 } from 'uuid';

export default function WalkthroughPage() {
  const [house, setHouse] = useState<House | null>(() => loadHouseFromLocalStorage());
  const [name, setName] = useState('Room name');
  const [floorId, setFloorId] = useState('floor-1');
  const [zoneLabel, setZoneLabel] = useState('Main');
  const [importJson, setImportJson] = useState('');

  function startEmpty() {
    const h = buildEmptyHouse('house-1', 'My House');
    setHouse(h);
    saveHouseToLocalStorage(h);
  }

  function loadSample() {
    setHouse(sampleHouse as any);
    saveHouseToLocalStorage(sampleHouse as any);
  }

  function addRoom() {
    if (!house) startEmpty();
    const r = {
      id: uuidv4(),
      floorId: floorId,
      name,
      anchors: [],
      zones: [{ id: uuidv4(), label: zoneLabel, chores: [] }]
    } as any;
    const next = addRoomToHouse(house || buildEmptyHouse('house-1', 'My House'), r);
    setHouse(next);
    saveHouseToLocalStorage(next);
  }

  function doExport() {
    if (!house) return;
    const { url } = exportHouseAsJson(house);
    window.open(url, '_blank');
  }

  function doImport() {
    try {
      const h = importHouseFromJsonString(importJson);
      setHouse(h);
      saveHouseToLocalStorage(h);
      setImportJson('');
    } catch (e) {
      alert('Invalid JSON');
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Walkthrough (SIMULATED)</h1>

      <div className="flex gap-2 mb-4">
        <button onClick={startEmpty} className="px-3 py-2 bg-indigo-600 text-white rounded">Start Empty</button>
        <button onClick={loadSample} className="px-3 py-2 bg-slate-700 text-white rounded">Load Sample</button>
        <button onClick={() => { localStorage.removeItem('bearhouse_house'); setHouse(null); }} className="px-3 py-2 bg-red-600 text-white rounded">Clear Saved</button>
        <button onClick={doExport} className="px-3 py-2 bg-emerald-600 text-white rounded">Export JSON</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="space-y-2">
          <label className="text-sm font-semibold">Room Name</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full p-2 border rounded" />
          <label className="text-sm font-semibold">Floor ID</label>
          <input value={floorId} onChange={e => setFloorId(e.target.value)} className="w-full p-2 border rounded" />
          <label className="text-sm font-semibold">Zone Label</label>
          <input value={zoneLabel} onChange={e => setZoneLabel(e.target.value)} className="w-full p-2 border rounded" />
          <div className="mt-2">
            <button onClick={addRoom} className="px-3 py-2 bg-orange-500 text-white rounded">Add Room</button>
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold">Import JSON</label>
          <textarea value={importJson} onChange={e => setImportJson(e.target.value)} rows={8} className="w-full p-2 border rounded" />
          <div className="mt-2">
            <button onClick={doImport} className="px-3 py-2 bg-indigo-600 text-white rounded">Import</button>
          </div>
        </div>
      </div>

      <div>
        <h2 className="font-semibold mb-2">House preview</h2>
        {house ? (
          <pre className="bg-slate-100 p-3 rounded mt-2 text-xs overflow-auto">{JSON.stringify(house, null, 2)}</pre>
        ) : (
          <p className="text-sm text-slate-500">No house loaded. Start empty or load sample.</p>
        )}
      </div>
    </div>
  );
}
