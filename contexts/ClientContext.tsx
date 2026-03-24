/**
 * ATENÇÃO: "Client" e "Organization" são o mesmo conceito nesta base de código.
 *
 * `Client` é um alias legado de `Organization` (ver types.ts).
 * Novos componentes devem usar `useOrganization()` / `selectedOrganization` via HierarchyContext.
 * Este hook (`useClient`) existe apenas por compatibilidade com código existente.
 *
 * @deprecated Prefira `useHierarchy().selectedOrganization` em novos componentes.
 */
import React from 'react';
import { Client } from '../types';
import { useHierarchy } from './HierarchyContext';

interface ClientContextType {
  selectedClient: Client | null;
  setSelectedClient: (client: Client | null) => void;
}

export const ClientProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;

/** @deprecated Use `useHierarchy().selectedOrganization` em novos componentes. */
export const useClient = (): ClientContextType => {
  const { selectedOrganization, setSelectedOrganization } = useHierarchy();
  return { selectedClient: selectedOrganization, setSelectedClient: setSelectedOrganization };
};
