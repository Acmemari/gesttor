import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  ArrowLeft,
  Edit2,
  Trash2,
  GripVertical,
  Loader2,
  X,
  Beef,
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
}

interface FormState {
  nome: string;
  complemento: string;
  grupo: string;
  sexo: string;
  idadeFaixa: string;
  pesoKg: string;
}

const EMPTY_FORM: FormState = {
  nome: '',
  complemento: '',
  grupo: 'outros',
  sexo: 'macho',
  idadeFaixa: 'ate_12',
  pesoKg: '',
};

// ── Sortable Row ──────────────────────────────────────────────────────────────

const SortableRow: React.FC<{
  category: AnimalCategory;
  onEdit: (c: AnimalCategory) => void;
  onDelete: (id: string) => void;
}> = ({ category, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-3 w-8">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
      </td>
      <td className="px-4 py-3 font-medium text-gray-900">{category.nome}</td>
      <td className="px-4 py-3">
        <span
          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            category.sexo === 'femea'
              ? 'bg-pink-100 text-pink-700'
              : 'bg-blue-100 text-blue-700'
          }`}
        >
          {category.sexo === 'femea' ? 'Fêmea' : 'Macho'}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-600">{GRUPO_LABELS[category.grupo] ?? category.grupo}</td>
      <td className="px-4 py-3 text-right text-gray-600">
        {category.pesoKg ? `${parseFloat(category.pesoKg).toFixed(1)} kg` : '—'}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onEdit(category)}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-100"
          >
            <Edit2 size={15} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(category.id)}
            className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50"
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
      <div className="p-8 text-gray-500">
        Selecione uma organização para gerenciar categorias de animais.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="flex items-center gap-3">
          <Beef size={24} className="text-gray-400" />
          <div>
            <h2 className="text-xl font-bold text-gray-900">Categorias de Animais</h2>
            <p className="text-sm text-gray-500">
              Defina as categorias do seu rebanho com pesos e valores de mercado
            </p>
          </div>
        </div>
        <div className="ml-auto">
          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
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
        <div className="text-center py-16 text-gray-400">
          <Beef size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-sm">Nenhuma categoria cadastrada.</p>
          <p className="text-xs mt-1">Clique em "+ Nova Categoria" para começar.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="w-8" />
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Categoria</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Sexo</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Grupo</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Peso (kg)</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Ações</th>
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
                    />
                  ))}
                </tbody>
              </SortableContext>
              <DragOverlay dropAnimation={null}>
                {activeDragCategory ? (
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="bg-white shadow-lg rounded border border-gray-200">
                        <td className="px-3 py-3 w-8">
                          <GripVertical size={16} className="text-gray-400" />
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{activeDragCategory.nome}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              activeDragCategory.sexo === 'femea'
                                ? 'bg-pink-100 text-pink-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {activeDragCategory.sexo === 'femea' ? 'Fêmea' : 'Macho'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {GRUPO_LABELS[activeDragCategory.grupo] ?? activeDragCategory.grupo}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
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
              <tr className="border-t border-gray-200 bg-gray-50">
                <td colSpan={6} className="px-4 py-2 text-xs text-gray-500 font-medium">
                  Total: {categories.length} {categories.length === 1 ? 'categoria' : 'categorias'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Create/Edit Modal ──────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">
                {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Descrição + Complemento lado a lado */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Descrição <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.nome}
                    onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                    placeholder="Ex: Bezerro Desmamado, Novilha..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-gray-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Complemento
                  </label>
                  <input
                    type="text"
                    value={form.complemento}
                    onChange={(e) => setForm((f) => ({ ...f, complemento: e.target.value }))}
                    placeholder="Informações adicionais sobre a categoria"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-gray-900 outline-none"
                  />
                </div>
              </div>

              {/* Grupo */}
              <div className="border border-gray-200 rounded-xl p-3">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Grupo</label>
                <div className="flex flex-wrap gap-1.5">
                  {GRUPO_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleGrupoChange(opt.value)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        form.grupo === opt.value
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Peso Médio + Sexo + Idade em linha */}
              <div className="grid grid-cols-3 gap-4">
                {/* Peso */}
                <div className="border border-gray-200 rounded-xl p-3">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-gray-900 outline-none"
                    />
                    <span className="text-sm text-gray-500">kg</span>
                  </div>
                </div>

                {/* Sexo */}
                <div className="border border-gray-200 rounded-xl p-3">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Sexo</label>
                  {isSexoLocked(form.grupo) ? (
                    <p className="text-sm text-gray-500">
                      ✓ {getAutoSexo(form.grupo) === 'femea' ? 'Fêmea' : 'Macho'} (automático)
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {(['macho', 'femea'] as const).map((s) => (
                        <label key={s} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="sexo"
                            checked={form.sexo === s}
                            onChange={() => setForm((f) => ({ ...f, sexo: s }))}
                            className="w-4 h-4 text-gray-900 focus:ring-gray-900"
                          />
                          <span className="text-sm text-gray-700">
                            {s === 'femea' ? 'Fêmea' : 'Macho'}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Idade */}
                <div className="border border-gray-200 rounded-xl p-3">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Idade</label>
                  <div className="space-y-1.5">
                    {IDADE_OPTIONS.map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="idadeFaixa"
                          checked={form.idadeFaixa === opt.value}
                          onChange={() => setForm((f) => ({ ...f, idadeFaixa: opt.value }))}
                          className="w-4 h-4 text-gray-900 focus:ring-gray-900"
                        />
                        <span className="text-sm text-gray-700">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-100">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!form.nome.trim() || saving}
                className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Confirmar Exclusão</h3>
            <p className="text-sm text-gray-600 mb-6">
              Tem certeza que deseja remover esta categoria? Esta ação não pode ser desfeita.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
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
