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
  X,
  SlidersHorizontal,
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
  listCamposPersonalizados,
  createCampoPersonalizado,
  updateCampoPersonalizado,
  deleteCampoPersonalizado,
  reorderCamposPersonalizados,
  type CampoPersonalizado,
  type CampoTipo,
  type CampoMovimento,
} from '../lib/api/camposPersonalizadosClient';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onBack?: () => void;
  theme?: 'light' | 'dark';
}

/** Rascunho editável de um campo (create e edit compartilham). */
interface Draft {
  nome: string;
  tipo: CampoTipo;
  opcoes: string[];
  movimentos: CampoMovimento[];
  obrigatorio: boolean;
}

const EMPTY_DRAFT: Draft = { nome: '', tipo: 'texto', opcoes: [''], movimentos: [], obrigatorio: false };

const TIPO_OPTS: { id: CampoTipo; label: string }[] = [
  { id: 'texto', label: 'Texto' },
  { id: 'numero', label: 'Número' },
  { id: 'lista', label: 'Lista suspensa' },
];

const MOVIMENTO_OPTS: { id: CampoMovimento; label: string }[] = [
  { id: 'compra', label: 'Compra' },
  { id: 'venda', label: 'Venda' },
  { id: 'nascimento', label: 'Nascimento' },
  { id: 'morte', label: 'Morte' },
  { id: 'consumo', label: 'Consumo' },
];

const TIPO_LABEL: Record<CampoTipo, string> = { texto: 'Texto', numero: 'Número', lista: 'Lista suspensa' };

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';

/** Carrega um registro persistido para o formato de rascunho editável. */
const toDraft = (c: CampoPersonalizado): Draft => ({
  nome: c.nome,
  tipo: c.tipo,
  opcoes: c.tipo === 'lista' ? (c.opcoes.length ? [...c.opcoes] : ['']) : [],
  movimentos: [...(c.movimentos ?? [])],
  obrigatorio: !!c.obrigatorio,
});

/** Ajusta as opções ao trocar o tipo (lista garante ao menos um campo de opção). */
const applyTipo = (draft: Draft, tipo: CampoTipo): Draft => ({
  ...draft,
  tipo,
  opcoes: tipo === 'lista' ? (draft.opcoes.length ? draft.opcoes : ['']) : draft.opcoes,
});

/** Payload de gravação a partir do rascunho (opções só fazem sentido p/ lista). */
const draftToPayload = (d: Draft) => ({
  nome: d.nome.trim(),
  tipo: d.tipo,
  opcoes: d.tipo === 'lista' ? d.opcoes.map((o) => o.trim()).filter(Boolean).slice(0, 4) : [],
  movimentos: d.movimentos,
  obrigatorio: d.obrigatorio,
});

/** Validação comum (retorna mensagem de erro ou null). */
const validateDraft = (d: Draft): string | null => {
  if (!d.nome.trim()) return 'Informe o nome do campo';
  if (d.tipo === 'lista' && d.opcoes.map((o) => o.trim()).filter(Boolean).length === 0)
    return 'Informe ao menos uma opção para a lista suspensa';
  if (d.movimentos.length === 0) return 'Selecione ao menos uma movimentação';
  return null;
};

// ── Sub-form (campos do rascunho) ───────────────────────────────────────────────

const CampoFormFields: React.FC<{
  draft: Draft;
  onChange: (next: Draft) => void;
}> = ({ draft, onChange }) => {
  const toggleMovimento = (id: CampoMovimento) => {
    const has = draft.movimentos.includes(id);
    onChange({
      ...draft,
      movimentos: has ? draft.movimentos.filter((m) => m !== id) : [...draft.movimentos, id],
    });
  };

  const setOpcao = (i: number, v: string) => {
    const opcoes = [...draft.opcoes];
    opcoes[i] = v;
    onChange({ ...draft, opcoes });
  };
  const addOpcao = () => {
    if (draft.opcoes.length >= 4) return;
    onChange({ ...draft, opcoes: [...draft.opcoes, ''] });
  };
  const removeOpcao = (i: number) => {
    const opcoes = draft.opcoes.filter((_, idx) => idx !== i);
    onChange({ ...draft, opcoes: opcoes.length ? opcoes : [''] });
  };

  return (
    <>
      {/* Nome */}
      <div>
        <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
          Nome do campo <span className="text-[#DC2626]">*</span>
        </label>
        <input
          type="text"
          value={draft.nome}
          onChange={(e) => onChange({ ...draft, nome: e.target.value })}
          placeholder="Ex: Nº do brinco, Observação do comprador, Lote de vacina..."
          className={inputCls}
        />
      </div>

      {/* Tipo */}
      <div>
        <label className="mb-1.5 block text-[12.5px] font-semibold text-gray-700">Tipo do campo</label>
        <div className="flex flex-wrap gap-2">
          {TIPO_OPTS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(applyTipo(draft, opt.id))}
              className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors duration-200 border ${
                draft.tipo === opt.id
                  ? 'bg-[#16A34A] border-[#16A34A] text-white shadow-sm'
                  : 'bg-[#F3F4F6] border-transparent text-[#6B7280] hover:bg-[#E5E7EB]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Opções (apenas Lista suspensa) */}
      {draft.tipo === 'lista' && (
        <div className="rounded-xl border border-gray-200 bg-[#F9FAFB]/60 p-4">
          <label className="mb-2 block text-[12.5px] font-semibold text-gray-700">
            Opções da lista <span className="font-normal text-gray-400">(máx. 4)</span>
          </label>
          <div className="flex flex-col gap-2">
            {draft.opcoes.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => setOpcao(i, e.target.value)}
                  placeholder={`Opção ${i + 1}`}
                  className={inputCls}
                />
                {draft.opcoes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeOpcao(i)}
                    className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500"
                    title="Remover opção"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {draft.opcoes.length < 4 && (
            <button
              type="button"
              onClick={addOpcao}
              className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#16a34a] hover:text-[#15803d]"
            >
              <Plus size={14} /> Adicionar opção
            </button>
          )}
        </div>
      )}

      {/* Movimentações */}
      <div>
        <label className="mb-1.5 block text-[12.5px] font-semibold text-gray-700">
          Aparece nas movimentações <span className="text-[#DC2626]">*</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {MOVIMENTO_OPTS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggleMovimento(opt.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors duration-200 border ${
                draft.movimentos.includes(opt.id)
                  ? 'bg-[#16A34A] border-[#16A34A] text-white shadow-sm'
                  : 'bg-[#F3F4F6] border-transparent text-[#6B7280] hover:bg-[#E5E7EB]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Obrigatório */}
      <label className="flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={draft.obrigatorio}
          onChange={(e) => onChange({ ...draft, obrigatorio: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-[#16a34a] focus:ring-[#16a34a]"
        />
        <span className="text-[12.5px] font-semibold text-gray-700">Campo obrigatório (exibe asterisco)</span>
      </label>
    </>
  );
};

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
    <span className={danger ? 'text-red-500' : 'text-[#16A34A]'}>{icon}</span>
    {label}
  </button>
);

// ── Linha da tabela (master) ────────────────────────────────────────────────────

interface SortableRowProps {
  campo: CampoPersonalizado;
  selected: boolean;
  menuOpen: boolean;
  onSelect: (c: CampoPersonalizado) => void;
  onMenu: (e: React.MouseEvent, id: string) => void;
}

const SortableRow: React.FC<SortableRowProps> = ({ campo, selected, menuOpen, onSelect, onMenu }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: campo.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(campo)}
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
      <td className={`p-3 font-semibold ${selected ? 'text-[#16a34a]' : 'text-gray-800'}`}>{campo.nome}</td>
      <td className="p-3">
        <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600">
          {TIPO_LABEL[campo.tipo]}
        </span>
      </td>
      <td className="p-3 text-[12px] text-gray-500">
        {campo.movimentos?.length ? campo.movimentos.map((m) => MOVIMENTO_OPTS.find((o) => o.id === m)?.label ?? m).join(', ') : '—'}
      </td>
      <td className="p-3 text-center">
        <button
          type="button"
          onClick={(e) => onMenu(e, campo.id)}
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

const CamposPersonalizadosManagement: React.FC<Props> = ({ onToast, onBack }) => {
  const { user } = useAuth();
  const { selectedClient } = useClient();

  const organizationId = selectedClient?.id ?? user?.organizationId ?? '';

  const [campos, setCampos] = useState<CampoPersonalizado[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const [aba, setAba] = useState<'lancar' | 'registros'>('lancar');

  // Rascunho da aba Lançamentos (criação).
  const [form, setForm] = useState<Draft>(EMPTY_DRAFT);

  // Detalhamento editável (aba Registros).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Draft>(EMPTY_DRAFT);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadCampos = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const rows = await listCamposPersonalizados(organizationId);
      setCampos(rows);
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao carregar campos personalizados', 'error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, onToast]);

  useEffect(() => {
    loadCampos();
  }, [loadCampos]);

  // Mantém a seleção válida quando a lista muda.
  useEffect(() => {
    setSelectedId((prev) => {
      if (prev && campos.some((c) => c.id === prev)) return prev;
      return campos[0]?.id ?? null;
    });
  }, [campos]);

  const selected = campos.find((c) => c.id === selectedId) || null;
  useEffect(() => {
    if (selected) setEditForm(toDraft(selected));
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lançamento (create) ─────────────────────────────────────────────────────

  const cancelLancamento = useCallback(() => setForm(EMPTY_DRAFT), []);

  const salvar = useCallback(async () => {
    const err = validateDraft(form);
    if (err) {
      onToast?.(err, 'error');
      return;
    }
    const lower = form.nome.trim().toLowerCase();
    if (campos.some((c) => c.nome.trim().toLowerCase() === lower)) {
      onToast?.('Já existe um campo com esse nome', 'warning');
      return;
    }
    setSaving(true);
    try {
      await createCampoPersonalizado({ organizationId, ...draftToPayload(form) });
      onToast?.('Campo salvo com sucesso', 'success');
      setForm(EMPTY_DRAFT);
      await loadCampos();
      setAba('registros');
    } catch (e: any) {
      onToast?.(e.message || 'Erro ao salvar campo', 'error');
    } finally {
      setSaving(false);
    }
  }, [form, campos, organizationId, onToast, loadCampos]);

  // ── Edição (detalhamento da aba Registros) ──────────────────────────────────

  const salvarDetalhe = useCallback(async () => {
    if (!selectedId) return;
    const err = validateDraft(editForm);
    if (err) {
      onToast?.(err, 'error');
      return;
    }
    const lower = editForm.nome.trim().toLowerCase();
    if (campos.some((c) => c.id !== selectedId && c.nome.trim().toLowerCase() === lower)) {
      onToast?.('Já existe um campo com esse nome', 'warning');
      return;
    }
    setSaving(true);
    try {
      await updateCampoPersonalizado(selectedId, draftToPayload(editForm));
      onToast?.('Campo atualizado com sucesso', 'success');
      await loadCampos();
    } catch (e: any) {
      onToast?.(e.message || 'Erro ao salvar campo', 'error');
    } finally {
      setSaving(false);
    }
  }, [selectedId, editForm, campos, onToast, loadCampos]);

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteCampoPersonalizado(deleteConfirmId);
      onToast?.('Campo removido', 'success');
      setDeleteConfirmId(null);
      await loadCampos();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao excluir campo', 'error');
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

      const oldIndex = campos.findIndex((c) => c.id === String(active.id));
      const newIndex = campos.findIndex((c) => c.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = [...campos];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      setCampos(reordered);

      const items = reordered.map((c, i) => ({ id: c.id, ordem: i }));
      try {
        await reorderCamposPersonalizados(items);
      } catch (err: any) {
        onToast?.(err.message || 'Erro ao reordenar', 'error');
        await loadCampos();
      }
    },
    [campos, onToast, loadCampos],
  );

  const sortableIds = campos.map((c) => c.id);
  const activeDragCampo = activeId ? campos.find((c) => c.id === activeId) : null;

  // ── Menu de ações (•••) ─────────────────────────────────────────────────────
  const toggleMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu((prev) => (prev?.id === id ? null : { id, x: r.right, y: r.bottom }));
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);

  // ── Divisor arrastável entre a lista (master) e o detalhamento (detail) ─────
  const splitRef = useRef<HTMLDivElement>(null);
  const [masterPct, setMasterPct] = useState(45);
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
        Selecione uma organização para gerenciar os campos personalizados.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 md:p-8 max-w-4xl mx-auto w-full min-h-screen animate-in fade-in duration-500">
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
            title="Campos Personalizados"
            right={
              <TabSwitch
                tabs={[
                  { id: 'lancar', label: 'Lançamentos', icon: <Plus size={16} /> },
                  { id: 'registros', label: 'Registros', icon: <List size={16} />, badge: campos.length },
                ]}
                value={aba}
                onChange={(id) => setAba(id as 'lancar' | 'registros')}
              />
            }
          />
        </div>
      </div>

      {aba === 'lancar' ? (
        /* ── Aba Lançamentos: cadastro de um campo ──────────────────────────── */
        <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-[12.5px] leading-relaxed text-gray-500">
            Crie campos extras que aparecerão no painel <strong>"Defina seus campos"</strong> das movimentações
            escolhidas. Posicione ou oculte cada campo por tela direto no painel.
          </p>
          <CampoFormFields draft={form} onChange={setForm} />
          <FormActions
            onCancel={cancelLancamento}
            onSave={salvar}
            saveDisabled={!form.nome.trim() || saving}
            saveIcon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}
          />
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : campos.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-2xl p-12 shadow-md text-gray-400 border-gray-200 bg-white">
          <SlidersHorizontal size={48} className="mx-auto mb-4 opacity-30 text-[#16A34A]" />
          <p className="text-sm font-semibold text-[#0F172A]">Nenhum campo cadastrado.</p>
          <p className="text-xs mt-1 opacity-70">Use a aba "Lançamentos" para começar.</p>
        </div>
      ) : (
        /* ── Aba Registros: master-detail ───────────────────────────────────── */
        <>
          <div className="mb-4">
            <h2 className="text-[17px] font-bold text-gray-900">Todos os campos — Campos Personalizados</h2>
            <p className="mt-0.5 text-[12.5px] text-gray-500">
              Clique em um campo para editá-lo; use ••• para ver ou excluir.
            </p>
          </div>
          <div
            ref={splitRef}
            className="flex h-[calc(100vh-240px)] min-h-[460px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white"
          >
            {/* Master */}
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
                      <th className="p-3 font-bold">Campo</th>
                      <th className="p-3 font-bold">Tipo</th>
                      <th className="p-3 font-bold">Movimentações</th>
                      <th className="p-3 text-center font-bold">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                      {campos.map((campo) => (
                        <SortableRow
                          key={campo.id}
                          campo={campo}
                          selected={selectedId === campo.id}
                          menuOpen={menu?.id === campo.id}
                          onSelect={(c) => setSelectedId(c.id)}
                          onMenu={toggleMenu}
                        />
                      ))}
                    </SortableContext>
                  </tbody>
                </table>
                <DragOverlay dropAnimation={null}>
                  {activeDragCampo ? (
                    <div className="flex items-center gap-3 rounded border border-[#E5E7EB] bg-white px-4 py-3 shadow-2xl">
                      <GripVertical size={16} className="text-[#16A34A]" />
                      <span className="truncate font-bold text-[#0F172A]">{activeDragCampo.nome}</span>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>

            {/* Divisor arrastável */}
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Ajustar altura da lista de registros"
              onPointerDown={startResize}
              onPointerMove={onResize}
              onPointerUp={endResize}
              onPointerCancel={endResize}
              className="group relative flex h-2.5 shrink-0 cursor-row-resize touch-none items-center justify-center border-t-4 border-[#e7f6ec] bg-[#fafbfc] transition-colors hover:border-[#16a34a]/40"
              title="Arraste para ajustar o espaço da lista e da edição"
            >
              <span className="h-1 w-10 rounded-full bg-gray-300 transition-colors group-hover:bg-[#16a34a]" />
            </div>

            {/* Detail: edição do campo selecionado */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#fafbfc]">
              {selected ? (
                <div className="flex flex-1 flex-col gap-4 p-5">
                  <h4 className="text-[14px] font-bold text-gray-900">Editar · {selected.nome}</h4>
                  <CampoFormFields draft={editForm} onChange={setEditForm} />
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
                  Selecione um registro acima para editar.
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
              label="Editar"
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
              Tem certeza que deseja remover este campo? Ele deixará de aparecer nas movimentações. Os valores já
              gravados nos lançamentos anteriores são preservados. Esta ação não poderá ser desfeita.
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

export default CamposPersonalizadosManagement;
