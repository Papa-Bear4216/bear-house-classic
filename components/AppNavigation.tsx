'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import {
  Home, LayoutDashboard, ShoppingCart, UtensilsCrossed, Package,
  MapPin, MessageCircle, CalendarDays, Image as ImageIcon, Video,
  Wallet, Cpu, Camera, Gift, Gamepad2, Search, Clock, LogOut,
  Bell, Plus, X, Menu, Settings, Joystick,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useFamilyMembers } from '@/hooks/use-family';
import { CurrentUserProvider, useCurrentUser } from '@/hooks/use-current-user';
import { registerFCMToken, onForegroundMessage } from '@/lib/fcm';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { format } from 'date-fns';

// ─── Tab structure ─────────────────────────────────────────────────────────────
// Maps top-level tabs to their sub-pages

export const NAV_STRUCTURE = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    href: '/',
    color: 'bg-indigo-600',
    sub: [],
  },
  {
    id: 'household',
    label: 'Household',
    icon: Home,
    href: '/missions',
    color: 'bg-orange-500',
    sub: [
      { label: 'Tasks', href: '/missions', icon: Gamepad2 },
      { label: 'Shopping', href: '/shopping', icon: ShoppingCart },
      { label: 'Meals', href: '/meals', icon: UtensilsCrossed },
      { label: 'Pantry', href: '/inventory', icon: Package },
      { label: 'Map', href: '/map', icon: MapPin },
      { label: 'Scanner', href: '/scanner', icon: Camera },
    ],
  },
  {
    id: 'family',
    label: 'Family',
    icon: MessageCircle,
    href: '/messages',
    color: 'bg-violet-600',
    sub: [
      { label: 'Messages', href: '/messages', icon: MessageCircle },
      { label: 'Calendar', href: '/calendar', icon: CalendarDays },
      { label: 'Gallery', href: '/gallery', icon: ImageIcon },
      { label: 'Video Calls', href: '/calls', icon: Video },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: Wallet,
    href: '/budget',
    color: 'bg-emerald-600',
    sub: [
      { label: 'Budget', href: '/budget', icon: Wallet },
      { label: 'Hermes AI', href: '/assistant', icon: Cpu },
      { label: 'Rewards', href: '/rewards', icon: Gift },
      { label: 'Games', href: '/games', icon: Joystick },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

function getActiveTab(pathname: string) {
  if (pathname === '/') return 'dashboard';
  for (const tab of NAV_STRUCTURE) {
    if (tab.sub.some(s => pathname.startsWith(s.href))) return tab.id;
    if (pathname.startsWith(tab.href) && tab.href !== '/') return tab.id;
  }
  return 'dashboard';
}

// ─── Clock ────────────────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => setTime(format(new Date(), 'h:mm a'));
    tick();
    const t = setInterval(tick, 10000);
    return () => clearInterval(t);
  }, []);
  return <span className="text-sm font-medium text-slate-300">{time}</span>;
}

// ─── Main navigation ──────────────────────────────────────────────────────────

export function AppNavigationContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeTabId = getActiveTab(pathname);
  const activeTab = NAV_STRUCTURE.find(t => t.id === activeTabId)!;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifStatus, setNotifStatus] = useState<'idle' | 'loading' | 'on' | 'denied'>('idle');
  const [foregroundToast, setForegroundToast] = useState<{ title: string; body?: string } | null>(null);
  const { currentUser } = useCurrentUser();
  const { users } = useFamilyMembers();
  const isChild = currentUser?.role === 'child';
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

  // Hide budget from children
  const visibleTabs = NAV_STRUCTURE.map(tab => ({
    ...tab,
    sub: tab.sub.filter(s => !(isChild && s.href === '/budget')),
  }));

  useEffect(() => {
    if (!currentUser?.id) return;
    const unsub = onForegroundMessage((payload) => {
      setForegroundToast({ title: payload.title ?? 'Bear House', body: payload.body });
      setTimeout(() => setForegroundToast(null), 5000);
    });
    return unsub;
  }, [currentUser?.id]);

  async function handleLogout() {
    try { await signOut(auth); window.location.href = '/login'; }
    catch (err) { console.error('Logout failed:', err); }
  }

  async function handleEnableNotifications() {
    if (!currentUser?.id) return;
    setNotifStatus('loading');
    const result = await registerFCMToken(currentUser.id);
    setNotifStatus(result.success ? 'on' : result.error === 'Permission denied' ? 'denied' : 'idle');
  }

  return (
    <div className="min-h-screen bg-[#020817] text-white flex flex-col">

      {/* ── Top Bar ── */}
      <header className="flex-shrink-0 border-b border-slate-800 bg-[#020817]">
        <div className="flex items-center gap-4 px-4 h-14">

          {/* Logo */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xs font-black">
              FO
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-white leading-none">Family OS</p>
              {currentUser && (
                <p className="text-[10px] text-slate-400 leading-none mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block mr-1" />
                  Hi, {currentUser.name.split(' ')[0]}
                </p>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-md hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search tasks & events..."
                className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg pl-9 pr-3 py-1.5 text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:bg-slate-800 transition-colors"
              />
            </div>
          </div>

          <div className="flex-1" />

          {/* Right side */}
          <div className="flex items-center gap-3">
            <LiveClock />

            <button
              onClick={handleEnableNotifications}
              className={`p-1.5 rounded-lg transition-colors ${notifStatus === 'on' ? 'text-green-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
              title={notifStatus === 'on' ? 'Notifications on' : 'Enable notifications'}
            >
              <Bell className="w-4 h-4" />
            </button>

            {currentUser && (
              <div className="flex items-center gap-2">
                {currentUser.avatarUrl ? (
                  <Image src={currentUser.avatarUrl} alt={currentUser.name} width={28} height={28}
                    className="w-7 h-7 rounded-full border border-slate-700 object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className={`w-7 h-7 rounded-full ${currentUser.color} flex items-center justify-center text-white text-xs font-bold`}>
                    {currentUser.name[0]}
                  </div>
                )}
              </div>
            )}

            <button onClick={handleLogout} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>

            {/* Mobile menu */}
            <button onClick={() => setMobileMenuOpen(true)} className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg">
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Tab row ── */}
        <nav className="hidden md:flex items-center gap-1 px-4 pb-0">
          {visibleTabs.map(tab => {
            const isActive = tab.id === activeTabId;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-t-lg text-sm font-medium transition-all ${
                  isActive
                    ? `${tab.color} text-white shadow-lg`
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* ── Sub-tab row (when active tab has sub-items) ── */}
      {activeTab.sub.length > 0 && (
        <div className="hidden md:flex items-center gap-1 px-4 py-2 border-b border-slate-800 bg-slate-900/40">
          {activeTab.sub.map(sub => {
            const isActive = pathname === sub.href || pathname.startsWith(sub.href + '/');
            const Icon = sub.icon;
            return (
              <Link
                key={sub.href}
                href={sub.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {sub.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Page content ── */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>

      {/* ── Floating + button ── */}
      <Link
        href="/missions"
        className="fixed bottom-6 right-6 w-12 h-12 bg-indigo-600 hover:bg-indigo-500 rounded-full flex items-center justify-center shadow-xl shadow-indigo-900/40 transition-colors z-40"
      >
        <Plus className="w-5 h-5 text-white" />
      </Link>

      {/* ── Mobile menu overlay ── */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 z-50 md:hidden"
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="fixed inset-y-0 right-0 w-72 bg-slate-900 z-50 flex flex-col md:hidden border-l border-slate-800"
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-800">
                <p className="font-bold text-white">Menu</p>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1.5 text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-4 space-y-4">
                {visibleTabs.map(tab => {
                  const Icon = tab.icon;
                  return (
                    <div key={tab.id}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">{tab.label}</p>
                      {tab.sub.length > 0 ? (
                        <div className="space-y-1">
                          {tab.sub.map(sub => {
                            const SubIcon = sub.icon;
                            const isActive = pathname === sub.href;
                            return (
                              <Link key={sub.href} href={sub.href} onClick={() => setMobileMenuOpen(false)}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                              >
                                <SubIcon className="w-4 h-4" /> {sub.label}
                              </Link>
                            );
                          })}
                        </div>
                      ) : (
                        <Link href={tab.href} onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${pathname === tab.href ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                        >
                          <Icon className="w-4 h-4" /> {tab.label}
                        </Link>
                      )}
                    </div>
                  );
                })}
              </nav>
              <div className="p-4 border-t border-slate-800">
                <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-slate-800 rounded-lg">
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Foreground notification toast ── */}
      <AnimatePresence>
        {foregroundToast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
            className="fixed top-4 right-4 z-[200] max-w-sm bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-4 flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-indigo-900 flex items-center justify-center shrink-0 text-sm">🔔</div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-white">{foregroundToast.title}</p>
              {foregroundToast.body && <p className="text-xs text-slate-400 mt-0.5">{foregroundToast.body}</p>}
            </div>
            <button onClick={() => setForegroundToast(null)} className="text-slate-500 hover:text-white shrink-0">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AppNavigation({ children }: { children: React.ReactNode }) {
  return (
    <CurrentUserProvider>
      <AppNavigationContent>{children}</AppNavigationContent>
    </CurrentUserProvider>
  );
}
