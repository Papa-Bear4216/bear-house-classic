import { useState, useCallback, useEffect, useRef } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import LoginPage from "@/pages/Login";
import SetupPage from "@/pages/Setup";
import BillingLockedPage from "@/pages/BillingLocked";
import { onAuthStateChange, getHouseholdSession, getAccessToken, initNativeAuthRedirect } from "@/lib/householdAuth";
import { pullFromCloud, subscribeToRealtime, supabase } from "@/lib/sync";
import { AppProvider, useAppContext } from "@/contexts/AppContext";

const queryClient = new QueryClient();

type AuthState = 'loading' | 'signed_out' | 'needs_setup' | 'ready';

// Rendered inside <AppProvider>, so useAppContext() (and therefore
// subscriptionStatus) is available here. Grandfathered household #1 has
// subscription_status='active' set directly in SQL — treat 'active' as
// sufficient regardless of how it got set, no other bypass.
const AuthedApp: React.FC = () => {
  const { subscriptionStatus, bypassBilling } = useAppContext();

  if (!bypassBilling && subscriptionStatus !== null && subscriptionStatus !== 'active') {
    return <BillingLockedPage />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
};

const App = () => {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [syncReady, setSyncReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('billing') === 'success') {
      params.delete('billing');
      const newSearch = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (newSearch ? `?${newSearch}` : ''));
    }
  }, []);

  useEffect(() => initNativeAuthRedirect(), []);

  // Tracks the live Realtime subscription across calls (not just per-mount)
  // so a resume-triggered reload can tear down the previous — possibly
  // dead — channel before opening a fresh one, instead of leaking it.
  const unsubRealtimeRef = useRef<(() => void) | undefined>(undefined);

  const loadSession = useCallback(() => {
    getHouseholdSession().then((result) => {
      if (!result) {
        setAuthState((prev) => (prev === 'loading' ? 'signed_out' : prev));
        setSyncReady(true);
        return;
      }
      setAuthState('ready');
      pullFromCloud(result.householdId).finally(() => setSyncReady(true));
      unsubRealtimeRef.current?.();
      unsubRealtimeRef.current = subscribeToRealtime(result.householdId);
    });

    return () => unsubRealtimeRef.current?.();
  }, []);

  useEffect(() => {
    const cleanupSession = loadSession();

    const unsubAuth = onAuthStateChange((loggedIn) => {
      if (!loggedIn) { setAuthState('signed_out'); setSyncReady(true); }
    });

    return () => {
      unsubAuth();
      cleanupSession?.();
    };
  }, [loadSession]);

  // Android backgrounds the WebView freely, and Supabase Realtime's
  // WebSocket doesn't auto-reconnect once that happens — silently going
  // stale until the next full app restart. Re-run loadSession (fresh pull +
  // fresh Realtime subscription) whenever the app comes back to the
  // foreground, on both native (Capacitor resume) and web (visibilitychange).
  const loadSessionRef = useRef(loadSession);
  loadSessionRef.current = loadSession;

  useEffect(() => {
    if (authState !== 'ready') return;

    const resumeSession = () => { loadSessionRef.current(); };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') resumeSession();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const listenerPromise = CapacitorApp.addListener('resume', resumeSession);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      listenerPromise.then((l) => l.remove());
    };
  }, [authState]);

  // getHouseholdSession() returns null for both "not signed in" and "signed
  // in but no household row yet" — disambiguate via the Supabase auth
  // session directly. A pending invite (household_members row with a
  // matching email and no auth_user_id) is claimed automatically here,
  // before falling back to /setup's "create a new household" flow.
  useEffect(() => {
    if (authState !== 'signed_out') return;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return;
      const token = await getAccessToken();
      if (token) {
        try {
          const res = await fetch('/api/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action: 'claimInvite' }),
          });
          if (res.ok) { loadSession(); return; }
        } catch { /* fall through to /setup */ }
      }
      setAuthState('needs_setup');
    });
  }, [authState, loadSession]);

  const handleLogout = useCallback(() => setAuthState('signed_out'), []);
  const handleHouseholdCreated = useCallback(() => {
    setAuthState('loading');
    setSyncReady(false);
    loadSession();
  }, [loadSession]);

  if (authState === 'loading' || !syncReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 text-sm animate-pulse">Loading Family OS…</div>
      </div>
    );
  }

  if (authState === 'signed_out') {
    return (
      <ThemeProvider defaultTheme="dark">
        <LoginPage />
      </ThemeProvider>
    );
  }

  if (authState === 'needs_setup') {
    return (
      <ThemeProvider defaultTheme="dark">
        <SetupPage onHouseholdCreated={handleHouseholdCreated} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AppProvider onLogout={handleLogout}>
            <AuthedApp />
          </AppProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
