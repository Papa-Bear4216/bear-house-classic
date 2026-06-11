'use client';

import { Video, Phone, Users, PhoneCall, Ban } from 'lucide-react';
import { useFamilyMembers } from '@/hooks/use-family';
import { useEvents } from '@/hooks/use-events';

export default function CallsPage() {
  const { users } = useFamilyMembers();
  const { events } = useEvents();

  const isUserBusy = (userId: string) => {
    const now = new Date();
    const todayStr = '2026-04-27'; // Hardcoding for AI Studio runtime or use now.toISOString().split('T')[0]
    const actualTodayStr = now.toISOString().split('T')[0];
    const currentTimeStr = now.toTimeString().substring(0, 5); // "HH:MM"
    
    // Check if they have an event today that encapsulates the current time
    return events.some(e => 
      e.userId === userId && 
      e.date === actualTodayStr && 
      e.startTime && e.endTime &&
      e.startTime <= currentTimeStr && e.endTime >= currentTimeStr
    );
  };

  const handleCall = (e: React.MouseEvent<HTMLAnchorElement>, user: any) => {
    if (isUserBusy(user.id)) {
      if (!window.confirm(`${user.name} currently has a scheduled event. Are you sure you want to call?`)) {
        e.preventDefault();
        return;
      }
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 xl:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        <header>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
              <Video className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-display text-4xl font-semibold tracking-tight text-slate-900">Video Calls</h1>
              <p className="text-slate-500 mt-1">Quick links to call family members on Google Meet.</p>
            </div>
          </div>
        </header>

        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-8 sm:p-10 text-white shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <Users className="w-12 h-12 text-indigo-200 mb-4" />
            <h2 className="font-display text-3xl font-semibold mb-2">Family Group Call</h2>
            <p className="text-indigo-100 max-w-md mb-8">
              Join the main family room to talk with everyone at once. Perfect for weekend catch-ups.
            </p>
            <a 
              href="https://meet.google.com/new" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white text-indigo-600 px-6 py-3 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow-sm"
            >
              <Video className="w-5 h-5 fill-current" />
              Join Family Meet
            </a>
          </div>
          
          {/* Decorative shapes */}
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
          <div className="absolute -bottom-20 right-20 w-48 h-48 bg-black/10 rounded-full blur-2xl mix-blend-overlay"></div>
        </div>

        <section>
          <h2 className="font-display text-2xl font-semibold mb-6 text-slate-800">Quick Dial Setup</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {users.map(user => {
              const busy = isUserBusy(user.id);
              return (
              <div key={user.id} className="flex items-center justify-between p-5 bg-white rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full ${user.color} flex items-center justify-center text-white font-bold text-xl shadow-inner`}>
                    {user.name[0]}
                  </div>
                  <div>
                    <h3 className="font-medium text-slate-900 flex items-center gap-2">
                       {user.name}
                       {busy && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold uppercase">Busy</span>}
                    </h3>
                    <p className="text-sm text-slate-500 capitalize">{user.role}</p>
                  </div>
                </div>
                
                <a 
                  href={user.meetLink || "https://meet.google.com/new"}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => handleCall(e, user)}
                  className={`p-3 rounded-xl transition-colors shrink-0 ${busy ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
                >
                  <PhoneCall className="w-5 h-5" />
                </a>
              </div>
            )})}
          </div>
        </section>
      </div>
    </div>
  );
}
