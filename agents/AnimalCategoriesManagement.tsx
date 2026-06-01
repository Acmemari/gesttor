import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  ArrowLeft,
  Edit2,
  Trash2,
  GripVertical,
  Loader2,
  X,
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
  raca: string;
  complemento: string;
  grupo: string;
  sexo: string;
  idadeFaixa: string;
  pesoKg: string;
}

const EMPTY_FORM: FormState = {
  nome: '',
  raca: '',
  complemento: '',
  grupo: 'outros',
  sexo: 'macho',
  idadeFaixa: 'ate_12',
  pesoKg: '',
};

// ── Sortable Row ──────────────────────────────────────────────────────────────

interface SortableRowProps {
  category: AnimalCategory;
  onEdit: (c: AnimalCategory) => void;
  onDelete: (id: string) => void;
  theme?: 'light' | 'dark';
}

const SortableRow: React.FC<SortableRowProps> = ({ category, onEdit, onDelete, theme = 'light' }) => {
  const isDark = false; // Forçado claro conforme diretrizes visuais do Gesttor
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
        {category.raca && (
          <div className="text-[10px] text-gray-500 font-medium mt-0.5">
            {category.raca} {category.complemento ? `· ${category.complemento}` : ''}
          </div>
        )}
        {!category.raca && category.complemento && (
          <div className="text-[10px] text-gray-500 font-medium mt-0.5">
            {category.complemento}
          </div>
        )}
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

const AnimalCategoriesManagement: React.FC<Props> = ({ onToast, onBack, theme = 'light' }) => {
  const isDark = false; // Forçado claro conforme diretrizes visuais do Gesttor
  const { user } = useAuth();
  const { selectedClient } = useClient();

  const organizationId = selectedClient?.id ?? user?.organizationId ?? '';

  const [categories, setCategories] = useState<AnimalCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<AnimalCategory | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [activeId, setActiveId] = useState<string | null>(null);

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

  const openCreateModal = () => {
    setEditingCategory(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEditModal = (cat: AnimalCategory) => {
    setEditingCategory(cat);
    setForm({
      nome: cat.nome,
      raca: cat.raca ?? '',
      complemento: cat.complemento ?? '',
      grupo: cat.grupo,
      sexo: cat.sexo,
      idadeFaixa: cat.idadeFaixa ?? 'ate_12',
      pesoKg: cat.pesoKg ? String(parseFloat(cat.pesoKg)) : '',
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingCategory(null);
  };

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
        raca: form.raca || undefined,
        complemento: form.complemento.trim() || undefined,
        sexo: form.sexo,
        grupo: form.grupo,
        idadeFaixa: form.idadeFaixa || undefined,
        pesoKg: form.pesoKg ? parseFloat(form.pesoKg) : null,
      };

      if (editingCategory) {
        await updateAnimalCategory(editingCategory.id, payload);
        onToast?.('Categoria atualizada com sucesso', 'success');
      } else {
        await createAnimalCategory({ ...payload, organizationId });
        onToast?.('Categoria criada com sucesso', 'success');
      }
      closeModal();
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
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="p-2.5 rounded-xl transition-all text-gray-500 hover:text-[#16A34A] hover:bg-[#E7F6EC]"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="flex items-center gap-3">
          <CattleHeadIcon size={24} className="text-[#16A34A]" />
          <div>
            <span className="text-[11px] font-bold text-[#22C55E] tracking-widest uppercase block mb-0.5">
              CADASTRO DE
            </span>
            <h2 className="text-2xl font-black tracking-tight text-[#0F172A]">Categorias de Animais</h2>
            <p className="text-sm text-gray-500">
              Defina as categorias do seu rebanho com pesos e valores de mercado
            </p>
          </div>
        </div>
        <div className="ml-auto">
          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-300 bg-[#16A34A] hover:bg-[#15803D] text-white shadow-[0_1px_3px_rgba(16,24,40,0.08)]"
          >
            <Plus size={16} />
            Nova Categoria
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-2xl p-12 shadow-md text-gray-400 border-gray-200 bg-white">
          <CattleHeadIcon size={48} className="mx-auto mb-4 opacity-30 text-[#16A34A]" />
          <p className="text-sm font-semibold text-[#0F172A]">Nenhuma categoria cadastrada.</p>
          <p className="text-xs mt-1 opacity-70">Clique em "+ Nova Categoria" para começar.</p>
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
                      onEdit={openEditModal}
                      onDelete={(id) => setDeleteConfirmId(id)}
                      theme={theme}
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
                          {activeDragCategory.raca && (
                            <div className="text-[10px] text-gray-500 font-medium mt-0.5">
                              {activeDragCategory.raca} {activeDragCategory.complemento ? `· ${activeDragCategory.complemento}` : ''}
                            </div>
                          )}
                          {!activeDragCategory.raca && activeDragCategory.complemento && (
                            <div className="text-[10px] text-gray-500 font-medium mt-0.5">
                              {activeDragCategory.complemento}
                            </div>
                          )}
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
                        <td className="px-4 py-3" />
                      </tr>
                    </tbody>
                  </table>
                ) : null}
              </DragOverlay>
            </DndContext>
            <tfoot>
              <tr className="border-t border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280]">
                <td colSpan={6} className="px-4 py-3 text-xs font-semibold leading-relaxed">
                  Total: {categories.length} {categories.length === 1 ? 'categoria cadastrada' : 'categorias cadastradas'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Create/Edit Modal ──────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="rounded-xl shadow-2xl w-full max-w-3xl border border-[#E5E7EB] bg-white text-[#0F172A] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-[#22C55E] tracking-widest uppercase block">
                  REGISTRO
                </span>
                <h3 className="text-lg font-black tracking-tight text-[#0F172A]">
                  {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg transition-colors hover:bg-gray-100 text-gray-400 hover:text-[#0F172A]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Descrição + Raça + Complemento lado a lado */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-2 text-[#6B7280]">
                    Raça
                  </label>
                  <select
                    value={form.raca}
                    onChange={(e) => setForm((f) => ({ ...f, raca: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-[#E5E7EB] bg-white text-[#0F172A] rounded-lg text-sm focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/20 outline-none transition-all"
                  >
                    <option value="">Selecione...</option>
                    <option value="Nelore">Nelore</option>
                    <option value="Anelorado">Anelorado</option>
                    <option value="Brangus">Brangus</option>
                    <option value="Angus">Angus</option>
                    <option value="Senepol">Senepol</option>
                    <option value="Cruzado">Cruzado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-2 text-[#6B7280]">
                    Complemento
                  </label>
                  <input
                    type="text"
                    value={form.complemento}
                    onChange={(e) => setForm((f) => ({ ...f, complemento: e.target.value }))}
                    placeholder="Informações adicionais sobre a categoria"
                    className="w-full px-3 py-2.5 border border-[#E5E7EB] bg-white text-[#0F172A] rounded-lg text-sm focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/20 outline-none transition-all placeholder-gray-400"
                  />
                </div>
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
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E5E7EB] bg-gray-50">
              <button
                type="button"
                onClick={closeModal}
                className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-200 text-gray-500 hover:text-[#0F172A] hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!form.nome.trim() || saving}
                className="px-6 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-300 flex items-center gap-2 bg-[#16A34A] hover:bg-[#15803D] text-white shadow-[0_1px_3px_rgba(16,24,40,0.08)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editingCategory ? 'Salvar Alterações' : 'Criar Categoria'}
              </button>
            </div>
          </div>
        </div>
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
