'use client';

import dynamic from 'next/dynamic';
import { MapPin } from 'lucide-react';

const FamilyMap = dynamic(() => import('@/components/FamilyMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] bg-slate-800/60 border border-slate-700 rounded-2xl animate-pulse flex items-center justify-center">
      <div className="text-slate-500 flex items-center gap-2 flex-col">
        <MapPin className="w-7 h-7 opacity-40" />
        <span className="text-sm">Loading floorplan…</span>
      </div>
    </div>
  )
});

export default function MapPage() {
  return (
    <div className="px-6 py-6 max-w-6xl mx-auto flex flex-col gap-5" style={{ height: 'calc(100vh - 7rem)' }}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-rose-600 rounded-xl flex items-center justify-center">
          <MapPin className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Home Map</h1>
          <p className="text-xs text-slate-500">Pin tasks to rooms on your floorplan</p>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative z-0">
        <FamilyMap />
      </div>
    </div>
  );
}
