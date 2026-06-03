import React from 'react';
import AppLayout from '@/components/AppLayout';
import { AppProvider } from '@/contexts/AppContext';

interface IndexProps {
  onLogout?: () => void;
}

const Index: React.FC<IndexProps> = ({ onLogout }) => {
  return (
    <AppProvider onLogout={onLogout}>
      <AppLayout />
    </AppProvider>
  );
};

export default Index;
