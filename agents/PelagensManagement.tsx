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
  Image as ImageIcon,
  Pencil,
  X,
} from 'lucide-react';
import {
  storageUpload,
  storageGetPublicUrl,
  storageResolveUrl,
} from '../lib/storage';
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
  listPelagens,
  createPelagem,
  updatePelagem,
  deletePelagem,
  reorderPelagens,
  type Pelagem,
} from '../lib/api/pelagensClient';
import { PelagemIcon } from '../components/icons/PelagemIcon';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EditImageItem {
  id: string;
  type: 'existing' | 'new';
  url: string;
  originalUrl?: string;
  file?: File;
}

interface Props {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onBack?: () => void;
  theme?: 'light' | 'dark';
}

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
  pelagem: Pelagem;
  selected: boolean;
  menuOpen: boolean;
  onSelect: (p: Pelagem) => void;
  onMenu: (e: React.MouseEvent, id: string) => void;
}

const SortableRow: React.FC<SortableRowProps> = ({ pelagem, selected, menuOpen, onSelect, onMenu }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pelagem.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getSituacaoLabel = (bovino: boolean, equideo: boolean) => {
    if (bovino && equideo) return 'Ambos';
    if (bovino) return 'Bovino';
    if (equideo) return 'Equídeo';
    return 'Nenhum';
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(pelagem)}
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
      <td className={`p-3 font-semibold ${selected ? 'text-[#16a34a]' : 'text-gray-800'}`}>
        <div className="flex items-center gap-2">
          {pelagem.imagens && pelagem.imagens.length > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-[#e7f6ec] text-[#16a34a]" title="Possui imagens">
              <ImageIcon size={12} />
            </span>
          )}
          <span>{pelagem.descricao}</span>
        </div>
      </td>
      <td className="p-3">
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
          (pelagem.bovino && pelagem.equideo)
            ? 'bg-[#E0F2FE] text-[#0369A1]' // Blue for Ambos
            : pelagem.bovino
              ? 'bg-[#DCFCE7] text-[#15803D]' // Green for Bovino
              : 'bg-[#FEF3C7] text-[#D97706]' // Yellow/Amber for Equideo
        }`}>
          {getSituacaoLabel(pelagem.bovino, pelagem.equideo)}
        </span>
      </td>
      <td className="p-3 text-center">
        <button
          type="button"
          onClick={(e) => onMenu(e, pelagem.id)}
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

const PelagensManagement: React.FC<Props> = ({ onToast, onBack }) => {
  const { user } = useAuth();
  const { selectedClient } = useClient();

  const organizationId = selectedClient?.id ?? user?.organizationId ?? '';

  const [pelagens, setPelagens] = useState<Pelagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  // Abas Lançamentos / Registros
  const [aba, setAba] = useState<'lancar' | 'registros'>('lancar');

  // Entrada da aba Lançamentos
  const [descricao, setDescricao] = useState('');
  const [bovino, setBovino] = useState(false);
  const [equideo, setEquideo] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const descricaoRef = useRef<HTMLInputElement>(null);

  // Detalhamento editável (aba Registros)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = pelagens.find((p) => p.id === selectedId) || null;
  const [editDescricao, setEditDescricao] = useState('');
  const [editBovino, setEditBovino] = useState(false);
  const [editEquideo, setEditEquideo] = useState(false);
  const [editObservacao, setEditObservacao] = useState('');
  const [editImages, setEditImages] = useState<EditImageItem[]>([]);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Modo de visualização/edição no detalhamento
  const [modo, setModo] = useState<'visualizar' | 'editar'>('visualizar');
  const [activeLightboxUrl, setActiveLightboxUrl] = useState<string | null>(null);

  // Cleanup object URLs on unmount
  const imagePreviewsRef = useRef<string[]>([]);
  imagePreviewsRef.current = imagePreviews;

  const editImagesRef = useRef<EditImageItem[]>([]);
  editImagesRef.current = editImages;

  useEffect(() => {
    return () => {
      imagePreviewsRef.current.forEach((url) => URL.revokeObjectURL(url));
      editImagesRef.current.forEach((img) => {
        if (img.type === 'new' && img.url.startsWith('blob:')) {
          URL.revokeObjectURL(img.url);
        }
      });
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleSelectPelagem = useCallback((p: Pelagem) => {
    setSelectedId(p.id);
    setModo('visualizar');
  }, []);

  const cancelarEdicao = useCallback(async () => {
    if (selected) {
      setEditDescricao(selected.descricao);
      setEditBovino(selected.bovino);
      setEditEquideo(selected.equideo);
      setEditObservacao(selected.observacao ?? '');
      
      // Clean up previous new previews
      editImages.forEach(img => {
        if (img.type === 'new' && img.url.startsWith('blob:')) {
          URL.revokeObjectURL(img.url);
        }
      });

      // Load and resolve existing B2 images
      const list = selected.imagens || [];
      const items: EditImageItem[] = await Promise.all(
        list.map(async (url, idx) => {
          try {
            const resolved = await storageResolveUrl(url);
            return {
              id: `existing-${idx}-${url}`,
              type: 'existing',
              url: resolved,
              originalUrl: url,
            };
          } catch {
            return {
              id: `existing-${idx}-${url}`,
              type: 'existing',
              url: url,
              originalUrl: url,
            };
          }
        })
      );
      setEditImages(items);
    }
    setModo('visualizar');
  }, [selected, editImages]);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadPelagens = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const rows = await listPelagens(organizationId);
      setPelagens(rows);
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao carregar pelagens', 'error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, onToast]);

  useEffect(() => {
    loadPelagens();
  }, [loadPelagens]);

  // Auto-seleciona a primeira pelagem e mantém a seleção válida quando a lista muda.
  useEffect(() => {
    setSelectedId((prev) => {
      if (prev && pelagens.some((p) => p.id === prev)) return prev;
      return pelagens[0]?.id ?? null;
    });
  }, [pelagens]);

  useEffect(() => {
    if (selected) {
      setEditDescricao(selected.descricao);
      setEditBovino(selected.bovino);
      setEditEquideo(selected.equideo);
      setEditObservacao(selected.observacao ?? '');
      
      // Clean up previous new previews
      editImages.forEach(img => {
        if (img.type === 'new' && img.url.startsWith('blob:')) {
          URL.revokeObjectURL(img.url);
        }
      });

      // Load and resolve existing B2 images
      let cancelled = false;
      const loadImages = async () => {
        const list = selected.imagens || [];
        const items: EditImageItem[] = await Promise.all(
          list.map(async (url, idx) => {
            try {
              const resolved = await storageResolveUrl(url);
              return {
                id: `existing-${idx}-${url}`,
                type: 'existing',
                url: resolved,
                originalUrl: url,
              };
            } catch {
              return {
                id: `existing-${idx}-${url}`,
                type: 'existing',
                url: url,
                originalUrl: url,
              };
            }
          })
        );
        if (!cancelled) {
          setEditImages(items);
        }
      };
      loadImages();
      return () => {
        cancelled = true;
      };
    } else {
      setEditImages([]);
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Image Handling ────────────────────────────────────────────────────────
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    const currentCount = imageFiles.length;
    const allowedCount = 3 - currentCount;
    if (allowedCount <= 0) {
      onToast?.('Você já adicionou o limite de 3 imagens.', 'warning');
      return;
    }

    const validFiles: File[] = [];
    const newPreviews: string[] = [];

    for (const file of files.slice(0, allowedCount)) {
      if (file.size > 5 * 1024 * 1024) {
        onToast?.(`A imagem "${file.name}" excede o tamanho máximo de 5MB.`, 'error');
        continue;
      }
      validFiles.push(file);
      newPreviews.push(URL.createObjectURL(file));
    }

    if (validFiles.length > 0) {
      setImageFiles((prev) => [...prev, ...validFiles]);
      setImagePreviews((prev) => [...prev, ...newPreviews]);
    }
    e.target.value = '';
  };

  const handleRemoveImageFile = (index: number) => {
    URL.revokeObjectURL(imagePreviews[index]);
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEditImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    const currentCount = editImages.length;
    const allowedCount = 3 - currentCount;
    if (allowedCount <= 0) {
      onToast?.('Você já adicionou o limite de 3 imagens.', 'warning');
      return;
    }

    const newItems: EditImageItem[] = [];
    for (const file of files.slice(0, allowedCount)) {
      if (file.size > 5 * 1024 * 1024) {
        onToast?.(`A imagem "${file.name}" excede o tamanho máximo de 5MB.`, 'error');
        continue;
      }
      const blobUrl = URL.createObjectURL(file);
      newItems.push({
        id: `new-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        type: 'new',
        url: blobUrl,
        file: file,
      });
    }

    if (newItems.length > 0) {
      setEditImages((prev) => [...prev, ...newItems]);
    }
    e.target.value = '';
  };

  const handleRemoveEditImage = (id: string) => {
    const item = editImages.find((img) => img.id === id);
    if (item?.type === 'new' && item.url.startsWith('blob:')) {
      URL.revokeObjectURL(item.url);
    }
    setEditImages((prev) => prev.filter((img) => img.id !== id));
  };

  // ── Lançamento ──────────────────────────────────────────────────────────────

  const cancelLancamento = useCallback(() => {
    setDescricao('');
    setBovino(false);
    setEquideo(false);
    setObservacao('');
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setImageFiles([]);
    setImagePreviews([]);
  }, [imagePreviews]);

  const salvar = useCallback(async () => {
    const clean = toSentenceCase(descricao);
    if (!clean) {
      onToast?.('Informe a descrição da pelagem', 'error');
      return;
    }
    if (!bovino && !equideo) {
      onToast?.('Selecione pelo menos Bovino ou Equídeo', 'error');
      return;
    }
    const lower = clean.toLowerCase();
    if (pelagens.some((p) => p.descricao.trim().toLowerCase() === lower)) {
      onToast?.('Esta pelagem já está cadastrada', 'warning');
      return;
    }
    setSaving(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of imageFiles) {
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${organizationId}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
        await storageUpload('pelagens-photos', path, file, { contentType: file.type });
        const url = storageGetPublicUrl('pelagens-photos', path);
        uploadedUrls.push(url);
      }

      await createPelagem({
        descricao: clean,
        bovino,
        equideo,
        observacao: observacao.trim() || null,
        imagens: uploadedUrls,
        organizationId,
      });
      onToast?.('Pelagem salva com sucesso', 'success');
      setDescricao('');
      setBovino(false);
      setEquideo(false);
      setObservacao('');
      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
      setImageFiles([]);
      setImagePreviews([]);
      await loadPelagens();
      setAba('registros');
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar pelagem', 'error');
    } finally {
      setSaving(false);
    }
  }, [descricao, bovino, equideo, observacao, imageFiles, imagePreviews, organizationId, pelagens, onToast, loadPelagens]);

  // ── Edição (detalhamento da aba Registros) ──────────────────────────────────

  const salvarDetalhe = useCallback(async () => {
    if (!selectedId) return;
    const clean = toSentenceCase(editDescricao);
    if (!clean) {
      onToast?.('Informe a descrição da pelagem', 'error');
      return;
    }
    if (!editBovino && !editEquideo) {
      onToast?.('Selecione pelo menos Bovino ou Equídeo', 'error');
      return;
    }
    setSaving(true);
    try {
      const finalUrls: string[] = [];
      for (const item of editImages) {
        if (item.type === 'existing' && item.originalUrl) {
          finalUrls.push(item.originalUrl);
        } else if (item.type === 'new' && item.file) {
          const ext = item.file.name.split('.').pop() || 'jpg';
          const path = `${organizationId}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
          await storageUpload('pelagens-photos', path, item.file, { contentType: item.file.type });
          const url = storageGetPublicUrl('pelagens-photos', path);
          finalUrls.push(url);
        }
      }

      await updatePelagem(selectedId, {
        descricao: clean,
        bovino: editBovino,
        equideo: editEquideo,
        observacao: editObservacao.trim() || null,
        imagens: finalUrls,
      });
      onToast?.('Pelagem atualizada com sucesso', 'success');
      await loadPelagens();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar pelagem', 'error');
    } finally {
      setSaving(false);
    }
  }, [selectedId, editDescricao, editBovino, editEquideo, editObservacao, editImages, organizationId, onToast, loadPelagens]);

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deletePelagem(deleteConfirmId);
      onToast?.('Pelagem removida', 'success');
      setDeleteConfirmId(null);
      await loadPelagens();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao excluir pelagem', 'error');
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

      const oldIndex = pelagens.findIndex((p) => p.id === String(active.id));
      const newIndex = pelagens.findIndex((p) => p.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = [...pelagens];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      setPelagens(reordered);

      const items = reordered.map((p, i) => ({ id: p.id, ordem: i }));
      try {
        await reorderPelagens(items);
      } catch (err: any) {
        onToast?.(err.message || 'Erro ao reordenar', 'error');
        await loadPelagens();
      }
    },
    [pelagens, onToast, loadPelagens],
  );

  const sortableIds = pelagens.map((p) => p.id);
  const activeDragPelagem = activeId ? pelagens.find((p) => p.id === activeId) : null;

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
        Selecione uma organização para gerenciar as pelagens.
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
            title="Pelagens"
            right={
              <TabSwitch
                tabs={[
                  { id: 'lancar', label: 'Lançamentos', icon: <Plus size={16} /> },
                  { id: 'registros', label: 'Registros', icon: <List size={16} />, badge: pelagens.length },
                ]}
                value={aba}
                onChange={(id) => setAba(id as 'lancar' | 'registros')}
              />
            }
          />
        </div>
      </div>

      {aba === 'lancar' ? (
        /* ── Aba Lançamentos: cadastro direto de uma pelagem ─────────────────── */
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
              placeholder="Ex: Alazã, Castanha, Branca..."
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-2 block text-[12.5px] font-semibold text-gray-700">
              Espécies Aplicáveis <span className="text-[#DC2626]">*</span>
            </label>
            <div className="flex gap-6 my-1">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={bovino}
                  onChange={(e) => setBovino(e.target.checked)}
                  className="h-4.5 w-4.5 rounded border-gray-300 text-[#16a34a] focus:ring-[#16a34a]"
                />
                Bovino
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={equideo}
                  onChange={(e) => setEquideo(e.target.checked)}
                  className="h-4.5 w-4.5 rounded border-gray-300 text-[#16a34a] focus:ring-[#16a34a]"
                />
                Equídeo
              </label>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">Observação</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Explique detalhes da pelagem (opcional)"
              rows={2}
              className={textareaCls}
            />
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-gray-700 flex justify-between">
              <span>Imagens Representativas (até 3 imagens)</span>
              <span className="text-[11px] text-gray-400 font-normal">Máx. 5MB por imagem</span>
            </label>
            <div className="flex flex-wrap gap-3 mt-1.5 items-center">
              {imagePreviews.map((url, idx) => (
                <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-100 group shadow-sm bg-gray-50">
                  <img
                    src={url}
                    alt="Pelagem preview"
                    className="w-full h-full object-cover cursor-zoom-in"
                    onClick={() => setActiveLightboxUrl(url)}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveImageFile(idx)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 hover:bg-black/85 flex items-center justify-center rounded-full text-white opacity-0 group-hover:opacity-100 transition-all shadow-md"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}

              {imageFiles.length < 3 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center w-20 h-20 rounded-xl border border-dashed border-gray-300 hover:border-[#16a34a] hover:bg-[#e7f6ec]/30 transition-all text-gray-400 hover:text-[#16a34a]"
                >
                  <Plus size={20} />
                  <span className="text-[10px] mt-1 font-semibold">Adicionar</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageChange}
              className="hidden"
            />
          </div>

          <FormActions
            onCancel={cancelLancamento}
            onSave={salvar}
            saveDisabled={!descricao.trim() || (!bovino && !equideo) || saving}
            saveIcon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}
          />
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : pelagens.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-2xl p-12 shadow-md text-gray-400 border-gray-200 bg-white">
          <PelagemIcon size={48} className="mx-auto mb-4 opacity-30 text-[#16A34A]" />
          <p className="text-sm font-semibold text-[#0F172A]">Nenhuma pelagem cadastrada.</p>
          <p className="text-xs mt-1 opacity-70">Use a aba "Lançamentos" para começar.</p>
        </div>
      ) : (
        /* ── Aba Registros: master-detail (50% lista · 50% observações) ──────── */
        <>
        <div className="mb-4">
          <h2 className="text-[17px] font-bold text-gray-900">Todas as pelagens — Pelagens</h2>
          <p className="mt-0.5 text-[12.5px] text-gray-500">
            Clique em uma pelagem para abri-la; use ••• para ver ou excluir.
          </p>
        </div>
        <div
          ref={splitRef}
          className="flex h-[calc(100vh-240px)] min-h-[440px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white"
        >
          {/* Master: relação de pelagens */}
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
                    <th className="p-3 font-bold">Pelagem</th>
                    <th className="p-3 font-bold">Situações</th>
                    <th className="p-3 text-center font-bold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                    {pelagens.map((pelagem) => (
                      <SortableRow
                        key={pelagem.id}
                        pelagem={pelagem}
                        selected={selectedId === pelagem.id}
                        menuOpen={menu?.id === pelagem.id}
                        onSelect={handleSelectPelagem}
                        onMenu={toggleMenu}
                      />
                    ))}
                  </SortableContext>
                </tbody>
              </table>
              <DragOverlay dropAnimation={null}>
                {activeDragPelagem ? (
                  <div className="flex items-center gap-3 rounded border border-[#E5E7EB] bg-white px-4 py-3 shadow-2xl">
                    <GripVertical size={16} className="text-[#16A34A]" />
                    <span className="truncate font-bold text-[#0F172A]">{activeDragPelagem.descricao}</span>
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
            title="Arraste para ajustar o espaço da lista e das observações"
          >
            <span className="h-1 w-10 rounded-full bg-gray-300 transition-colors group-hover:bg-[#16a34a]" />
          </div>

          {/* Detail: observações da pelagem selecionada */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#fafbfc]">
            {selected ? (
              modo === 'visualizar' ? (
                /* ── View Mode ─────────────────────────────────────────────────── */
                <div className="flex flex-1 flex-col gap-4 p-5 animate-in fade-in duration-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-base font-bold text-gray-900 leading-tight">{selected.descricao}</h3>
                      <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-gray-500">
                        <span>Espécies Aplicáveis:</span>
                        <div className="flex gap-1.5">
                          {selected.bovino && (
                            <span className="px-2 py-0.5 rounded bg-green-55 text-green-700 border border-green-100 text-[10px] font-bold uppercase">Bovino</span>
                          )}
                          {selected.equideo && (
                            <span className="px-2 py-0.5 rounded bg-amber-55 text-amber-700 border border-amber-100 text-[10px] font-bold uppercase">Equídeo</span>
                          )}
                          {!selected.bovino && !selected.equideo && (
                            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-bold uppercase">Nenhuma</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModo('editar')}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-xs font-bold text-gray-700 shadow-sm hover:bg-gray-50 hover:text-[#16a34a] hover:border-[#16a34a] transition-all"
                    >
                      <Pencil size={13} className="text-[#16a34a]" />
                      Editar
                    </button>
                  </div>

                  {selected.observacao && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Observações</span>
                      <p className="text-sm text-gray-800 bg-white rounded-xl p-3.5 border border-gray-100 leading-relaxed shadow-sm whitespace-pre-wrap">
                        {selected.observacao}
                      </p>
                    </div>
                  )}

                  {editImages.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Imagens Representativas</span>
                      <div className="flex flex-wrap gap-3 mt-0.5">
                        {editImages.map((img) => (
                          <div
                            key={img.id}
                            onClick={() => setActiveLightboxUrl(img.url)}
                            className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-100 group shadow-sm bg-gray-50 cursor-zoom-in transition-transform hover:scale-[1.03]"
                          >
                            <img src={img.url} alt={selected.descricao} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Eye size={18} className="text-white" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ── Edit Mode ─────────────────────────────────────────────────── */
                <div className="flex flex-1 flex-col gap-4 p-5 animate-in fade-in duration-200">
                  <div className="flex justify-between items-start border-b border-gray-100 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-gray-900 leading-tight">Editar Pelagem</h3>
                      <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-gray-500">
                        <span className="text-gray-800 font-bold">{selected.descricao}</span>
                        <span className="text-gray-300">|</span>
                        <div className="flex gap-1.5">
                          {selected.bovino && (
                            <span className="px-2 py-0.5 rounded bg-green-55 text-green-700 border border-green-100 text-[10px] font-bold uppercase">Bovino</span>
                          )}
                          {selected.equideo && (
                            <span className="px-2 py-0.5 rounded bg-amber-55 text-amber-700 border border-amber-100 text-[10px] font-bold uppercase">Equídeo</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[12.5px] font-semibold text-gray-700">Observações</label>
                    <textarea
                      value={editObservacao}
                      onChange={(e) => setEditObservacao(e.target.value)}
                      placeholder="Explique detalhes da pelagem (opcional)"
                      className={`${textareaCls} min-h-[60px]`}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[12.5px] font-semibold text-gray-700 flex justify-between">
                      <span>Imagens Representativas (até 3 imagens)</span>
                      <span className="text-[11px] text-gray-400 font-normal">Máx. 5MB por imagem</span>
                    </label>
                    <div className="flex flex-wrap gap-3 mt-1.5 items-center">
                      {editImages.map((img) => (
                        <div key={img.id} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-100 group shadow-sm bg-gray-50">
                          <img
                            src={img.url}
                            alt="Pelagem"
                            className="w-full h-full object-cover cursor-zoom-in"
                            onClick={() => setActiveLightboxUrl(img.url)}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveEditImage(img.id)}
                            className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 hover:bg-black/85 flex items-center justify-center rounded-full text-white opacity-0 group-hover:opacity-100 transition-all shadow-md"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}

                      {editImages.length < 3 && (
                        <button
                          type="button"
                          onClick={() => editFileInputRef.current?.click()}
                          className="flex flex-col items-center justify-center w-20 h-20 rounded-xl border border-dashed border-gray-300 hover:border-[#16a34a] hover:bg-[#e7f6ec]/30 transition-all text-gray-400 hover:text-[#16a34a]"
                        >
                          <Plus size={20} />
                          <span className="text-[10px] mt-1 font-semibold">Adicionar</span>
                        </button>
                      )}
                    </div>
                    <input
                      ref={editFileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleEditImageChange}
                      className="hidden"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    <button
                      type="button"
                      onClick={cancelarEdicao}
                      className="px-4 h-10 text-sm font-semibold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await salvarDetalhe();
                        setModo('visualizar');
                      }}
                      disabled={saving}
                      className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-[#16a34a] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#15803d] disabled:cursor-not-allowed disabled:bg-[#86cfa4]"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      Salvar alterações
                    </button>
                  </div>
                </div>
              )
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-center text-sm text-gray-400">
                Selecione um registro acima para ver os detalhes.
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
                setModo('visualizar');
                closeMenu();
              }}
            />
            <MenuItem
              icon={<Pencil size={15} />}
              label="Editar"
              onClick={() => {
                setSelectedId(menu.id);
                setModo('editar');
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
              Tem certeza que deseja remover esta pelagem? Esta ação não poderá ser desfeita.
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

      {/* Lightbox Modal */}
      {activeLightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200 cursor-zoom-out"
          onClick={() => setActiveLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors p-2 bg-black/40 hover:bg-black/60 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              setActiveLightboxUrl(null);
            }}
          >
            <X size={24} />
          </button>
          <div className="relative max-h-[90vh] max-w-[90vw] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={activeLightboxUrl}
              alt="Pelagem ampliada"
              className="max-h-[85vh] max-w-[85vw] object-contain rounded-lg shadow-2xl border border-white/10 animate-in zoom-in-95 duration-150"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PelagensManagement;
