import { useState, useCallback, useEffect } from "react";
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
import { onAuthStateChange, getHouseholdSession } from "@/lib/householdAuth";
import { pullFromCloud, subscribeToRealtime, supabase } from "@/lib/sync";

const queryClient = new QueryClient();

type AuthState = 'loading' | 'signed_out' | 'needs_setup' | 'ready';

const App = () => {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [syncReady, setSyncReady] = useState(false);

  const loadSession = useCallback(() => {
    let unsubRealtime: (() => void) | undefined;

    getHouseholdSession().then((result) => {
      if (!result) {
        setAuthState((prev) => (prev === 'loading' ? 'signed_out' : prev));
        setSyncReady(true);
        return;
      }
      setAuthState('ready');
      pullFromCloud(result.householdId).finally(() => setSyncReady(true));
      unsubRealtime = subscribeToRealtime(result.householdId);
    });

    return () => unsubRealtime?.();
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

  // getHouseholdSession() returns null for both "not signed in" and "signed
  // in but no household row yet" — disambiguate via the Supabase auth
  // session directly so a new Google sign-in lands on /setup, not a login loop.
  useEffect(() => {
    if (authState !== 'signed_out') return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setAuthState('needs_setup');
    });
  }, [authState]);

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
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index onLogout={handleLogout} />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
