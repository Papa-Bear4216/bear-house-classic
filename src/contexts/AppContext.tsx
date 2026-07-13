import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getHouseholdSession, signOut, HouseholdMember, HouseholdRole } from '@/lib/householdAuth';

interface AppContextType {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  currentUser: HouseholdMember | null;
  currentRole: HouseholdRole | null;
  householdId: string | null;
  loading: boolean;
  logout: () => void;
}

const defaultAppContext: AppContextType = {
  sidebarOpen: false,
  toggleSidebar: () => {},
  currentUser: null,
  currentRole: null,
  householdId: null,
  loading: true,
  logout: () => {},
};

const AppContext = createContext<AppContextType>(defaultAppContext);

export const useAppContext = () => useContext(AppContext);

export const AppProvider: React.FC<{ children: React.ReactNode; onLogout?: () => void }> = ({ children, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<HouseholdMember | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHouseholdSession().then((result) => {
      setCurrentUser(result?.member ?? null);
      setHouseholdId(result?.householdId ?? null);
      setLoading(false);
    });
  }, []);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  const logout = useCallback(() => {
    signOut();
    setCurrentUser(null);
    setHouseholdId(null);
    if (onLogout) onLogout();
  }, [onLogout]);

  const currentRole = currentUser?.role ?? null;

  return (
    <AppContext.Provider
      value={{ sidebarOpen, toggleSidebar, currentUser, currentRole, householdId, loading, logout }}
    >
      {children}
    </AppContext.Provider>
  );
};
