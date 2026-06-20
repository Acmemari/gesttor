import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  List,
  ArrowLeft,
  Edit2,
  Trash2,
  GripVertical,
  Loader2,
  Info,
  CalendarHeart,
  Baby,
  Sprout,
} from 'lucide-react';
import { CattleHeadIcon } from '../components/icons/CattleHeadIcon';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useClient } from '../contexts/ClientContext';
import { useAuth } from '../contexts/AuthContext';
import { useHierarchy } from '../contexts/HierarchyContext';
import PageHeader from '../components/ui/PageHeader';
import TabSwitch from '../components/ui/TabSwitch';
import FormActions from '../components/ui/FormActions';
import {
  listEstacoesMonta,
  createEstacaoMonta,
  updateEstacaoMonta,
  deleteEstacaoMonta,
  reorderEstacoesMonta,
  type EstacaoMonta,
} from '../lib/api/estacaoMontaClient';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Dias de gestação somados ao Período da Monta para obter o Período de Nascimento. */
const GESTACAO_DIAS = 281;

// ── Date helpers (espelham o cálculo do servidor em estacao-monta repo) ─────────

/** Soma `days` a uma data 'YYYY-MM-DD' sem efeitos de fuso (cálculo em UTC). */
function addDaysISO(iso: string, days: number): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Safra (ciclo julho→julho) a que pertence a data 'YYYY-MM-DD'. Ex.: "2026/2027". */
function safraFromISO(iso: string): string {
  if (!iso) return '';
  const [y, m] = iso.split('-').map(Number);
  if (!y || !m) return '';
  return m >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

/** Formata 'YYYY-MM-DD' para 'DD/MM/AAAA' (sem efeitos de fuso). */
function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Período formatado: "DD/MM/AAAA → DD/MM/AAAA". */
function formatPeriodo(inicio: string | null | undefined, fim: string | null | undefined): string {
  return `${formatDateBR(inicio)} → ${formatDateBR(fim)}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onBack?: () => void;
  theme?: 'light' | 'dark';
}

/** Retiro da fazenda (Cadastro de Áreas / farm_retiros). */
interface Retiro {
  id: string;
  name: string;
}

/** Lista os retiros de uma fazenda (vazio quando a fazenda não tem retiros). */
function useRetiros(farmId: string): Retiro[] {
  const [retiros, setRetiros] = useState<Retiro[]>([]);
  useEffect(() => {
    if (!farmId) {
      setRetiros([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/farm-locations?farmId=${encodeURIComponent(farmId)}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const rows = (json?.data ?? json) as any[];
        setRetiros(Array.isArray(rows) ? rows.map((x) => ({ id: x.id, name: x.name })) : []);
      })
      .catch(() => {
        if (!cancelled) setRetiros([]);
      });
    return () => {
      cancelled = true;
    };
  }, [farmId]);
  return retiros;
}

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';

// ── Sortable Row (aba Registros) ───────────────────────────────────────────────

interface SortableRowProps {
  estacao: EstacaoMonta;
  farmName: (id: string | null) => string;
  onEdit: (e: EstacaoMonta) => void;
  onDelete: (id: string) => void;
}

const SortableRow: React.FC<SortableRowProps> = ({ estacao, farmName, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: estacao.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="border-b border-[#E5E7EB] transition-colors duration-150 hover:bg-[#F9FAFB]"
    >
      <td className="px-3 py-3 w-8">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing transition-colors text-gray-400 hover:text-[#16A34A]"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
      </td>
      <td className="px-4 py-3 text-[#0F172A]">
        <div className="font-bold">{farmName(estacao.farmId)}</div>
      </td>
      <td className="px-4 py-3 text-gray-600 font-medium">{estacao.retiro || '—'}</td>
      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
        {formatPeriodo(estacao.montaInicio, estacao.montaFim)}
      </td>
      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
        {formatPeriodo(estacao.nascimentoInicio, estacao.nascimentoFim)}
      </td>
      <td className="px-4 py-3">
        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-[#DCFCE7] text-[#15803D]">
          {estacao.safra}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onEdit(estacao)}
            className="p-1.5 rounded-lg transition-all text-gray-400 hover:text-[#16A34A] hover:bg-[#E7F6EC]"
          >
            <Edit2 size={15} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(estacao.id)}
            className="p-1.5 rounded-lg transition-all text-gray-400 hover:text-[#DC2626] hover:bg-red-50"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </td>
    </tr>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const EstacaoMontaManagement: React.FC<Props> = ({ onToast, onBack }) => {
  const { user } = useAuth();
  const { selectedClient } = useClient();
  const { farms, selectedFarm } = useHierarchy();

  const organizationId = selectedClient?.id ?? user?.organizationId ?? '';

  const [estacoes, setEstacoes] = useState<EstacaoMonta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [aba, setAba] = useState<'lancar' | 'registros'>('lancar');

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [farmId, setFarmId] = useState('');
  const [retiro, setRetiro] = useState('');
  const [montaInicio, setMontaInicio] = useState('');
  const [montaFim, setMontaFim] = useState('');

  const retiros = useRetiros(farmId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const farmName = useCallback(
    (id: string | null) => (id ? farms.find((f) => f.id === id)?.name ?? '—' : '—'),
    [farms],
  );

  // ── Derivados (preview ao vivo, espelha o servidor) ─────────────────────────
  const nascimentoInicio = useMemo(() => addDaysISO(montaInicio, GESTACAO_DIAS), [montaInicio]);
  const nascimentoFim = useMemo(() => addDaysISO(montaFim, GESTACAO_DIAS), [montaFim]);
  const safra = useMemo(() => safraFromISO(nascimentoInicio), [nascimentoInicio]);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadEstacoes = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const rows = await listEstacoesMonta(organizationId);
      setEstacoes(rows);
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao carregar estações de monta', 'error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, onToast]);

  useEffect(() => {
    loadEstacoes();
  }, [loadEstacoes]);

  // Pré-seleciona a fazenda no formulário de lançamento (novo registro).
  useEffect(() => {
    if (editingId) return;
    setFarmId((prev) => prev || selectedFarm?.id || (farms.length === 1 ? farms[0].id : ''));
  }, [selectedFarm, farms, editingId]);

  // ── Form helpers ────────────────────────────────────────────────────────────

  const limpar = useCallback(() => {
    setEditingId(null);
    setRetiro('');
    setMontaInicio('');
    setMontaFim('');
    setFarmId(selectedFarm?.id || (farms.length === 1 ? farms[0].id : ''));
  }, [selectedFarm, farms]);

  const startEdit = useCallback((e: EstacaoMonta) => {
    setEditingId(e.id);
    setFarmId(e.farmId ?? '');
    setRetiro(e.retiro ?? '');
    setMontaInicio(e.montaInicio);
    setMontaFim(e.montaFim);
    setAba('lancar');
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  const salvar = useCallback(async () => {
    if (!farmId) {
      onToast?.('Selecione a fazenda', 'error');
      return;
    }
    if (retiros.length > 0 && !retiro) {
      onToast?.('Selecione o retiro', 'error');
      return;
    }
    if (!montaInicio || !montaFim) {
      onToast?.('Informe o período da monta (início e fim)', 'error');
      return;
    }
    if (montaFim < montaInicio) {
      onToast?.('O fim da monta não pode ser anterior ao início', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateEstacaoMonta(editingId, {
          farmId: farmId || null,
          retiro: retiro || null,
          montaInicio,
          montaFim,
        });
        onToast?.('Estação de monta atualizada com sucesso', 'success');
      } else {
        await createEstacaoMonta({
          organizationId,
          farmId: farmId || null,
          retiro: retiro || null,
          montaInicio,
          montaFim,
        });
        onToast?.('Estação de monta salva com sucesso', 'success');
      }
      limpar();
      await loadEstacoes();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar estação de monta', 'error');
    } finally {
      setSaving(false);
    }
  }, [editingId, farmId, retiro, retiros, montaInicio, montaFim, organizationId, onToast, limpar, loadEstacoes]);

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteEstacaoMonta(deleteConfirmId);
      onToast?.('Estação de monta removida', 'success');
      setDeleteConfirmId(null);
      if (editingId === deleteConfirmId) limpar();
      await loadEstacoes();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao excluir estação de monta', 'error');
    }
  };

  // ── Drag-and-Drop ─────────────────────────────────────────────────────────

  const handleDragStart = useCallback((event: { active: { id: unknown } }) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over || active.id === over.id) return;

      const oldIndex = estacoes.findIndex((c) => c.id === String(active.id));
      const newIndex = estacoes.findIndex((c) => c.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = [...estacoes];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      setEstacoes(reordered);

      const items = reordered.map((c, i) => ({ id: c.id, ordem: i }));
      try {
        await reorderEstacoesMonta(items);
      } catch (err: any) {
        onToast?.(err.message || 'Erro ao reordenar', 'error');
        await loadEstacoes();
      }
    },
    [estacoes, onToast, loadEstacoes],
  );

  const sortableIds = estacoes.map((c) => c.id);
  const activeDragEstacao = activeId ? estacoes.find((c) => c.id === activeId) : null;

  const canSave = !!farmId && !!montaInicio && !!montaFim && !(retiros.length > 0 && !retiro);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!organizationId) {
    return (
      <div className="p-8 text-sm font-semibold text-gray-500">
        Selecione uma organização para gerenciar as estações de monta.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 md:p-8 max-w-5xl mx-auto w-full min-h-screen animate-in fade-in duration-500">
      {/* Cabeçalho padrão: título à esquerda, abas Lançamentos/Registros à direita */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-5 p-2.5 rounded-xl transition-all text-gray-500 hover:text-[#16A34A] hover:bg-[#E7F6EC]"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="flex-1">
          <PageHeader
            title="Estação de Monta"
            right={
              <TabSwitch
                tabs={[
                  { id: 'lancar', label: 'Lançamentos', icon: <Plus size={16} /> },
                  { id: 'registros', label: 'Registros', icon: <List size={16} />, badge: estacoes.length },
                ]}
                value={aba}
                onChange={(id) => setAba(id as 'lancar' | 'registros')}
              />
            }
          />
        </div>
      </div>

      {aba === 'lancar' ? (
        /* ── Aba Lançamentos: cadastro da estação de monta ───────────────────── */
        <div className="flex flex-col gap-5 rounded-2xl border border-gray-200 bg-white p-5">
          {editingId ? (
            <div className="flex items-center gap-2 rounded-lg border border-[#fcd9b6] bg-[#fff7ed] px-3 py-2 text-[13px] font-semibold text-[#ea580c]">
              <Info size={15} /> Editando uma estação existente — altere os dados e clique em “Salvar alterações”.
            </div>
          ) : null}

          {/* Localização: Fazenda + Retiro */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
                Fazenda <span className="text-[#DC2626]">*</span>
              </label>
              <select
                value={farmId}
                onChange={(e) => {
                  setFarmId(e.target.value);
                  setRetiro('');
                }}
                className={inputCls}
              >
                <option value="">Selecione…</option>
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
                Retiro {retiros.length > 0 && <span className="text-[#DC2626]">*</span>}
              </label>
              <select
                value={retiro}
                onChange={(e) => setRetiro(e.target.value)}
                disabled={!farmId || retiros.length === 0}
                className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400`}
              >
                <option value="">
                  {!farmId ? 'Selecione a fazenda' : retiros.length === 0 ? 'Fazenda sem retiros' : '—'}
                </option>
                {retiros.map((r) => (
                  <option key={r.id} value={r.name}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Período da Monta */}
          <div className="border border-[#E5E7EB] bg-[#F9FAFB]/50 rounded-xl p-4">
            <label className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
              <CalendarHeart size={13} className="text-[#16A34A]" /> Período da Monta <span className="text-[#DC2626]">*</span>
            </label>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-[12px] font-medium text-gray-500">Início</label>
                <input
                  type="date"
                  value={montaInicio}
                  onChange={(e) => setMontaInicio(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[12px] font-medium text-gray-500">Fim</label>
                <input
                  type="date"
                  value={montaFim}
                  min={montaInicio || undefined}
                  onChange={(e) => setMontaFim(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Derivados: Período de Nascimento + Safra (somente leitura) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[#bfdbfe] bg-[#eff6ff] p-4">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#1d4ed8]">
                <Baby size={13} /> Período de Nascimento
              </div>
              <p className="text-sm font-bold text-[#1e3a8a]">
                {montaInicio && montaFim ? formatPeriodo(nascimentoInicio, nascimentoFim) : '—'}
              </p>
              <p className="mt-1 text-[11px] text-[#3b82f6]">Calculado automaticamente (monta + {GESTACAO_DIAS} dias de gestação).</p>
            </div>
            <div className="rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] p-4">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#15803d]">
                <Sprout size={13} /> Safra de Nascimento do Bezerro
              </div>
              <p className="text-sm font-bold text-[#14532d]">{safra || '—'}</p>
              <p className="mt-1 text-[11px] text-[#22c55e]">Carregada automaticamente (ciclo julho → julho).</p>
            </div>
          </div>

          <FormActions
            onCancel={limpar}
            onSave={salvar}
            saveDisabled={!canSave || saving}
            saveLabel={editingId ? 'Salvar alterações' : 'Salvar'}
            cancelLabel={editingId ? 'Cancelar edição' : 'Limpar'}
            saveIcon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}
          />
        </div>
      ) : (
        /* ── Aba Registros: lista persistida (reorder + editar + excluir) ────── */
        loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : estacoes.length === 0 ? (
          <div className="text-center py-16 border border-dashed rounded-2xl p-12 shadow-md text-gray-400 border-gray-200 bg-white">
            <CattleHeadIcon size={48} className="mx-auto mb-4 opacity-30 text-[#16A34A]" />
            <p className="text-sm font-semibold text-[#0F172A]">Nenhuma estação de monta cadastrada.</p>
            <p className="text-xs mt-1 opacity-70">Use a aba "Lançamentos" para começar.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#E5E7EB] bg-white overflow-hidden shadow-[0_1px_3px_rgba(16,24,40,0.08)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280] text-[11px] uppercase tracking-wider font-bold">
                  <th className="w-10" />
                  <th className="px-4 py-3.5 text-left">Fazenda</th>
                  <th className="px-4 py-3.5 text-left">Retiro</th>
                  <th className="px-4 py-3.5 text-left">Período da Monta</th>
                  <th className="px-4 py-3.5 text-left">Período de Nascimento</th>
                  <th className="px-4 py-3.5 text-left">Safra</th>
                  <th className="px-4 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                  <tbody>
                    {estacoes.map((est) => (
                      <SortableRow
                        key={est.id}
                        estacao={est}
                        farmName={farmName}
                        onEdit={startEdit}
                        onDelete={(id) => setDeleteConfirmId(id)}
                      />
                    ))}
                  </tbody>
                </SortableContext>
                <DragOverlay dropAnimation={null}>
                  {activeDragEstacao ? (
                    <table className="w-full text-sm bg-white">
                      <tbody>
                        <tr className="shadow-2xl rounded border border-[#E5E7EB] text-[#0F172A] bg-white">
                          <td className="px-3 py-3 w-10">
                            <GripVertical size={16} className="text-[#16A34A]" />
                          </td>
                          <td className="px-4 py-3 font-bold">{farmName(activeDragEstacao.farmId)}</td>
                          <td className="px-4 py-3 font-medium">{activeDragEstacao.retiro || '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {formatPeriodo(activeDragEstacao.montaInicio, activeDragEstacao.montaFim)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {formatPeriodo(activeDragEstacao.nascimentoInicio, activeDragEstacao.nascimentoFim)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-[#DCFCE7] text-[#15803D]">
                              {activeDragEstacao.safra}
                            </span>
                          </td>
                          <td className="px-4 py-3" />
                        </tr>
                      </tbody>
                    </table>
                  ) : null}
                </DragOverlay>
              </DndContext>
              <tfoot>
                <tr className="border-t border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280]">
                  <td colSpan={7} className="px-4 py-3 text-xs font-semibold leading-relaxed">
                    Total: {estacoes.length} {estacoes.length === 1 ? 'estação cadastrada' : 'estações cadastradas'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}

      {/* ── Delete Confirmation Dialog ─────────────────────────────────────── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 max-w-sm w-full shadow-2xl transition-all duration-300">
            <h3 className="text-lg font-black tracking-tight mb-2 text-[#0F172A]">Confirmar Exclusão</h3>
            <p className="text-sm leading-relaxed mb-6 text-[#6B7280]">
              Tem certeza que deseja remover esta estação de monta? Esta ação não poderá ser desfeita.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl border border-[#E5E7EB] text-[#6B7280] hover:bg-[#F9FAFB] transition-all duration-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-[#DC2626] rounded-xl hover:bg-[#B91C1C] transition-all duration-300 shadow-md shadow-red-950/10"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EstacaoMontaManagement;
