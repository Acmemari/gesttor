import React, { useCallback, useEffect, useState } from 'react';
import { HelpCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useHierarchy } from '../contexts/HierarchyContext';
import ClientSelector from './ClientSelector';
import FarmSelector from './FarmSelector';
import AnalystSelector from './AnalystSelector';
import SupportTicketModal from './SupportTicketModal';
import { getAdminUnreadCount, subscribeAdminUnread } from '../lib/supportTickets';
import SelectorErrorBoundary from './hierarchy/SelectorErrorBoundary';

interface AnalystHeaderProps {
  selectedFarm?: { id: string; name: string } | null;
  onSelectFarm?: (farm: { id: string; name: string } | null) => void;
}

const AnalystHeader: React.FC<AnalystHeaderProps> = () => {
  const { user } = useAuth();
  const { selectedOrganization: selectedClient, selectedAnalyst, selectedFarm } = useHierarchy();
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isLoadingUnread, setIsLoadingUnread] = useState(false);
  const [adminUnreadCount, setAdminUnreadCount] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (user?.role !== 'admin') return;
    try {
      const count = await getAdminUnreadCount();
      setAdminUnreadCount(count);
    } catch (error) {
      console.error('[AnalystHeader] unread count error:', error);
    }
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    let active = true;
    setIsLoadingUnread(true);

    (async () => {
      await refreshUnread();
      if (active) setIsLoadingUnread(false);
    })();

    const unsubscribe = subscribeAdminUnread(() => {
      void refreshUnread();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [user?.role, refreshUnread]);

  const handleCloseSupport = useCallback(() => {
    setIsSupportOpen(false);
    // Atualizar badge ao fechar para refletir leituras do admin
    void refreshUnread();
  }, [refreshUnread]);

  if (!user) return null;

  const isProfileLoaded = user.qualification !== undefined || user.role === 'admin';

  if (!isProfileLoaded) {
    return (
      <header className="h-12 bg-ai-surface border-b border-ai-border flex items-center px-4 shrink-0 sticky top-0 z-50">
        <div className="flex items-center gap-4 animate-pulse">
          <div className="h-4 w-20 bg-ai-border rounded" />
          <div className="h-6 w-px bg-ai-border" />
          <div className="h-4 w-32 bg-ai-border rounded" />
          <div className="h-6 w-px bg-ai-border" />
          <div className="h-4 w-24 bg-ai-border rounded" />
        </div>
      </header>
    );
  }

  const isVisitor = user.qualification === 'visitante';
  const isCliente = user.qualification === 'cliente';

  // Visitantes: header com hierarquia fixa (seletores desabilitados/ocultos)
  if (isVisitor) {
    return (
      <header className="h-12 bg-ai-surface border-b border-ai-border flex items-center justify-between px-4 shrink-0 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ai-text">Inttegra (Visitante)</span>
          <span className="text-ai-subtext/50 text-sm select-none">/</span>
          <span className="text-sm font-medium text-ai-text">Visitante Demo</span>
          {selectedFarm && (
            <>
              <span className="text-ai-subtext/50 text-sm select-none">/</span>
              <span className="text-sm font-medium text-ai-text">{selectedFarm.name}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSupportOpen(true)}
            className="relative inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border border-ai-border text-ai-text hover:bg-ai-surface2"
            title="Suporte interno"
            aria-label="Suporte"
          >
            <HelpCircle className="w-4 h-4" />
            Suporte
          </button>
        </div>
      </header>
    );
  }

  // Clientes: header com organização fixa e seletor de fazenda
  if (isCliente) {
    return (
      <>
        <header className="h-12 bg-ai-surface border-b border-ai-border flex items-center justify-between px-4 shrink-0 sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ai-text">
              {selectedClient ? selectedClient.name : 'Carregando...'}
            </span>
            {selectedClient && (
              <>
                <span className="text-ai-subtext/50 text-sm select-none">/</span>
                <SelectorErrorBoundary fallbackLabel="Fazenda">
                  <FarmSelector />
                </SelectorErrorBoundary>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSupportOpen(true)}
              className="relative inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border border-ai-border text-ai-text hover:bg-ai-surface2"
              title="Suporte interno"
              aria-label="Suporte"
            >
              <HelpCircle className="w-4 h-4" />
              Suporte
            </button>
          </div>
        </header>

        <SupportTicketModal isOpen={isSupportOpen} onClose={handleCloseSupport} />
      </>
    );
  }

  return (
    <>
      <header className="h-12 bg-ai-surface border-b border-ai-border flex items-center justify-between px-4 shrink-0 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          {/* Seletor de Analista (apenas para admin) ou Nome do Analista */}
          {user.role === 'admin' ? (
            <SelectorErrorBoundary fallbackLabel="Analista">
              <AnalystSelector />
            </SelectorErrorBoundary>
          ) : (
            <span className="text-sm font-medium text-ai-text">{user.name}</span>
          )}

          {/* Seletor de Organização (apenas se houver analista selecionado para admin, ou se for analista) */}
          {(user.role === 'admin' ? selectedAnalyst : true) && (
            <>
              <span className="text-ai-subtext/50 text-sm select-none">/</span>
              <SelectorErrorBoundary fallbackLabel="Organização">
                <ClientSelector />
              </SelectorErrorBoundary>

              {/* Seletor de Fazenda (apenas se houver cliente selecionado) */}
              {selectedClient && (
                <>
                  <span className="text-ai-subtext/50 text-sm select-none">/</span>
                  <SelectorErrorBoundary fallbackLabel="Fazenda">
                    <FarmSelector />
                  </SelectorErrorBoundary>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSupportOpen(true)}
            className="relative inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border border-ai-border text-ai-text hover:bg-ai-surface2"
            title="Suporte interno"
            aria-label={`Suporte${adminUnreadCount > 0 ? ` (${adminUnreadCount} não lidas)` : ''}`}
          >
            <HelpCircle className="w-4 h-4" />
            Suporte
            {user.role === 'admin' && (
              <>
                {isLoadingUnread ? (
                  <Loader2 className="w-3 h-3 animate-spin text-ai-subtext" />
                ) : adminUnreadCount > 0 ? (
                  <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold flex items-center justify-center">
                    {adminUnreadCount > 99 ? '99+' : adminUnreadCount}
                  </span>
                ) : null}
              </>
            )}
          </button>
        </div>
      </header>

      <SupportTicketModal isOpen={isSupportOpen} onClose={handleCloseSupport} />
    </>
  );
};

export default AnalystHeader;
