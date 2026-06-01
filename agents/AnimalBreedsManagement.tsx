import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  ArrowLeft,
  Edit2,
  Trash2,
  GripVertical,
  Loader2,
  X,
  Dna,
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

interface FormState {
  nome: string;
  ativo: boolean;
}

const EMPTY_FORM: FormState = {
  nome: '',
  ativo: true,
};

// ── Sortable Row ──────────────────────────────────────────────────────────────

interface SortableRowProps {
  breed: AnimalBreed;
  onEdit: (b: AnimalBreed) => void;
  onDelete: (id: string) => void;
}

const SortableRow: React.FC<SortableRowProps> = ({ breed, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: breed.id,
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
        <div className="font-bold">{breed.nome}</div>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
            breed.ativo
              ? 'bg-[#DCFCE7] text-[#15803D]'
              : 'bg-[#F3F4F6] text-[#6B7280]'
          }`}
        >
          {breed.ativo ? 'Ativa' : 'Inativa'}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onEdit(breed)}
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
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBreed, setEditingBreed] = useState<AnimalBreed | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [activeId, setActiveId] = useState<string | null>(null);

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

  // ── Form helpers ──────────────────────────────────────────────────────────

  const openCreateModal = () => {
    setEditingBreed(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEditModal = (breed: AnimalBreed) => {
    setEditingBreed(breed);
    setForm({ nome: breed.nome, ativo: breed.ativo });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingBreed(null);
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.nome.trim()) return;
    setSaving(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        ativo: form.ativo,
      };

      if (editingBreed) {
        await updateAnimalBreed(editingBreed.id, payload);
        onToast?.('Raça atualizada com sucesso', 'success');
      } else {
        await createAnimalBreed({ ...payload, organizationId });
        onToast?.('Raça criada com sucesso', 'success');
      }
      closeModal();
      await loadBreeds();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar raça', 'error');
    } finally {
      setSaving(false);
    }
  };

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
          <Dna size={24} className="text-[#16A34A]" />
          <div>
            <span className="text-[11px] font-bold text-[#22C55E] tracking-widest uppercase block mb-0.5">
              CADASTRO DE
            </span>
            <h2 className="text-2xl font-black tracking-tight text-[#0F172A]">Raças</h2>
            <p className="text-sm text-gray-500">
              Cadastre as raças usadas nos nascimentos e nas categorias de animais
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
            Nova Raça
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : breeds.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-2xl p-12 shadow-md text-gray-400 border-gray-200 bg-white">
          <Dna size={48} className="mx-auto mb-4 opacity-30 text-[#16A34A]" />
          <p className="text-sm font-semibold text-[#0F172A]">Nenhuma raça cadastrada.</p>
          <p className="text-xs mt-1 opacity-70">Clique em "+ Nova Raça" para começar.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#E5E7EB] bg-white overflow-hidden shadow-[0_1px_3px_rgba(16,24,40,0.08)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280] text-[11px] uppercase tracking-wider font-bold">
                <th className="w-10" />
                <th className="px-4 py-3.5 text-left">Raça</th>
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
                      onEdit={openEditModal}
                      onDelete={(id) => setDeleteConfirmId(id)}
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
            <tfoot>
              <tr className="border-t border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280]">
                <td colSpan={4} className="px-4 py-3 text-xs font-semibold leading-relaxed">
                  Total: {breeds.length} {breeds.length === 1 ? 'raça cadastrada' : 'raças cadastradas'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Create/Edit Modal ──────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="rounded-xl shadow-2xl w-full max-w-md border border-[#E5E7EB] bg-white text-[#0F172A] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-[#22C55E] tracking-widest uppercase block">
                  REGISTRO
                </span>
                <h3 className="text-lg font-black tracking-tight text-[#0F172A]">
                  {editingBreed ? 'Editar Raça' : 'Nova Raça'}
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
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-2 text-[#6B7280]">
                  Nome da Raça <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && form.nome.trim() && !saving) handleSave();
                  }}
                  placeholder="Ex: Nelore, Angus, Brangus..."
                  className="w-full px-3 py-2.5 border border-[#E5E7EB] bg-white text-[#0F172A] rounded-lg text-sm focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/20 outline-none transition-all placeholder-gray-400"
                />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
                  className="w-4 h-4 rounded text-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/20"
                />
                <span className="text-sm font-semibold text-[#0F172A]">Raça ativa</span>
                <span className="text-xs text-gray-400">(aparece nas listas de seleção)</span>
              </label>
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
                {editingBreed ? 'Salvar Alterações' : 'Criar Raça'}
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
