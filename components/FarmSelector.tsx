import React from 'react';
import { Building2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useHierarchy } from '../contexts/HierarchyContext';
import HierarchyCombobox from './hierarchy/HierarchyCombobox';

const FarmSelector: React.FC = () => {
  const { user } = useAuth();
  const { organizationId, selectedOrganization, selectedFarm, farms, setSelectedFarm, searchFarms, loadMoreFarms, hasMore, loading, errors } =
    useHierarchy();

  // Não mostrar se não houver organização selecionada (usa organizationId para evitar flicker durante carregamento)
  if (!organizationId) {
    return null;
  }

  if (!user || (user.qualification !== 'analista' && user.qualification !== 'cliente' && user.role !== 'admin')) {
    return null;
  }

  const activeFarms = farms.filter(f => f.ativo !== false);

  return (
    <HierarchyCombobox
      label="Fazenda"
      icon={<Building2 className="w-4 h-4 text-ai-accent flex-shrink-0" />}
      items={activeFarms}
      selectedItem={selectedFarm}
      getItemId={item => item.id}
      getItemLabel={item => item.name}
      getItemDescription={item => `${item.city}, ${item.state || item.country}`}
      onSelect={setSelectedFarm}
      onSearch={searchFarms}
      onLoadMore={loadMoreFarms}
      hasMore={hasMore.farms}
      isLoading={loading.farms}
      error={errors.farms}
      dropdownTitle="Fazendas"
      emptyLabel="Nenhuma fazenda vinculada"
      className="min-w-[180px]"
    />
  );
};

export default FarmSelector;
