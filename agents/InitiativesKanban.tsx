import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ChevronRight, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAnalyst } from '../contexts/AnalystContext';
import { useClient } from '../contexts/ClientContext';
import { useFarm } from '../contexts/FarmContext';
import { fetchDeliveries, type DeliveryRow } from '../lib/deliveries';
import { fetchPeople, type Person } from '../lib/people';
import {
  fetchInitiatives,
  fetchInitiativeDetail,
  deleteTask,
  type InitiativeWithProgress,
  type InitiativeMilestoneRow,
  type InitiativeTaskRow,
} from '../lib/initiatives';
import InitiativeTasksKanban from '../components/InitiativeTasksKanban';
import TaskCreateModal from '../components/TaskCreateModal';
import TaskEditModal from '../components/TaskEditModal';

interface InitiativesKanbanProps {
  onToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const InitiativesKanban: React.FC<InitiativesKanbanProps> = ({ onToast }) => {
  const { user } = useAuth();
  const { selectedAnalyst } = useAnalyst();
  const { selectedClient } = useClient();
  const { selectedFarm } = useFarm();

  const isAdmin = user?.role === 'admin';
  const effectiveUserId = useMemo(
    () => (isAdmin && selectedAnalyst ? selectedAnalyst.id : user?.id),
    [isAdmin, selectedAnalyst, user?.id],
  );

  const [loading, setLoading] = useState(true);
  const [initiatives, setInitiatives] = useState<InitiativeWithProgress[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [people, setPeople] = useState<Person[]>([]);

  const [selectedDeliveryId, setSelectedDeliveryId] = useState('');
  const [selectedInitiativeId, setSelectedInitiativeId] = useState('');
  const [selectedMilestoneId, setSelectedMilestoneId] = useState('');

  const [viewing, setViewing] = useState<Awaited<ReturnType<typeof fetchInitiativeDetail>> | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTask, setEditTask] = useState<InitiativeTaskRow | null>(null);
  const [filterByResponsibleIds, setFilterByResponsibleIds] = useState<string[]>([]);
  const [openFilterDropdown, setOpenFilterDropdown] = useState<'responsible' | null>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  const toggleResponsibleFilter = useCallback((id: string) => {
    setFilterByResponsibleIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }, []);

  const peopleById = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);
  const personLabel = useCallback((p: Person) => p.preferred_name?.trim() || p.full_name || '—', []);

  // No Kanban, removemos filtros visuais (Projeto/Marco).
  // Mantemos selectedDeliveryId apenas para o modal de criação (pré-preenchimento/UX).
  const initiativesForView = useMemo(() => initiatives || [], [initiatives]);
  const initiativesForModal = useMemo(() => {
    const list = initiatives || [];
    if (!selectedDeliveryId) return list;
    return list.filter(i => i.delivery_id === selectedDeliveryId);
  }, [initiatives, selectedDeliveryId]);

  const milestonesAll = useMemo<InitiativeMilestoneRow[]>(
    () => (viewing?.milestones || []) as InitiativeMilestoneRow[],
    [viewing],
  );
  const milestonesForView = milestonesAll;

  const refresh = useCallback(async () => {
    if (!effectiveUserId) return;
    const filters = { clientId: selectedClient?.id, farmId: selectedFarm?.id };
    const [inits, dels, ppl] = await Promise.all([
      fetchInitiatives(effectiveUserId, filters),
      fetchDeliveries(effectiveUserId, { clientId: selectedClient?.id }),
      fetchPeople(effectiveUserId, { farmId: selectedFarm?.id, sharedScope: Boolean(selectedFarm?.id) }),
    ]);
    setInitiatives(inits);
    setDeliveries(dels);
    setPeople(ppl);
  }, [effectiveUserId, selectedClient?.id, selectedFarm?.id]);

  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        await refresh();
      } catch (e) {
        onToastRef.current?.(e instanceof Error ? e.message : 'Erro ao carregar Kanban', 'error');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refresh]);

  // Reset selections when farm or client changes
  useEffect(() => {
    setSelectedDeliveryId('');
    setSelectedInitiativeId('');
    setSelectedMilestoneId('');
    setViewing(null);
    setFilterByResponsibleIds([]);
    setOpenFilterDropdown(null);
  }, [selectedFarm?.id, selectedClient?.id]);

  useEffect(() => {
    if (!openFilterDropdown) return;
    const close = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node))
        setOpenFilterDropdown(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openFilterDropdown]);

  useEffect(() => {
    // Auto-seleciona ou valida a initiative selecionada
    if (selectedInitiativeId) {
      // Se a initiative selecionada não está na lista filtrada, resetar
      const stillValid = initiativesForView.some(i => i.id === selectedInitiativeId);
      if (!stillValid) {
        setSelectedInitiativeId(initiativesForView[0]?.id || '');
      }
    } else if (initiativesForView.length > 0) {
      setSelectedInitiativeId(initiativesForView[0].id);
    }
  }, [initiativesForView, selectedInitiativeId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!selectedInitiativeId) {
        setViewing(null);
        return;
      }
      try {
        const detail = await fetchInitiativeDetail(selectedInitiativeId);
        if (!mounted) return;
        setViewing(detail);
        // Se o marco selecionado (usado no modal) não existir mais para esta iniciativa, resetar.
        if (selectedMilestoneId && !detail.milestones?.some(m => m.id === selectedMilestoneId))
          setSelectedMilestoneId('');
        // Pré-preencher "Projeto" no modal com base na atividade selecionada.
        if (detail.delivery_id && !selectedDeliveryId) setSelectedDeliveryId(detail.delivery_id);
      } catch (e) {
        onToast?.(e instanceof Error ? e.message : 'Erro ao carregar iniciativa', 'error');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedInitiativeId, selectedMilestoneId, selectedDeliveryId, onToast]);

  const canCreateTask = !!viewing && (viewing.milestones || []).length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-ai-accent" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {!viewing ? (
        <div className="text-sm text-ai-subtext">
          {initiativesForView.length === 0
            ? 'Nenhuma atividade encontrada para o contexto selecionado no cabeçalho.'
            : 'Carregando Kanban da atividade...'}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3" ref={filterDropdownRef}>
            <div className="relative" data-filter-dropdown>
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={openFilterDropdown === 'responsible'}
                aria-label={`Filtrar por responsável${filterByResponsibleIds.length > 0 ? ` — ${filterByResponsibleIds.length} selecionado(s)` : ''}`}
                onClick={() => setOpenFilterDropdown(openFilterDropdown === 'responsible' ? null : 'responsible')}
                className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs border rounded-md ${filterByResponsibleIds.length > 0 ? 'border-ai-accent bg-ai-accent/10 text-ai-accent' : 'border-ai-border bg-ai-surface text-ai-text'}`}
              >
                <Users size={12} />
                Responsável{filterByResponsibleIds.length > 0 && ` (${filterByResponsibleIds.length})`}
                <ChevronRight
                  size={12}
                  className={`transition-transform ${openFilterDropdown === 'responsible' ? 'rotate-90' : ''}`}
                />
              </button>
              {openFilterDropdown === 'responsible' && (
                <div
                  role="listbox"
                  aria-label="Opções de responsável"
                  className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-ai-bg border border-ai-border rounded-lg shadow-lg py-1 min-w-[180px]"
                >
                  {people.length === 0 ? (
                    <p className="px-3 py-1.5 text-xs text-ai-subtext italic">Nenhuma pessoa cadastrada</p>
                  ) : (
                    people.map(p => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs text-ai-text hover:bg-ai-surface2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={filterByResponsibleIds.includes(p.id)}
                          onChange={() => toggleResponsibleFilter(p.id)}
                          className="rounded border-ai-border text-ai-accent w-3 h-3"
                        />
                        {personLabel(p)}
                      </label>
                    ))
                  )}
                  {filterByResponsibleIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterByResponsibleIds([]);
                        setOpenFilterDropdown(null);
                      }}
                      className="w-full text-left px-3 py-1.5 text-[10px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 border-t border-ai-border mt-1"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <InitiativeTasksKanban
            milestones={milestonesForView}
            filterByResponsibleIds={filterByResponsibleIds}
            onToast={onToast}
            onRefresh={async () => {
              if (selectedInitiativeId) {
                const detail = await fetchInitiativeDetail(selectedInitiativeId);
                setViewing(detail);
              }
              await refresh();
            }}
            responsibleLabel={personId => {
              if (!personId) return '—';
              const p = peopleById.get(personId);
              return p ? personLabel(p) : '—';
            }}
            onRequestCreateTask={() => {
              if (!canCreateTask) {
                onToast?.('Cadastre pelo menos um marco antes de criar tarefas.', 'warning');
                return;
              }
              setCreateOpen(true);
            }}
            onEditTask={task => setEditTask(task)}
            onDeleteTask={async task => {
              if (!window.confirm('Excluir esta tarefa? Esta ação não pode ser desfeita.')) return;
              try {
                await deleteTask(task.id);
                onToast?.('Tarefa excluída.', 'success');
                if (selectedInitiativeId) {
                  const detail = await fetchInitiativeDetail(selectedInitiativeId);
                  setViewing(detail);
                }
                await refresh();
              } catch (e) {
                onToast?.(e instanceof Error ? e.message : 'Erro ao excluir tarefa', 'error');
              }
            }}
          />

          <TaskCreateModal
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            onToast={onToast}
            deliveries={deliveries}
            initiatives={initiativesForModal}
            people={people}
            selectedDeliveryId={selectedDeliveryId}
            setSelectedDeliveryId={v => setSelectedDeliveryId(v)}
            selectedInitiativeId={selectedInitiativeId}
            setSelectedInitiativeId={v => setSelectedInitiativeId(v)}
            milestones={milestonesAll}
            selectedMilestoneId={selectedMilestoneId}
            setSelectedMilestoneId={v => setSelectedMilestoneId(v)}
            getResponsibleLabel={id => {
              if (!id) return '—';
              const p = peopleById.get(id);
              return p ? personLabel(p) : '—';
            }}
            onCreated={async () => {
              setCreateOpen(false);
              if (selectedInitiativeId) {
                const detail = await fetchInitiativeDetail(selectedInitiativeId);
                setViewing(detail);
              }
              await refresh();
            }}
          />

          <TaskEditModal
            open={!!editTask}
            task={editTask}
            onClose={() => setEditTask(null)}
            onToast={onToast}
            people={people}
            getResponsibleLabel={id => {
              if (!id) return '—';
              const p = peopleById.get(id);
              return p ? personLabel(p) : '—';
            }}
            onSaved={async () => {
              setEditTask(null);
              if (selectedInitiativeId) {
                const detail = await fetchInitiativeDetail(selectedInitiativeId);
                setViewing(detail);
              }
              await refresh();
            }}
          />
        </>
      )}
    </div>
  );
};

export default InitiativesKanban;
