import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { type BentoModuleId, type TriadScope, validateTriadScopeAccess } from '@/lib/triadFusion';
import { useAppContext } from '@/contexts/AppContext';

interface BentoGridContextType {
  expandedModule: BentoModuleId | null;
  originRect: DOMRect | null;
  expandModule: (id: BentoModuleId, element?: HTMLElement | null) => boolean;
  collapseModule: () => void;
  scope: TriadScope;
  isExpanding: boolean;
}

const BentoGridContext = createContext<BentoGridContextType | null>(null);

export const useBentoGrid = () => {
  const ctx = useContext(BentoGridContext);
  if (!ctx) {
    throw new Error('useBentoGrid must be used within a BentoGridProvider');
  }
  return ctx;
};

export const BentoGridProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    currentUser,
    currentRole,
    householdId,
    subscriptionStatus,
    bypassBilling,
  } = useAppContext();

  const [expandedModule, setExpandedModule] = useState<BentoModuleId | null>(null);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const [isExpanding, setIsExpanding] = useState(false);

  // Derive immutable Triad Scope from core AppContext
  const scope: TriadScope = useMemo(() => ({
    householdId,
    memberId: currentUser?.id ?? null,
    memberName: currentUser?.name ?? 'Guest',
    role: currentRole,
    subscriptionStatus,
    bypassBilling,
    timestamp: Date.now(),
  }), [householdId, currentUser?.id, currentUser?.name, currentRole, subscriptionStatus, bypassBilling]);

  const collapseModule = useCallback(() => {
    setExpandedModule(null);
    setIsExpanding(false);
    setTimeout(() => {
      setOriginRect(null);
    }, 280); // Stiff spring settle delay
  }, []);

  const expandModule = useCallback((id: BentoModuleId, element?: HTMLElement | null): boolean => {
    // Strictly enforce Triad Scope role boundary before expanding
    const access = validateTriadScopeAccess(scope, id);
    if (!access.allowed) {
      console.warn(`[Triad Fusion] Access blocked to module '${id}': ${access.reason}`);
      return false;
    }

    if (element) {
      setOriginRect(element.getBoundingClientRect());
    } else {
      setOriginRect(null);
    }

    setIsExpanding(true);
    setExpandedModule(id);
    return true;
  }, [scope]);

  // Global layout keyboard listener: ESC key immediately collapses any open module state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && expandedModule) {
        e.preventDefault();
        e.stopPropagation();
        collapseModule();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [expandedModule, collapseModule]);

  return (
    <BentoGridContext.Provider
      value={{
        expandedModule,
        originRect,
        expandModule,
        collapseModule,
        scope,
        isExpanding,
      }}
    >
      {children}
    </BentoGridContext.Provider>
  );
};
