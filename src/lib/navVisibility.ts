import {
  Home, Calendar, Handshake, Heart, LayoutDashboard, Users, DollarSign, Baby, Trophy,
} from 'lucide-react';
import type { UserRole } from './familyos';

export type TopModule =
  | 'dashboard' | 'household' | 'kids' | 'family' | 'health' | 'finance'
  | 'rewards' | 'quality' | 'promises' | 'emotions';

export interface NavModule {
  id: TopModule;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const ALL_MODULES: NavModule[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'household', label: 'Household', icon: Home },
  { id: 'rewards', label: 'Rewards', icon: Trophy },
  { id: 'kids', label: 'Kids', icon: Baby },
  { id: 'family', label: 'Family', icon: Users },
  { id: 'health', label: 'Health', icon: Heart },
  { id: 'finance', label: 'Finance', icon: DollarSign },
  { id: 'quality', label: 'Quality Time', icon: Calendar },
  { id: 'promises', label: 'Promises', icon: Handshake },
  { id: 'emotions', label: 'Emotions', icon: Heart },
];

const CHILD_RESTRICTED: TopModule[] = ['health', 'finance', 'quality', 'promises', 'emotions'];
const ADMIN_ONLY: TopModule[] = ['finance'];

export function isModuleVisibleTo(role: UserRole, id: TopModule): boolean {
  if (role === 'child' && CHILD_RESTRICTED.includes(id)) return false;
  if (role !== 'superadmin' && role !== 'admin' && ADMIN_ONLY.includes(id)) return false;
  return true;
}

export function getVisibleModulesFor(role: UserRole): NavModule[] {
  return ALL_MODULES.filter((m) => isModuleVisibleTo(role, m.id));
}

export const DEFAULT_CORE_NAV: TopModule[] = ['household', 'family', 'rewards'];
