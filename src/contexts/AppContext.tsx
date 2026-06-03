import React, { createContext, useContext, useState, useCallback } from 'react';
import { User, UserRole, getSession, clearSession, USERS } from '@/lib/familyos';

interface AppContextType {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  currentUser: User | null;
  currentRole: UserRole | null;
  logout: () => void;
  setCurrentUser: (user: User | null) => void;
}

const defaultAppContext: AppContextType = {
  sidebarOpen: false,
  toggleSidebar: () => {},
  currentUser: null,
  currentRole: null,
  logout: () => {},
  setCurrentUser: () => {},
};

const AppContext = createContext<AppContextType>(defaultAppContext);

export const useAppContext = () => useContext(AppContext);

export const AppProvider: React.FC<{ children: React.ReactNode; onLogout?: () => void }> = ({ children, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const session = getSession();
  const initialUser = session ? USERS.find(u => u.id === session.userId) ?? null : null;

  const [currentUser, setCurrentUserState] = useState<User | null>(initialUser);

  const toggleSidebar = () => {
    setSidebarOpen(prev => !prev);
  };

  const logout = useCallback(() => {
    clearSession();
    setCurrentUserState(null);
    if (onLogout) onLogout();
  }, [onLogout]);

  const setCurrentUser = useCallback((user: User | null) => {
    setCurrentUserState(user);
  }, []);

  const currentRole = currentUser?.role ?? null;

  return (
    <AppContext.Provider
      value={{
        sidebarOpen,
        toggleSidebar,
        currentUser,
        currentRole,
        logout,
        setCurrentUser,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
