import React from 'react';
import { User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useHierarchy } from '../contexts/HierarchyContext';
import HierarchyCombobox from './hierarchy/HierarchyCombobox';

const ClientSelector: React.FC = () => {
  const { user } = useAuth();
  const {
    selectedAnalyst,
    selectedOrganization,
    organizations,
    setSelectedOrganization,
    searchOrganizations,
    loadMoreOrganizations,
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
      items={organizations}
      selectedItem={selectedOrganization}
      getItemId={item => item.id}
      getItemLabel={item => item.name}
      getItemDescription={item => item.email || null}
      onSelect={setSelectedOrganization}
      onSearch={searchOrganizations}
      onLoadMore={loadMoreOrganizations}
      hasMore={hasMore.organizations}
      isLoading={loading.organizations}
      error={errors.organizations}
      disabled={disabled}
      emptyLabel={disabled ? 'Selecione um analista primeiro' : 'Nenhuma organização cadastrada'}
      className="min-w-[180px]"
    />
  );
};

export default ClientSelector;
