import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  List,
  ArrowLeft,
  Edit2,
  Trash2,
  GripVertical,
  Loader2,
  Check,
  X,
  Dna,
  Lock,
  Info,
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
import InlineEntryTable, { type Column } from '../components/ui/InlineEntryTable';
import {
  listAnimalBreeds,
  createAnimalBreed,
  updateAnimalBreed,
  deleteAnimalBreed,
  reorderAnimalBreeds,
  type AnimalBreed,
} from '../lib/api/animalBreedsClient';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onBack?: () => void;
  theme?: 'light' | 'dark';
}

/** Raça ainda não persistida, acumulada na régua de lançamento. */
interface DraftBreed {
  localId: number;
  nome: string;
  codigoAsbia: string;
  observacao: string;
}

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
const textareaCls =
  'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15 resize-none';

// ── UI helpers ─────────────────────────────────────────────────────────────────

/** Switch de situação (ativa/inativa). */
const SituacaoSwitch: React.FC<{ checked: boolean; onClick: () => void }> = ({ checked, onClick }) => (
  <div className="flex items-center gap-2.5">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 ${
        checked ? 'bg-[#16A34A]' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
    <span className="text-sm font-semibold text-[#0F172A]">{checked ? 'Ativa' : 'Inativa'}</span>
  </div>
);

/** Célula do código ASBIA/INTERBULL. */
const CodigoCell: React.FC<{ codigo: string | null }> = ({ codigo }) =>
  codigo ? (
    <span className="font-mono text-sm font-bold uppercase tracking-widest text-[#0F172A]">{codigo}</span>
  ) : (
    <span className="text-sm text-gray-300">—</span>
  );

// ── Sortable Row (aba Registros) ───────────────────────────────────────────────

interface SortableRowProps {
  breed: AnimalBreed;
  editing: boolean;
  editNome: string;
  editCodigoAsbia: string;
  editAtivo: boolean;
  onStartEdit: (b: AnimalBreed) => void;
  onChangeEditNome: (v: string) => void;
  onChangeEditCodigoAsbia: (v: string) => void;
  onToggleEditAtivo: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onToggleAtivoDirect: (b: AnimalBreed) => void;
}

const SortableRow: React.FC<SortableRowProps> = ({
  breed,
  editing,
  editNome,
  editCodigoAsbia,
  editAtivo,
  onStartEdit,
  onChangeEditNome,
  onChangeEditCodigoAsbia,
  onToggleEditAtivo,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onToggleAtivoDirect,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: breed.id,
    disabled: editing,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const isSystem = breed.sistema;

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="border-b border-[#E5E7EB] transition-colors duration-150 hover:bg-[#F9FAFB]"
    >
      <td className="px-3 py-3 w-8">
        <button
          type="button"
          disabled={editing}
          className="cursor-grab active:cursor-grabbing transition-colors text-gray-400 hover:text-[#16A34A] disabled:opacity-30"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
      </td>
      <td className="px-4 py-3 text-[#0F172A]">
        {editing ? (
          <input
            type="text"
            autoFocus
            value={editNome}
            onChange={(e) => onChangeEditNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            className={inputCls}
          />
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-bold">{breed.nome}</span>
            {isSystem && (
              <span
                title="Raça padrão do sistema — só pode ser ativada/inativada"
                className="inline-flex items-center gap-1 rounded-md bg-[#F1F5F9] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#64748B]"
              >
                <Lock size={10} /> Padrão
              </span>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-[#0F172A]">
        {editing ? (
          <input
            type="text"
            value={editCodigoAsbia}
            maxLength={2}
            onChange={(e) => onChangeEditCodigoAsbia(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            placeholder="—"
            className={`${inputCls} w-20 text-center font-mono uppercase tracking-widest`}
          />
        ) : (
          <CodigoCell codigo={breed.codigoAsbia} />
        )}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <SituacaoSwitch checked={editAtivo} onClick={onToggleEditAtivo} />
        ) : isSystem ? (
          // Raça padrão: situação é editável diretamente (único controle permitido).
          <SituacaoSwitch checked={breed.ativo} onClick={() => onToggleAtivoDirect(breed)} />
        ) : (
          <span
            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
              breed.ativo ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#F3F4F6] text-[#6B7280]'
            }`}
          >
            {breed.ativo ? 'Ativa' : 'Inativa'}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {editing ? (
            <>
              <button
                type="button"
                onClick={onSaveEdit}
                className="p-1.5 rounded-lg transition-all text-[#16A34A] hover:bg-[#E7F6EC]"
                title="Salvar"
              >
                <Check size={16} />
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                className="p-1.5 rounded-lg transition-all text-gray-400 hover:text-[#0F172A] hover:bg-gray-100"
                title="Cancelar"
              >
                <X size={16} />
              </button>
            </>
          ) : isSystem ? (
            <span
              title="Raça padrão do sistema não pode ser alterada ou excluída"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-300"
            >
              <Lock size={13} />
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onStartEdit(breed)}
                className="p-1.5 rounded-lg transition-all text-gray-400 hover:text-[#16A34A] hover:bg-[#E7F6EC]"
              >
                <Edit2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(breed.id)}
                className="p-1.5 rounded-lg transition-all text-gray-400 hover:text-[#DC2626] hover:bg-red-50"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const AnimalBreedsManagement: React.FC<Props> = ({ onToast, onBack }) => {
  const { user } = useAuth();
  const { selectedClient } = useClient();

  const organizationId = selectedClient?.id ?? user?.organizationId ?? '';

  const [breeds, setBreeds] = useState<AnimalBreed[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Régua de lançamento (aba Lançamentos)
  const [aba, setAba] = useState<'lancar' | 'registros'>('lancar');
  const [drafts, setDrafts] = useState<DraftBreed[]>([]);
  const [nome, setNome] = useState('');
  const [codigoAsbia, setCodigoAsbia] = useState('');
  const [observacao, setObservacao] = useState('');
  const draftSeq = useRef(1);

  // Edição inline (aba Registros)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editCodigoAsbia, setEditCodigoAsbia] = useState('');
  const [editAtivo, setEditAtivo] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadBreeds = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const rows = await listAnimalBreeds(organizationId);
      setBreeds(rows);
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao carregar raças', 'error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, onToast]);

  useEffect(() => {
    loadBreeds();
  }, [loadBreeds]);

  // ── Lançamento inline ───────────────────────────────────────────────────────

  const addDraft = useCallback(() => {
    const clean = nome.trim();
    if (!clean) {
      onToast?.('Informe o nome da raça', 'error');
      return;
    }
    const lower = clean.toLowerCase();
    const dupDraft = drafts.some((d) => d.nome.trim().toLowerCase() === lower);
    const dupSaved = breeds.some((b) => b.nome.trim().toLowerCase() === lower);
    if (dupDraft || dupSaved) {
      onToast?.('Essa raça já foi adicionada', 'warning');
      return;
    }
    setDrafts((prev) => [
      ...prev,
      {
        localId: draftSeq.current++,
        nome: clean,
        codigoAsbia: codigoAsbia.trim().toUpperCase(),
        observacao: observacao.trim(),
      },
    ]);
    setNome(''); // reset: limpa nome/código/observação
    setCodigoAsbia('');
    setObservacao('');
  }, [nome, codigoAsbia, observacao, drafts, breeds, onToast]);

  const removeDraft = useCallback((localId: number) => {
    setDrafts((prev) => prev.filter((d) => d.localId !== localId));
  }, []);

  const cancelLancamento = useCallback(() => {
    setDrafts([]);
    setNome('');
    setCodigoAsbia('');
    setObservacao('');
  }, []);

  const salvarLote = useCallback(async () => {
    if (!drafts.length) return;
    setSaving(true);
    try {
      for (const d of drafts) {
        await createAnimalBreed({
          nome: d.nome.trim(),
          codigoAsbia: d.codigoAsbia || null,
          observacao: d.observacao || null,
          ativo: true,
          organizationId,
        });
      }
      const n = drafts.length;
      onToast?.(`${n} ${n === 1 ? 'raça salva' : 'raças salvas'} com sucesso`, 'success');
      setDrafts([]);
      setNome('');
      setCodigoAsbia('');
      setObservacao('');
      await loadBreeds();
      setAba('registros');
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar raças', 'error');
      await loadBreeds();
    } finally {
      setSaving(false);
    }
  }, [drafts, organizationId, onToast, loadBreeds]);

  // ── Edição inline (Registros) ───────────────────────────────────────────────

  const startEdit = useCallback((breed: AnimalBreed) => {
    if (breed.sistema) return; // raça padrão não é editável
    setEditingId(breed.id);
    setEditNome(breed.nome);
    setEditCodigoAsbia(breed.codigoAsbia ?? '');
    setEditAtivo(breed.ativo);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    const clean = editNome.trim();
    if (!clean) {
      onToast?.('Informe o nome da raça', 'error');
      return;
    }
    try {
      await updateAnimalBreed(editingId, {
        nome: clean,
        codigoAsbia: editCodigoAsbia.trim().toUpperCase() || null,
        ativo: editAtivo,
      });
      onToast?.('Raça atualizada com sucesso', 'success');
      setEditingId(null);
      await loadBreeds();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar raça', 'error');
    }
  }, [editingId, editNome, editCodigoAsbia, editAtivo, onToast, loadBreeds]);

  // Toggle direto de situação (usado nas raças padrão do sistema).
  const toggleAtivoDirect = useCallback(
    async (breed: AnimalBreed) => {
      const novo = !breed.ativo;
      setBreeds((prev) => prev.map((b) => (b.id === breed.id ? { ...b, ativo: novo } : b)));
      try {
        await updateAnimalBreed(breed.id, { ativo: novo });
      } catch (err: any) {
        onToast?.(err.message || 'Erro ao alterar situação', 'error');
        await loadBreeds();
      }
    },
    [onToast, loadBreeds],
  );

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteAnimalBreed(deleteConfirmId);
      onToast?.('Raça removida', 'success');
      setDeleteConfirmId(null);
      await loadBreeds();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao excluir raça', 'error');
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

      const oldIndex = breeds.findIndex((b) => b.id === String(active.id));
      const newIndex = breeds.findIndex((b) => b.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = [...breeds];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      setBreeds(reordered);

      const items = reordered.map((b, i) => ({ id: b.id, ordem: i }));
      try {
        await reorderAnimalBreeds(items);
      } catch (err: any) {
        onToast?.(err.message || 'Erro ao reordenar', 'error');
        await loadBreeds();
      }
    },
    [breeds, onToast, loadBreeds],
  );

  const sortableIds = breeds.map((b) => b.id);
  const activeDragBreed = activeId ? breeds.find((b) => b.id === activeId) : null;

  // ── Régua de lançamento: colunas ────────────────────────────────────────────

  const draftColumns: Column<DraftBreed>[] = [
    { key: 'nome', header: 'Raça', render: (d) => <span className="font-semibold text-gray-800">{d.nome}</span> },
    {
      key: 'codigoAsbia',
      header: 'Código',
      render: (d) => <CodigoCell codigo={d.codigoAsbia || null} />,
    },
    {
      key: 'observacao',
      header: 'Observação',
      render: (d) =>
        d.observacao ? (
          <span className="text-gray-700">{d.observacao}</span>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  if (!organizationId) {
    return (
      <div className="p-8 text-sm font-semibold text-gray-500">
        Selecione uma organização para gerenciar raças.
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
            title="Raças"
            right={
              <TabSwitch
                tabs={[
                  { id: 'lancar', label: 'Lançamentos', icon: <Plus size={16} /> },
                  { id: 'registros', label: 'Registros', icon: <List size={16} />, badge: breeds.length },
                ]}
                value={aba}
                onChange={(id) => setAba(id as 'lancar' | 'registros')}
              />
            }
          />
        </div>
      </div>

      {aba === 'lancar' ? (
        /* ── Aba Lançamentos: entrada inline (clicar → aparece na régua) ─────── */
        <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
                Nome da Raça <span className="text-[#DC2626]">*</span>
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addDraft();
                }}
                placeholder="Ex: Nelore, Angus, Brangus..."
                className={inputCls}
              />
            </div>
            <div className="w-[150px]">
              <label className="mb-1 flex items-center gap-1 text-[12.5px] font-semibold text-gray-700">
                Código
                <Info size={13} className="text-gray-400" aria-hidden />
                <span className="sr-only">ASBIA/INTERBULL</span>
              </label>
              <input
                type="text"
                value={codigoAsbia}
                maxLength={2}
                title="ASBIA/INTERBULL"
                onChange={(e) => setCodigoAsbia(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addDraft();
                }}
                placeholder="Ex: NE"
                className={`${inputCls} text-center font-mono uppercase tracking-widest`}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">Observação</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Observação livre sobre a raça (opcional)"
              rows={2}
              className={textareaCls}
            />
          </div>

          {drafts.length > 0 && (
            <InlineEntryTable
              columns={draftColumns}
              rows={drafts}
              rowKey={(d) => d.localId}
              onRemove={(d) => removeDraft(d.localId)}
            />
          )}

          <FormActions
            onCancel={cancelLancamento}
            onSave={salvarLote}
            saveDisabled={drafts.length === 0 || saving}
            saveIcon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}
            status={
              drafts.length ? (
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#16a34a]">
                  <Check size={14} /> {drafts.length} {drafts.length === 1 ? 'raça a salvar' : 'raças a salvar'}
                </span>
              ) : null
            }
          />
        </div>
      ) : (
        /* ── Aba Registros: lista persistida (reorder + edição inline + excluir) ── */
        loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : breeds.length === 0 ? (
          <div className="text-center py-16 border border-dashed rounded-2xl p-12 shadow-md text-gray-400 border-gray-200 bg-white">
            <Dna size={48} className="mx-auto mb-4 opacity-30 text-[#16A34A]" />
            <p className="text-sm font-semibold text-[#0F172A]">Nenhuma raça cadastrada.</p>
            <p className="text-xs mt-1 opacity-70">Use a aba "Lançamentos" para começar.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#E5E7EB] bg-white overflow-hidden shadow-[0_1px_3px_rgba(16,24,40,0.08)]">
            <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280] text-[11px] uppercase tracking-wider font-bold">
                  <th className="w-10" />
                  <th className="px-4 py-3.5 text-left">Raça</th>
                  <th className="px-4 py-3.5 text-left" title="ASBIA/INTERBULL">
                    <span className="inline-flex cursor-help items-center gap-1">
                      Código <Info size={12} className="text-gray-400" />
                    </span>
                  </th>
                  <th className="px-4 py-3.5 text-left">Situação</th>
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
                    {breeds.map((breed) => (
                      <SortableRow
                        key={breed.id}
                        breed={breed}
                        editing={editingId === breed.id}
                        editNome={editNome}
                        editCodigoAsbia={editCodigoAsbia}
                        editAtivo={editAtivo}
                        onStartEdit={startEdit}
                        onChangeEditNome={setEditNome}
                        onChangeEditCodigoAsbia={setEditCodigoAsbia}
                        onToggleEditAtivo={() => setEditAtivo((v) => !v)}
                        onSaveEdit={saveEdit}
                        onCancelEdit={cancelEdit}
                        onDelete={(id) => setDeleteConfirmId(id)}
                        onToggleAtivoDirect={toggleAtivoDirect}
                      />
                    ))}
                  </tbody>
                </SortableContext>
                <DragOverlay dropAnimation={null}>
                  {activeDragBreed ? (
                    <table className="w-full text-sm bg-white">
                      <tbody>
                        <tr className="shadow-2xl rounded border border-[#E5E7EB] text-[#0F172A] bg-white">
                          <td className="px-3 py-3 w-10">
                            <GripVertical size={16} className="text-[#16A34A]" />
                          </td>
                          <td className="px-4 py-3 text-[#0F172A]">
                            <div className="font-bold">{activeDragBreed.nome}</div>
                          </td>
                          <td className="px-4 py-3">
                            <CodigoCell codigo={activeDragBreed.codigoAsbia} />
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                                activeDragBreed.ativo
                                  ? 'bg-[#DCFCE7] text-[#15803D]'
                                  : 'bg-[#F3F4F6] text-[#6B7280]'
                              }`}
                            >
                              {activeDragBreed.ativo ? 'Ativa' : 'Inativa'}
                            </span>
                          </td>
                          <td className="px-4 py-3" />
                        </tr>
                      </tbody>
                    </table>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </table>
            </div>
            <div className="border-t border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3 text-xs font-semibold leading-relaxed text-[#6B7280]">
              Total: {breeds.length} {breeds.length === 1 ? 'raça cadastrada' : 'raças cadastradas'}
            </div>
          </div>
        )
      )}

      {/* ── Delete Confirmation Dialog ─────────────────────────────────────── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 max-w-sm w-full shadow-2xl transition-all duration-300">
            <h3 className="text-lg font-black tracking-tight mb-2 text-[#0F172A]">Confirmar Exclusão</h3>
            <p className="text-sm leading-relaxed mb-6 text-[#6B7280]">
              Tem certeza que deseja remover esta raça? Esta ação não poderá ser desfeita.
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

export default AnimalBreedsManagement;
