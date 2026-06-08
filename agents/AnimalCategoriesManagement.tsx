import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  List,
  ArrowLeft,
  Edit2,
  Trash2,
  GripVertical,
  Loader2,
  Info,
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
import PageHeader from '../components/ui/PageHeader';
import TabSwitch from '../components/ui/TabSwitch';
import FormActions from '../components/ui/FormActions';
import {
  listAnimalCategories,
  createAnimalCategory,
  updateAnimalCategory,
  deleteAnimalCategory,
  reorderAnimalCategories,
  type AnimalCategory,
} from '../lib/api/animalCategoriesClient';

// ── Constants ─────────────────────────────────────────────────────────────────

const GRUPO_OPTIONS = [
  { value: 'matrizes_reproducao', label: 'Matrizes em Reprodução' },
  { value: 'novilhas', label: 'Novilhas' },
  { value: 'matrizes_descarte', label: 'Matrizes em Descarte' },
  { value: 'bezerros_mamando', label: 'Bezerros Mamando' },
  { value: 'garrotes_bois', label: 'Garrotes / Bois' },
  { value: 'touros', label: 'Touros' },
  { value: 'outros', label: 'Outros' },
] as const;

const GRUPO_LABELS: Record<string, string> = Object.fromEntries(
  GRUPO_OPTIONS.map((g) => [g.value, g.label]),
);

const IDADE_OPTIONS = [
  { value: 'ate_12', label: 'Até 12 Meses' },
  { value: '13_24', label: '13 a 24 Meses' },
  { value: '25_36', label: '25 a 36 Meses' },
  { value: 'mais_36', label: 'Mais de 36 Meses' },
] as const;

const SEXO_AUTO: Record<string, 'macho' | 'femea'> = {
  matrizes_reproducao: 'femea',
  novilhas: 'femea',
  matrizes_descarte: 'femea',
  garrotes_bois: 'macho',
  touros: 'macho',
};

function isSexoLocked(grupo: string) {
  return grupo in SEXO_AUTO;
}

function getAutoSexo(grupo: string): 'macho' | 'femea' {
  return SEXO_AUTO[grupo] ?? 'macho';
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onBack?: () => void;
  theme?: 'light' | 'dark';
}

interface FormState {
  nome: string;
  grupo: string;
  sexo: string;
  idadeFaixa: string;
  pesoKg: string;
  ativo: boolean;
}

const EMPTY_FORM: FormState = {
  nome: '',
  grupo: 'outros',
  sexo: 'macho',
  idadeFaixa: 'ate_12',
  pesoKg: '',
  ativo: true,
};

// ── Sortable Row (aba Registros) ───────────────────────────────────────────────

interface SortableRowProps {
  category: AnimalCategory;
  onEdit: (c: AnimalCategory) => void;
  onDelete: (id: string) => void;
}

const SortableRow: React.FC<SortableRowProps> = ({ category, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
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
        <div className="font-bold">{category.nome}</div>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
            category.sexo === 'femea'
              ? 'bg-[#FCE7F3] text-[#9D174D]'
              : 'bg-[#DBEAFE] text-[#1E40AF]'
          }`}
        >
          {category.sexo === 'femea' ? 'Fêmea' : 'Macho'}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-600 font-medium">
        {GRUPO_LABELS[category.grupo] ?? category.grupo}
      </td>
      <td className="px-4 py-3 text-right font-semibold text-gray-600">
        {category.pesoKg ? `${parseFloat(category.pesoKg).toFixed(1)} kg` : '—'}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
            category.ativo
              ? 'bg-[#DCFCE7] text-[#15803D]'
              : 'bg-[#F3F4F6] text-[#6B7280]'
          }`}
        >
          {category.ativo ? 'Ativa' : 'Inativa'}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onEdit(category)}
            className="p-1.5 rounded-lg transition-all text-gray-400 hover:text-[#16A34A] hover:bg-[#E7F6EC]"
          >
            <Edit2 size={15} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(category.id)}
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

const AnimalCategoriesManagement: React.FC<Props> = ({ onToast, onBack }) => {
  const { user } = useAuth();
  const { selectedClient } = useClient();

  const organizationId = selectedClient?.id ?? user?.organizationId ?? '';

  const [categories, setCategories] = useState<AnimalCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingCategory, setEditingCategory] = useState<AnimalCategory | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [aba, setAba] = useState<'lancar' | 'registros'>('lancar');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadCategories = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const rows = await listAnimalCategories(organizationId);
      setCategories(rows);
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao carregar categorias', 'error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, onToast]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // ── Form helpers ──────────────────────────────────────────────────────────

  const novo = useCallback(() => {
    setEditingCategory(null);
    setForm(EMPTY_FORM);
  }, []);

  const startEdit = useCallback((cat: AnimalCategory) => {
    setEditingCategory(cat);
    setForm({
      nome: cat.nome,
      grupo: cat.grupo,
      sexo: cat.sexo,
      idadeFaixa: cat.idadeFaixa ?? 'ate_12',
      pesoKg: cat.pesoKg ? String(parseFloat(cat.pesoKg)) : '',
      ativo: cat.ativo ?? true,
    });
    setAba('lancar');
  }, []);

  const handleGrupoChange = (grupo: string) => {
    const locked = isSexoLocked(grupo);
    setForm((prev) => ({
      ...prev,
      grupo,
      sexo: locked ? getAutoSexo(grupo) : prev.sexo,
    }));
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.nome.trim()) return;
    setSaving(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        sexo: form.sexo,
        grupo: form.grupo,
        idadeFaixa: form.idadeFaixa || undefined,
        pesoKg: form.pesoKg ? parseFloat(form.pesoKg) : null,
        ativo: form.ativo,
      };

      if (editingCategory) {
        await updateAnimalCategory(editingCategory.id, payload);
        onToast?.('Categoria atualizada com sucesso', 'success');
      } else {
        await createAnimalCategory({ ...payload, organizationId });
        onToast?.('Categoria criada com sucesso', 'success');
      }
      // Reset para o próximo lançamento (entrada inline, um item por vez).
      setEditingCategory(null);
      setForm(EMPTY_FORM);
      await loadCategories();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar categoria', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteAnimalCategory(deleteConfirmId);
      onToast?.('Categoria removida', 'success');
      setDeleteConfirmId(null);
      await loadCategories();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao excluir categoria', 'error');
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

      const oldIndex = categories.findIndex((c) => c.id === String(active.id));
      const newIndex = categories.findIndex((c) => c.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = [...categories];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      setCategories(reordered);

      const items = reordered.map((c, i) => ({ id: c.id, ordem: i }));
      try {
        await reorderAnimalCategories(items);
      } catch (err: any) {
        onToast?.(err.message || 'Erro ao reordenar', 'error');
        await loadCategories();
      }
    },
    [categories, onToast, loadCategories],
  );

  const sortableIds = categories.map((c) => c.id);
  const activeDragCategory = activeId ? categories.find((c) => c.id === activeId) : null;

  // ── Render ────────────────────────────────────────────────────────────────

  if (!organizationId) {
    return (
      <div className="p-8 text-sm font-semibold text-gray-500">
        Selecione uma organização para gerenciar categorias de animais.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 md:p-8 max-w-6xl mx-auto w-full min-h-screen animate-in fade-in duration-500">
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
            title="Categorias de Animais"
            right={
              <TabSwitch
                tabs={[
                  { id: 'lancar', label: 'Lançamentos', icon: <Plus size={16} /> },
                  { id: 'registros', label: 'Registros', icon: <List size={16} />, badge: categories.length },
                ]}
                value={aba}
                onChange={(id) => setAba(id as 'lancar' | 'registros')}
              />
            }
          />
        </div>
      </div>

      {aba === 'lancar' ? (
        /* ── Aba Lançamentos: formulário inline (salva um item por vez) ──────── */
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          {editingCategory ? (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#fcd9b6] bg-[#fff7ed] px-3 py-2 text-[13px] font-semibold text-[#ea580c]">
              <Info size={15} /> Editando uma categoria existente — altere os dados e clique em “Salvar alterações”.
            </div>
          ) : null}

          <div className="space-y-5">
            {/* Descrição */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-2 text-[#6B7280]">
                Descrição <span className="text-[#DC2626]">*</span>
              </label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Bezerro Desmamado, Novilha..."
                className="w-full px-3 py-2.5 border border-[#E5E7EB] bg-white text-[#0F172A] rounded-lg text-sm focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/20 outline-none transition-all placeholder-gray-400"
              />
            </div>

            {/* Grupo */}
            <div className="border border-[#E5E7EB] bg-[#F9FAFB]/50 rounded-xl p-4">
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-3.5 text-[#6B7280]">Grupo</label>
              <div className="flex flex-wrap gap-2">
                {GRUPO_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleGrupoChange(opt.value)}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors duration-200 border ${
                      form.grupo === opt.value
                        ? 'bg-[#16A34A] border-[#16A34A] text-white shadow-sm'
                        : 'bg-[#F3F4F6] border-transparent text-[#6B7280] hover:bg-[#E5E7EB]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Peso Médio + Sexo + Idade em linha */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Peso */}
              <div className="border border-[#E5E7EB] bg-[#F9FAFB]/50 rounded-xl p-4">
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-3 text-[#6B7280]">
                  Peso Médio (kg)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.pesoKg}
                    onChange={(e) => setForm((f) => ({ ...f, pesoKg: e.target.value }))}
                    placeholder="Ex: 450"
                    className="w-full px-3 py-2.5 border border-[#E5E7EB] bg-white text-[#0F172A] rounded-lg text-sm focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/20 outline-none transition-all"
                  />
                  <span className="text-sm font-bold text-gray-500">kg</span>
                </div>
              </div>

              {/* Sexo */}
              <div className="border border-[#E5E7EB] bg-[#F9FAFB]/50 rounded-xl p-4">
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-3.5 text-[#6B7280]">Sexo</label>
                {isSexoLocked(form.grupo) ? (
                  <p className="text-sm font-bold uppercase tracking-wider flex items-center gap-1.5 text-[#16A34A]">
                    ✓ {getAutoSexo(form.grupo) === 'femea' ? 'Fêmea' : 'Macho'}
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {(['macho', 'femea'] as const).map((s) => (
                      <label key={s} className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="sexo"
                          checked={form.sexo === s}
                          onChange={() => setForm((f) => ({ ...f, sexo: s }))}
                          className="w-4 h-4 text-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/20"
                        />
                        <span className="text-sm font-semibold text-[#0F172A]">
                          {s === 'femea' ? 'Fêmea' : 'Macho'}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Idade */}
              <div className="border border-[#E5E7EB] bg-[#F9FAFB]/50 rounded-xl p-4">
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-3.5 text-[#6B7280]">Idade</label>
                <div className="space-y-2">
                  {IDADE_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="idadeFaixa"
                        checked={form.idadeFaixa === opt.value}
                        onChange={() => setForm((f) => ({ ...f, idadeFaixa: opt.value }))}
                        className="w-4 h-4 text-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/20"
                      />
                      <span className="text-sm font-semibold text-[#0F172A]">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Situação */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                role="switch"
                aria-checked={form.ativo}
                onClick={() => setForm((f) => ({ ...f, ativo: !f.ativo }))}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 ${
                  form.ativo ? 'bg-[#16A34A]' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    form.ativo ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span className="text-sm font-semibold text-[#0F172A]">
                {form.ativo ? 'Categoria ativa' : 'Categoria inativa'}
              </span>
              <span className="text-xs text-gray-400">(desmarque para inativar)</span>
            </div>
          </div>

          <FormActions
            onCancel={novo}
            onSave={handleSave}
            saveDisabled={!form.nome.trim() || saving}
            saveLabel={editingCategory ? 'Salvar alterações' : 'Salvar'}
            cancelLabel={editingCategory ? 'Cancelar edição' : 'Limpar'}
            saveIcon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}
          />
        </div>
      ) : (
        /* ── Aba Registros: lista persistida (reorder + editar + excluir) ────── */
        loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-16 border border-dashed rounded-2xl p-12 shadow-md text-gray-400 border-gray-200 bg-white">
            <CattleHeadIcon size={48} className="mx-auto mb-4 opacity-30 text-[#16A34A]" />
            <p className="text-sm font-semibold text-[#0F172A]">Nenhuma categoria cadastrada.</p>
            <p className="text-xs mt-1 opacity-70">Use a aba "Lançamentos" para começar.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#E5E7EB] bg-white overflow-hidden shadow-[0_1px_3px_rgba(16,24,40,0.08)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280] text-[11px] uppercase tracking-wider font-bold">
                  <th className="w-10" />
                  <th className="px-4 py-3.5 text-left">Categoria</th>
                  <th className="px-4 py-3.5 text-left">Sexo</th>
                  <th className="px-4 py-3.5 text-left">Grupo</th>
                  <th className="px-4 py-3.5 text-right">Peso Padrão (kg)</th>
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
                    {categories.map((cat) => (
                      <SortableRow
                        key={cat.id}
                        category={cat}
                        onEdit={startEdit}
                        onDelete={(id) => setDeleteConfirmId(id)}
                      />
                    ))}
                  </tbody>
                </SortableContext>
                <DragOverlay dropAnimation={null}>
                  {activeDragCategory ? (
                    <table className="w-full text-sm bg-white">
                      <tbody>
                        <tr className="shadow-2xl rounded border border-[#E5E7EB] text-[#0F172A] bg-white">
                          <td className="px-3 py-3 w-10">
                            <GripVertical size={16} className="text-[#16A34A]" />
                          </td>
                          <td className="px-4 py-3 text-[#0F172A]">
                            <div className="font-bold">{activeDragCategory.nome}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                                activeDragCategory.sexo === 'femea'
                                  ? 'bg-[#FCE7F3] text-[#9D174D]'
                                  : 'bg-[#DBEAFE] text-[#1E40AF]'
                              }`}
                            >
                              {activeDragCategory.sexo === 'femea' ? 'Fêmea' : 'Macho'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {GRUPO_LABELS[activeDragCategory.grupo] ?? activeDragCategory.grupo}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {activeDragCategory.pesoKg
                              ? `${parseFloat(activeDragCategory.pesoKg).toFixed(1)} kg`
                              : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                                activeDragCategory.ativo
                                  ? 'bg-[#DCFCE7] text-[#15803D]'
                                  : 'bg-[#F3F4F6] text-[#6B7280]'
                              }`}
                            >
                              {activeDragCategory.ativo ? 'Ativa' : 'Inativa'}
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
                    Total: {categories.length} {categories.length === 1 ? 'categoria cadastrada' : 'categorias cadastradas'}
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
              Tem certeza que deseja remover esta categoria? Esta ação não poderá ser desfeita.
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

export default AnimalCategoriesManagement;
