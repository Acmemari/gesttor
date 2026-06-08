import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  List,
  ArrowLeft,
  Trash2,
  GripVertical,
  Loader2,
  Save,
  Eye,
  MoreHorizontal,
} from 'lucide-react';
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
import PageHeader from '../components/ui/PageHeader';
import TabSwitch from '../components/ui/TabSwitch';
import FormActions from '../components/ui/FormActions';
import {
  listMotivosMorte,
  createMotivoMorte,
  updateMotivoMorte,
  deleteMotivoMorte,
  reorderMotivosMorte,
  type MotivoMorte,
} from '../lib/api/motivosMorteClient';
import { MotivoMorteIcon } from '../components/icons/MotivoMorteIcon';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onBack?: () => void;
  theme?: 'light' | 'dark';
}

/** Primeira letra maiúscula, demais minúsculas (ex.: "ENROSCADO NA CERCA" → "Enroscado na cerca"). */
const toSentenceCase = (s: string): string => {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
};

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
const textareaCls =
  'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15 resize-none';

// ── Item do menu de ações (•••) ─────────────────────────────────────────────────

const MenuItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}> = ({ icon, label, danger, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium transition-colors ${
      danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
    }`}
  >
    <span className={danger ? 'text-red-500' : 'text-[#16a34a]'}>{icon}</span>
    {label}
  </button>
);

// ── Linha da tabela (master) ────────────────────────────────────────────────────

interface SortableRowProps {
  motivo: MotivoMorte;
  selected: boolean;
  menuOpen: boolean;
  onSelect: (m: MotivoMorte) => void;
  onMenu: (e: React.MouseEvent, id: string) => void;
}

const SortableRow: React.FC<SortableRowProps> = ({ motivo, selected, menuOpen, onSelect, onMenu }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: motivo.id,
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
      onClick={() => onSelect(motivo)}
      className={`cursor-pointer border-t border-gray-100 transition-colors ${
        selected ? 'bg-[#e7f6ec]' : 'hover:bg-gray-50'
      }`}
    >
      <td className="p-3">
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab active:cursor-grabbing transition-colors text-gray-400 hover:text-[#16A34A]"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
      </td>
      <td className={`p-3 font-semibold ${selected ? 'text-[#16a34a]' : 'text-gray-800'}`}>{motivo.nome}</td>
      <td className="p-3 text-center">
        <button
          type="button"
          onClick={(e) => onMenu(e, motivo.id)}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
            menuOpen ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
          }`}
          title="Ações"
          aria-label="Ações"
        >
          <MoreHorizontal size={18} />
        </button>
      </td>
    </tr>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const MotivosMorteManagement: React.FC<Props> = ({ onToast, onBack }) => {
  const { user } = useAuth();
  const { selectedClient } = useClient();

  const organizationId = selectedClient?.id ?? user?.organizationId ?? '';

  const [motivos, setMotivos] = useState<MotivoMorte[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Menu de ações flutuante (•••), ancorado por coordenadas para não ser
  // recortado pelo overflow-hidden do cartão.
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  // Abas Lançamentos / Registros
  const [aba, setAba] = useState<'lancar' | 'registros'>('lancar');

  // Entrada da aba Lançamentos
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const nomeRef = useRef<HTMLInputElement>(null);

  // Detalhamento editável (aba Registros)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editDescricao, setEditDescricao] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadMotivos = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const rows = await listMotivosMorte(organizationId);
      setMotivos(rows);
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao carregar motivos de morte', 'error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, onToast]);

  useEffect(() => {
    loadMotivos();
  }, [loadMotivos]);

  // Auto-seleciona o primeiro motivo e mantém a seleção válida quando a lista muda.
  useEffect(() => {
    setSelectedId((prev) => {
      if (prev && motivos.some((m) => m.id === prev)) return prev;
      return motivos[0]?.id ?? null;
    });
  }, [motivos]);

  // Carrega os dados do motivo selecionado no detalhamento editável.
  const selected = motivos.find((m) => m.id === selectedId) || null;
  useEffect(() => {
    if (selected) {
      setEditDescricao(selected.descricao ?? '');
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lançamento ──────────────────────────────────────────────────────────────

  const cancelLancamento = useCallback(() => {
    setNome('');
    setDescricao('');
  }, []);

  const salvar = useCallback(async () => {
    const clean = toSentenceCase(nome);
    if (!clean) {
      onToast?.('Informe o nome do motivo', 'error');
      return;
    }
    const lower = clean.toLowerCase();
    if (motivos.some((m) => m.nome.trim().toLowerCase() === lower)) {
      onToast?.('Esse motivo já está cadastrado', 'warning');
      return;
    }
    setSaving(true);
    try {
      await createMotivoMorte({
        nome: clean,
        descricao: descricao.trim() || null,
        organizationId,
      });
      onToast?.('Motivo salvo com sucesso', 'success');
      setNome('');
      setDescricao('');
      await loadMotivos();
      setAba('registros');
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar motivo', 'error');
    } finally {
      setSaving(false);
    }
  }, [nome, descricao, organizationId, motivos, onToast, loadMotivos]);

  // ── Edição (detalhamento da aba Registros) ──────────────────────────────────

  const salvarDetalhe = useCallback(async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await updateMotivoMorte(selectedId, {
        descricao: editDescricao.trim() || null,
      });
      onToast?.('Motivo atualizado com sucesso', 'success');
      await loadMotivos();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar motivo', 'error');
    } finally {
      setSaving(false);
    }
  }, [selectedId, editDescricao, onToast, loadMotivos]);

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteMotivoMorte(deleteConfirmId);
      onToast?.('Motivo removido', 'success');
      setDeleteConfirmId(null);
      await loadMotivos();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao excluir motivo', 'error');
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

      const oldIndex = motivos.findIndex((m) => m.id === String(active.id));
      const newIndex = motivos.findIndex((m) => m.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = [...motivos];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      setMotivos(reordered);

      const items = reordered.map((m, i) => ({ id: m.id, ordem: i }));
      try {
        await reorderMotivosMorte(items);
      } catch (err: any) {
        onToast?.(err.message || 'Erro ao reordenar', 'error');
        await loadMotivos();
      }
    },
    [motivos, onToast, loadMotivos],
  );

  const sortableIds = motivos.map((m) => m.id);
  const activeDragMotivo = activeId ? motivos.find((m) => m.id === activeId) : null;

  // ── Menu de ações (•••) ─────────────────────────────────────────────────────
  const toggleMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu((prev) => (prev?.id === id ? null : { id, x: r.right, y: r.bottom }));
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);

  // ── Divisor arrastável entre a lista (master) e o detalhamento (detail) ─────
  const splitRef = useRef<HTMLDivElement>(null);
  const [masterPct, setMasterPct] = useState(50); // % de altura ocupada pela lista
  const draggingRef = useRef(false);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResize = (e: React.PointerEvent) => {
    if (!draggingRef.current || !splitRef.current) return;
    const rect = splitRef.current.getBoundingClientRect();
    const pct = ((e.clientY - rect.top) / rect.height) * 100;
    setMasterPct(Math.min(85, Math.max(15, pct)));
  };
  const endResize = (e: React.PointerEvent) => {
    draggingRef.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!organizationId) {
    return (
      <div className="p-8 text-sm font-semibold text-gray-500">
        Selecione uma organização para gerenciar os motivos de morte.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 md:p-8 max-w-4xl mx-auto w-full min-h-screen animate-in fade-in duration-500">
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
            title="Motivos de Morte"
            right={
              <TabSwitch
                tabs={[
                  { id: 'lancar', label: 'Lançamentos', icon: <Plus size={16} /> },
                  { id: 'registros', label: 'Registros', icon: <List size={16} />, badge: motivos.length },
                ]}
                value={aba}
                onChange={(id) => setAba(id as 'lancar' | 'registros')}
              />
            }
          />
        </div>
      </div>

      {aba === 'lancar' ? (
        /* ── Aba Lançamentos: cadastro direto de um motivo ────────────────────── */
        <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
              Motivo <span className="text-[#DC2626]">*</span>
            </label>
            <input
              ref={nomeRef}
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') salvar();
              }}
              placeholder="Ex: Picada de Cobra, Pneumonia, Raio..."
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">Descrição</label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Explique o que caracteriza esse motivo (opcional)"
              rows={2}
              className={textareaCls}
            />
          </div>

          <FormActions
            onCancel={cancelLancamento}
            onSave={salvar}
            saveDisabled={!nome.trim() || saving}
            saveIcon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}
          />
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : motivos.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-2xl p-12 shadow-md text-gray-400 border-gray-200 bg-white">
          <MotivoMorteIcon size={48} className="mx-auto mb-4 opacity-30 text-[#16A34A]" />
          <p className="text-sm font-semibold text-[#0F172A]">Nenhum motivo cadastrado.</p>
          <p className="text-xs mt-1 opacity-70">Use a aba "Lançamentos" para começar.</p>
        </div>
      ) : (
        /* ── Aba Registros: master-detail (50% lista · 50% observações) ──────── */
        <>
        {/* Cabeçalho de uso: título + dica de interação (padrão Nascimentos) */}
        <div className="mb-4">
          <h2 className="text-[17px] font-bold text-gray-900">Todos os motivos — Motivos de Morte</h2>
          <p className="mt-0.5 text-[12.5px] text-gray-500">
            Clique em um motivo para abri-lo; use ••• para ver ou excluir.
          </p>
        </div>
        <div
          ref={splitRef}
          className="flex h-[calc(100vh-240px)] min-h-[440px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white"
        >
          {/* Master: relação de motivos (altura ajustável, rolagem própria) */}
          <div className="min-h-0 shrink-0 overflow-y-auto" style={{ height: `${masterPct}%` }}>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <table className="w-full text-left text-[13px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#fcfcfd] text-[11px] uppercase tracking-wide text-gray-500">
                    <th className="w-8 p-3" />
                    <th className="p-3 font-bold">Motivo</th>
                    <th className="p-3 text-center font-bold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                    {motivos.map((motivo) => (
                      <SortableRow
                        key={motivo.id}
                        motivo={motivo}
                        selected={selectedId === motivo.id}
                        menuOpen={menu?.id === motivo.id}
                        onSelect={(m) => setSelectedId(m.id)}
                        onMenu={toggleMenu}
                      />
                    ))}
                  </SortableContext>
                </tbody>
              </table>
              <DragOverlay dropAnimation={null}>
                {activeDragMotivo ? (
                  <div className="flex items-center gap-3 rounded border border-[#E5E7EB] bg-white px-4 py-3 shadow-2xl">
                    <GripVertical size={16} className="text-[#16A34A]" />
                    <span className="truncate font-bold text-[#0F172A]">{activeDragMotivo.nome}</span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>

          {/* Divisor arrastável: ajusta a divisão lista × observações */}
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Ajustar altura da lista de registros"
            onPointerDown={startResize}
            onPointerMove={onResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            className="group relative flex h-2.5 shrink-0 cursor-row-resize touch-none items-center justify-center border-t-4 border-[#e7f6ec] bg-[#fafbfc] transition-colors hover:border-[#16a34a]/40"
            title="Arraste para ajustar o espaço da lista e das observações"
          >
            <span className="h-1 w-10 rounded-full bg-gray-300 transition-colors group-hover:bg-[#16a34a]" />
          </div>

          {/* Detail: observações do motivo selecionado (espaço restante, rolagem própria) */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#fafbfc]">
            {selected ? (
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <h4 className="text-[14px] font-bold text-gray-900">Detalhamento · {selected.nome}</h4>
                </div>

                <div className="flex flex-1 flex-col">
                  <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">Observações</label>
                  <textarea
                    value={editDescricao}
                    onChange={(e) => setEditDescricao(e.target.value)}
                    placeholder="Explique o que caracteriza esse motivo (opcional)"
                    className={`${textareaCls} min-h-[100px] flex-1`}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={salvarDetalhe}
                    disabled={saving}
                    className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-[#16a34a] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#15803d] disabled:cursor-not-allowed disabled:bg-[#86cfa4]"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Salvar alterações
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-center text-sm text-gray-400">
                Selecione um registro acima para ver as observações.
              </div>
            )}
          </div>
        </div>
        </>
      )}

      {/* ── Menu de ações (•••) ────────────────────────────────────────────── */}
      {menu ? (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMenu} />
          <div
            className="fixed z-50 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
            style={{ top: menu.y + 6, right: Math.max(8, window.innerWidth - menu.x) }}
          >
            <MenuItem
              icon={<Eye size={15} />}
              label="Ver"
              onClick={() => {
                setSelectedId(menu.id);
                closeMenu();
              }}
            />
            <div className="my-1 border-t border-gray-100" />
            <MenuItem
              icon={<Trash2 size={15} />}
              label="Excluir"
              danger
              onClick={() => {
                setDeleteConfirmId(menu.id);
                closeMenu();
              }}
            />
          </div>
        </>
      ) : null}

      {/* ── Delete Confirmation Dialog ─────────────────────────────────────── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 max-w-sm w-full shadow-2xl transition-all duration-300">
            <h3 className="text-lg font-black tracking-tight mb-2 text-[#0F172A]">Confirmar Exclusão</h3>
            <p className="text-sm leading-relaxed mb-6 text-[#6B7280]">
              Tem certeza que deseja remover este motivo? Esta ação não poderá ser desfeita.
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

export default MotivosMorteManagement;
