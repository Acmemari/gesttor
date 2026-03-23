import React from 'react';
import { Client } from '../types';
import { useHierarchy } from './HierarchyContext';

interface ClientContextType {
  selectedClient: Client | null;
  setSelectedClient: (client: Client | null) => void;
}

export const ClientProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;

export const useClient = (): ClientContextType => {
  const { selectedOrganization, setSelectedOrganization } = useHierarchy();
  return { selectedClient: selectedOrganization, setSelectedClient: setSelectedOrganization };
};
