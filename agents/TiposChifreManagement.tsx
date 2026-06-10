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
  CheckCircle2,
  Ban,
  Tag,
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
  listTiposChifre,
  createTipoChifre,
  updateTipoChifre,
  deleteTipoChifre,
  reorderTiposChifre,
  type TipoChifre,
} from '../lib/api/tiposChifreClient';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onBack?: () => void;
  theme?: 'light' | 'dark';
}

/** Primeira letra maiúscula, demais minúsculas (ex.: "ASPAS LONGAS" → "Aspas longas"). */
const toSentenceCase = (s: string): string => {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
};

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
const textareaCls =
  'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15 resize-none';

// ── Badge de situação (Ativo / Inativo) ─────────────────────────────────────────

const SituacaoBadge: React.FC<{ ativo: boolean }> = ({ ativo }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
      ativo ? 'bg-[#e7f6ec] text-[#15803d]' : 'bg-gray-100 text-gray-500'
    }`}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${ativo ? 'bg-[#16a34a]' : 'bg-gray-400'}`} />
    {ativo ? 'Ativo' : 'Inativo'}
  </span>
);

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
  tipo: TipoChifre;
  selected: boolean;
  menuOpen: boolean;
  onSelect: (t: TipoChifre) => void;
  onMenu: (e: React.MouseEvent, id: string) => void;
}

const SortableRow: React.FC<SortableRowProps> = ({ tipo, selected, menuOpen, onSelect, onMenu }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tipo.id,
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
      onClick={() => onSelect(tipo)}
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
      <td className={`p-3 font-semibold ${selected ? 'text-[#16a34a]' : 'text-gray-800'}`}>{tipo.nome}</td>
      <td className="p-3">
        <SituacaoBadge ativo={tipo.ativo} />
      </td>
      <td className="p-3 text-center">
        <button
          type="button"
          onClick={(e) => onMenu(e, tipo.id)}
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

const TiposChifreManagement: React.FC<Props> = ({ onToast, onBack }) => {
  const { user } = useAuth();
  const { selectedClient } = useClient();

  const organizationId = selectedClient?.id ?? user?.organizationId ?? '';

  const [tipos, setTipos] = useState<TipoChifre[]>([]);
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
  const [descricao, setDescricao] = useState('');
  const [observacao, setObservacao] = useState('');
  const descricaoRef = useRef<HTMLInputElement>(null);

  // Detalhamento editável (aba Registros)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editObservacao, setEditObservacao] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadTipos = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const rows = await listTiposChifre(organizationId);
      setTipos(rows);
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao carregar tipos de chifre', 'error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, onToast]);

  useEffect(() => {
    loadTipos();
  }, [loadTipos]);

  // Auto-seleciona o primeiro tipo e mantém a seleção válida quando a lista muda.
  useEffect(() => {
    setSelectedId((prev) => {
      if (prev && tipos.some((t) => t.id === prev)) return prev;
      return tipos[0]?.id ?? null;
    });
  }, [tipos]);

  // Carrega os dados do tipo selecionado no detalhamento editável.
  const selected = tipos.find((t) => t.id === selectedId) || null;
  useEffect(() => {
    if (selected) {
      setEditObservacao(selected.descricao ?? '');
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lançamento ──────────────────────────────────────────────────────────────

  const cancelLancamento = useCallback(() => {
    setDescricao('');
    setObservacao('');
  }, []);

  const salvar = useCallback(async () => {
    const clean = toSentenceCase(descricao);
    if (!clean) {
      onToast?.('Informe a descrição do tipo de chifre', 'error');
      return;
    }
    const lower = clean.toLowerCase();
    if (tipos.some((t) => t.nome.trim().toLowerCase() === lower)) {
      onToast?.('Esse tipo de chifre já está cadastrado', 'warning');
      return;
    }
    setSaving(true);
    try {
      await createTipoChifre({
        nome: clean,
        descricao: observacao.trim() || null,
        organizationId,
      });
      onToast?.('Tipo de chifre salvo com sucesso', 'success');
      setDescricao('');
      setObservacao('');
      await loadTipos();
      setAba('registros');
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar tipo de chifre', 'error');
    } finally {
      setSaving(false);
    }
  }, [descricao, observacao, organizationId, tipos, onToast, loadTipos]);

  // ── Edição (detalhamento da aba Registros) ──────────────────────────────────

  const salvarDetalhe = useCallback(async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await updateTipoChifre(selectedId, {
        descricao: editObservacao.trim() || null,
      });
      onToast?.('Tipo de chifre atualizado com sucesso', 'success');
      await loadTipos();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar tipo de chifre', 'error');
    } finally {
      setSaving(false);
    }
  }, [selectedId, editObservacao, onToast, loadTipos]);

  // ── Ativar / Inativar (Situações) ───────────────────────────────────────────

  const toggleAtivo = useCallback(async (tipo: TipoChifre) => {
    try {
      await updateTipoChifre(tipo.id, { ativo: !tipo.ativo });
      onToast?.(tipo.ativo ? 'Tipo de chifre inativado' : 'Tipo de chifre ativado', 'success');
      await loadTipos();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao alterar situação', 'error');
    }
  }, [onToast, loadTipos]);

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteTipoChifre(deleteConfirmId);
      onToast?.('Tipo de chifre removido', 'success');
      setDeleteConfirmId(null);
      await loadTipos();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao excluir tipo de chifre', 'error');
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

      const oldIndex = tipos.findIndex((t) => t.id === String(active.id));
      const newIndex = tipos.findIndex((t) => t.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = [...tipos];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      setTipos(reordered);

      const items = reordered.map((t, i) => ({ id: t.id, ordem: i }));
      try {
        await reorderTiposChifre(items);
      } catch (err: any) {
        onToast?.(err.message || 'Erro ao reordenar', 'error');
        await loadTipos();
      }
    },
    [tipos, onToast, loadTipos],
  );

  const sortableIds = tipos.map((t) => t.id);
  const activeDragTipo = activeId ? tipos.find((t) => t.id === activeId) : null;

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
        Selecione uma organização para gerenciar os tipos de chifre.
      </div>
    );
  }

  const menuTipo = menu ? tipos.find((t) => t.id === menu.id) ?? null : null;

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
            title="Tipo de Chifre - Aspas"
            right={
              <TabSwitch
                tabs={[
                  { id: 'lancar', label: 'Lançamentos', icon: <Plus size={16} /> },
                  { id: 'registros', label: 'Registros', icon: <List size={16} />, badge: tipos.length },
                ]}
                value={aba}
                onChange={(id) => setAba(id as 'lancar' | 'registros')}
              />
            }
          />
        </div>
      </div>

      {aba === 'lancar' ? (
        /* ── Aba Lançamentos: cadastro direto de um tipo de chifre ────────────── */
        <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
              Descrição <span className="text-[#DC2626]">*</span>
            </label>
            <input
              ref={descricaoRef}
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') salvar();
              }}
              placeholder="Ex: Aspado, Mocho, Aspas curtas, Aspas longas..."
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">Observação</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Explique o que caracteriza esse tipo de chifre (opcional)"
              rows={2}
              className={textareaCls}
            />
          </div>

          <FormActions
            onCancel={cancelLancamento}
            onSave={salvar}
            saveDisabled={!descricao.trim() || saving}
            saveIcon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}
          />
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : tipos.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-2xl p-12 shadow-md text-gray-400 border-gray-200 bg-white">
          <Tag size={48} className="mx-auto mb-4 opacity-30 text-[#16A34A]" />
          <p className="text-sm font-semibold text-[#0F172A]">Nenhum tipo de chifre cadastrado.</p>
          <p className="text-xs mt-1 opacity-70">Use a aba "Lançamentos" para começar.</p>
        </div>
      ) : (
        /* ── Aba Registros: master-detail (50% lista · 50% observações) ──────── */
        <>
        {/* Cabeçalho de uso: título + dica de interação (padrão Nascimentos) */}
        <div className="mb-4">
          <h2 className="text-[17px] font-bold text-gray-900">Todos os tipos — Tipo de Chifre - Aspas</h2>
          <p className="mt-0.5 text-[12.5px] text-gray-500">
            Clique em um tipo para abri-lo; use ••• para ver, ativar/inativar ou excluir.
          </p>
        </div>
        <div
          ref={splitRef}
          className="flex h-[calc(100vh-240px)] min-h-[440px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white"
        >
          {/* Master: relação de tipos (altura ajustável, rolagem própria) */}
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
                    <th className="p-3 font-bold">Tipo de Chifre</th>
                    <th className="p-3 font-bold">Situações</th>
                    <th className="p-3 text-center font-bold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                    {tipos.map((tipo) => (
                      <SortableRow
                        key={tipo.id}
                        tipo={tipo}
                        selected={selectedId === tipo.id}
                        menuOpen={menu?.id === tipo.id}
                        onSelect={(t) => setSelectedId(t.id)}
                        onMenu={toggleMenu}
                      />
                    ))}
                  </SortableContext>
                </tbody>
              </table>
              <DragOverlay dropAnimation={null}>
                {activeDragTipo ? (
                  <div className="flex items-center gap-3 rounded border border-[#E5E7EB] bg-white px-4 py-3 shadow-2xl">
                    <GripVertical size={16} className="text-[#16A34A]" />
                    <span className="truncate font-bold text-[#0F172A]">{activeDragTipo.nome}</span>
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

          {/* Detail: observações do tipo selecionado (espaço restante, rolagem própria) */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#fafbfc]">
            {selected ? (
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <h4 className="text-[14px] font-bold text-gray-900">Detalhamento · {selected.nome}</h4>
                  <SituacaoBadge ativo={selected.ativo} />
                  <button
                    type="button"
                    onClick={() => toggleAtivo(selected)}
                    className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    {selected.ativo ? <Ban size={15} className="text-gray-500" /> : <CheckCircle2 size={15} className="text-[#16a34a]" />}
                    {selected.ativo ? 'Inativar' : 'Ativar'}
                  </button>
                </div>

                <div className="flex flex-1 flex-col">
                  <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">Observação</label>
                  <textarea
                    value={editObservacao}
                    onChange={(e) => setEditObservacao(e.target.value)}
                    placeholder="Explique o que caracteriza esse tipo de chifre (opcional)"
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
      {menu && menuTipo ? (
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
            <MenuItem
              icon={menuTipo.ativo ? <Ban size={15} /> : <CheckCircle2 size={15} />}
              label={menuTipo.ativo ? 'Inativar' : 'Ativar'}
              onClick={() => {
                toggleAtivo(menuTipo);
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
              Tem certeza que deseja remover este tipo de chifre? Esta ação não poderá ser desfeita.
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

export default TiposChifreManagement;
