import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { User, UserRole } from '@/lib/familyos';
import { getHouseholdSession, getHouseholdRoster, signOut } from '@/lib/householdAuth';

interface AppContextType {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  currentUser: User | null;
  currentRole: UserRole | null;
  householdMembers: User[];
  householdId: string | null;
  logout: () => void;
  setCurrentUser: (user: User | null) => void;
}

const defaultAppContext: AppContextType = {
  sidebarOpen: false,
  toggleSidebar: () => {},
  currentUser: null,
  currentRole: null,
  householdMembers: [],
  householdId: null,
  logout: () => {},
  setCurrentUser: () => {},
};

const AppContext = createContext<AppContextType>(defaultAppContext);

export const useAppContext = () => useContext(AppContext);

export const AppProvider: React.FC<{ children: React.ReactNode; onLogout?: () => void }> = ({ children, onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser, setCurrentUserState] = useState<User | null>(null);
  const [currentRole, setCurrentRoleState] = useState<UserRole | null>(null);
  const [householdMembers, setHouseholdMembers] = useState<User[]>([]);
  const [householdId, setHouseholdId] = useState<string | null>(null);

  useEffect(() => {
    const loadUserAndHousehold = async () => {
      const session = await getHouseholdSession();
      if (!session) {
        setCurrentUserState(null);
        setCurrentRoleState(null);
        setHouseholdMembers([]);
        setHouseholdId(null);
        return;
      }

      const user: User = {
        id: session.member.id,
        name: session.member.name,
        email: session.member.email ?? '',
        role: session.member.role as User['role'],
        color: session.member.color as User['color'],
      };
      setCurrentUserState(user);
      setCurrentRoleState(session.member.role as UserRole);
      setHouseholdId(session.householdId);

      const roster = await getHouseholdRoster(session.householdId);
      const users: User[] = roster.map(m => ({
        id: m.id,
        name: m.name,
        email: m.email ?? '',
        role: m.role as User['role'],
        color: m.color as User['color'],
      }));
      setHouseholdMembers(users);
    };

    loadUserAndHousehold();
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen(prev => !prev);
  };

  const logout = useCallback(() => {
    signOut();
    setCurrentUserState(null);
    setCurrentRoleState(null);
    setHouseholdMembers([]);
    setHouseholdId(null);
    if (onLogout) onLogout();
  }, [onLogout]);

  const setCurrentUser = useCallback((user: User | null) => {
    setCurrentUserState(user);
    if (user) {
      setCurrentRoleState(user.role);
    } else {
      setCurrentRoleState(null);
    }
  }, []);

  return (
    <AppContext.Provider
      value={{
        sidebarOpen,
        toggleSidebar,
        currentUser,
        currentRole,
        householdMembers,
        householdId,
        logout,
        setCurrentUser,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
