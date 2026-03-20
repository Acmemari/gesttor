import React from 'react';
import { User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useHierarchy } from '../contexts/HierarchyContext';
import HierarchyCombobox from './hierarchy/HierarchyCombobox';

const ClientSelector: React.FC = () => {
  const { user } = useAuth();
  const {
    selectedAnalyst,
    selectedClient,
    clients,
    setSelectedClient,
    searchClients,
    loadMoreClients,
    hasMore,
    loading,
    errors,
  } = useHierarchy();

  // Não mostrar se não for analista ou admin
  if (!user || (user.qualification !== 'analista' && user.role !== 'admin')) {
    return null;
  }

  const disabled = user.role === 'admin' && !selectedAnalyst;

  return (
    <HierarchyCombobox
      label="Organizações"
      icon={<User className="w-4 h-4 text-ai-accent flex-shrink-0" />}
      items={clients}
      selectedItem={selectedClient}
      getItemId={item => item.id}
      getItemLabel={item => item.name}
      getItemDescription={item => item.email || null}
      onSelect={setSelectedClient}
      onSearch={searchClients}
      onLoadMore={loadMoreClients}
      hasMore={hasMore.clients}
      isLoading={loading.clients}
      error={errors.clients}
      disabled={disabled}
      emptyLabel={disabled ? 'Selecione um analista primeiro' : 'Nenhuma organização cadastrada'}
      className="min-w-[180px]"
    />
  );
};

export default ClientSelector;
