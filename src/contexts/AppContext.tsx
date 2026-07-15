import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { User, UserRole, getSession, clearSession } from '@/lib/familyos';
import { dbGetHouseholdMemberById, dbGetHouseholdMembersByHouseholdId } from '@/lib/householdDb';

interface AppContextType {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  currentUser: User | null;
  currentRole: UserRole | null;
  householdMembers: User[];
  logout: () => void;
  setCurrentUser: (user: User | null) => void;
}

const defaultAppContext: AppContextType = {
  sidebarOpen: false,
  toggleSidebar: () => {},
  currentUser: null,
  currentRole: null,
  householdMembers: [],
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

  useEffect(() => {
    const loadUserAndHousehold = async () => {
      const session = getSession();
      if (session?.userId) {
        const member = await dbGetHouseholdMemberById(session.userId);
        if (member) {
          const user: User = {
            id: member.id,
            name: member.name,
            email: member.email ?? '',
            role: member.role as User['role'],
            color: member.color as User['color'],
          };
          setCurrentUserState(user);
          setCurrentRoleState(member.role as UserRole);

          // Fetch all members of the same household
          const householdMembers = await dbGetHouseholdMembersByHouseholdId(member.household_id);
          const users: User[] = householdMembers.map(m => ({
            id: m.id,
            name: m.name,
            email: m.email ?? '',
            role: m.role as User['role'],
            color: m.color as User['color'],
          }));
          setHouseholdMembers(users);
        } else {
          // If no member found, clear session
          clearSession();
          setCurrentUserState(null);
          setCurrentRoleState(null);
          setHouseholdMembers([]);
        }
      } else {
        setCurrentUserState(null);
        setCurrentRoleState(null);
        setHouseholdMembers([]);
      }
    };

    loadUserAndHousehold();
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen(prev => !prev);
  };

  const logout = useCallback(() => {
    clearSession();
    setCurrentUserState(null);
    setCurrentRoleState(null);
    setHouseholdMembers([]);
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
        logout,
        setCurrentUser,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
