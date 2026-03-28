import React from 'react';
import { User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useHierarchy } from '../contexts/HierarchyContext';
import HierarchyCombobox from './hierarchy/HierarchyCombobox';

const AnalystSelector: React.FC = () => {
  const { user } = useAuth();
  const { analysts, selectedAnalyst, setSelectedAnalyst, searchAnalysts, loadMoreAnalysts, hasMore, loading, errors } =
    useHierarchy();

  if (!user || user.role !== 'admin') {
    return null;
  }

  return (
    <HierarchyCombobox
      label="Analista"
      icon={<User className="w-4 h-4 text-ai-accent flex-shrink-0" />}
      items={analysts}
      selectedItem={selectedAnalyst}
      getItemId={item => item.id}
      getItemLabel={item => item.name}
      getItemDescription={item => item.email || null}
      onSelect={setSelectedAnalyst}
      onSearch={searchAnalysts}
      onLoadMore={loadMoreAnalysts}
      hasMore={hasMore.analysts}
      isLoading={loading.analysts}
      error={errors.analysts}
      dropdownTitle="Analistas"
      emptyLabel="Nenhum analista cadastrado"
    />
  );
};

export default AnalystSelector;
