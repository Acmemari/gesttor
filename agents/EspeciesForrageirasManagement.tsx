import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  List,
  ArrowLeft,
  Edit2,
  Trash2,
  GripVertical,
  Loader2,
  Info,
  Sprout,
  Leaf,
  Ruler,
  ImagePlus,
  X,
  FileText,
  Infinity as InfinityIcon,
  Repeat,
  RefreshCw,
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
  listEspeciesForrageiras,
  createEspecieForrageira,
  updateEspecieForrageira,
  deleteEspecieForrageira,
  reorderEspeciesForrageiras,
  type EspecieForrageira,
  type AlturasPastejo,
} from '../lib/api/especiesForrageirasClient';

// ── Constants & helpers ─────────────────────────────────────────────────────────

const MAX_FOTOS = 6;

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
const labelCls = 'mb-1 block text-[12.5px] font-semibold text-gray-700';

/** Converte string de input em número finito ou null (aceita vírgula decimal). */
function numOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Valor de altura para preencher inputs (null → ''). */
function fmtNum(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : String(n);
}

/** Resumo da altura do contínuo (campo único; aceita dados legados min/max). */
function continuoText(c: AlturasPastejo['continuo']): string {
  if (!c) return '';
  if (c.ideal != null) return `${c.ideal} cm`;
  // Legado: faixa ideal mínima/máxima.
  if (c.idealMin != null && c.idealMax != null) return `${c.idealMin}–${c.idealMax} cm`;
  if (c.idealMin != null) return `≥ ${c.idealMin} cm`;
  if (c.idealMax != null) return `≤ ${c.idealMax} cm`;
  return '';
}

/** Resumo "entrada → saída cm" dos regimes rotacionado/rotatínuo. */
function entradaSaidaText(entrada: number | null | undefined, saida: number | null | undefined): string {
  if (entrada != null && saida != null) return `${entrada} → ${saida} cm`;
  if (entrada != null) return `entra ${entrada} cm`;
  if (saida != null) return `sai ${saida} cm`;
  return '';
}

/** Chips com os regimes que têm altura preenchida (para a tabela de Registros). */
function alturasChips(a: AlturasPastejo): { label: string; value: string }[] {
  const chips: { label: string; value: string }[] = [];
  const c = continuoText(a.continuo);
  if (c) chips.push({ label: 'Contínuo', value: c });
  const r = entradaSaidaText(a.rotacionado?.entrada, a.rotacionado?.saida);
  if (r) chips.push({ label: 'Rotacionado', value: r });
  const rt = entradaSaidaText(a.rotatinuo?.entrada, a.rotatinuo?.saida);
  if (rt) chips.push({ label: 'Rotatínuo', value: rt });
  return chips;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onBack?: () => void;
  theme?: 'light' | 'dark';
}

/** Item de imagem no formulário: foto já salva (existing) ou recém-adicionada (new). */
interface EditImageItem {
  id: string;
  type: 'existing' | 'new';
  url: string;          // URL exibível (signed para existing, blob: para new)
  originalUrl?: string; // URL persistida (apenas existing)
  file?: File;          // arquivo a subir (apenas new)
}

// ── Sortable Row (aba Registros) ───────────────────────────────────────────────

interface SortableRowProps {
  especie: EspecieForrageira;
  onEdit: (e: EspecieForrageira) => void;
  onDelete: (id: string) => void;
}

const SortableRow: React.FC<SortableRowProps> = ({ especie, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: especie.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const chips = alturasChips(especie.alturas || {});

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
        <div className="font-bold">{especie.nome}</div>
        {especie.nomeCientifico && (
          <div className="text-xs italic text-gray-500">{especie.nomeCientifico}</div>
        )}
      </td>
      <td className="px-4 py-3">
        {chips.length === 0 ? (
          <span className="text-gray-400">—</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((ch) => (
              <span
                key={ch.label}
                className="inline-flex items-center gap-1 rounded-full bg-[#F0FDF4] border border-[#bbf7d0] px-2 py-0.5 text-[11px] font-semibold text-[#15803D]"
              >
                <span className="opacity-70">{ch.label}:</span> {ch.value}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        {especie.imagens && especie.imagens.length > 0 ? (
          <span
            className="inline-flex items-center gap-1 rounded bg-[#e7f6ec] px-2 py-0.5 text-xs font-bold text-[#16a34a]"
            title={`${especie.imagens.length} foto(s)`}
          >
            <ImagePlus size={13} /> {especie.imagens.length}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onEdit(especie)}
            className="p-1.5 rounded-lg transition-all text-gray-400 hover:text-[#16A34A] hover:bg-[#E7F6EC]"
          >
            <Edit2 size={15} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(especie.id)}
            className="p-1.5 rounded-lg transition-all text-gray-400 hover:text-[#DC2626] hover:bg-red-50"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </td>
    </tr>
  );
};

// ── Bloco de um regime de pastejo (2 inputs numéricos) ──────────────────────────

interface RegimeBlockProps {
  icon: React.ReactNode;
  title: string;
  hint: string;
  leftLabel: string;
  leftValue: string;
  onLeft: (v: string) => void;
  /** Segundo campo (opcional). Sem ele, o bloco mostra um único campo de altura. */
  rightLabel?: string;
  rightValue?: string;
  onRight?: (v: string) => void;
}

/** Campo numérico de altura com sufixo "cm". */
const AlturaInput: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({
  label, value, onChange,
}) => (
  <div className="flex-1">
    <label className="mb-1 block text-[12px] font-medium text-gray-500">{label}</label>
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className={`${inputCls} pr-9`}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">cm</span>
    </div>
  </div>
);

const RegimeBlock: React.FC<RegimeBlockProps> = ({
  icon, title, hint, leftLabel, leftValue, onLeft, rightLabel, rightValue, onRight,
}) => (
  <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB]/50 p-4">
    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#15803d]">
      {icon} {title}
    </div>
    <p className="mb-3 text-[11px] text-gray-400">{hint}</p>
    <div className="flex flex-col gap-3 sm:flex-row">
      <AlturaInput label={leftLabel} value={leftValue} onChange={onLeft} />
      {onRight && (
        <AlturaInput label={rightLabel ?? ''} value={rightValue ?? ''} onChange={onRight} />
      )}
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

const EspeciesForrageirasManagement: React.FC<Props> = ({ onToast, onBack }) => {
  const { user } = useAuth();
  const { selectedClient } = useClient();
  const organizationId = selectedClient?.id ?? user?.organizationId ?? '';

  const [especies, setEspecies] = useState<EspecieForrageira[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [aba, setAba] = useState<'lancar' | 'registros'>('lancar');
  const [innerTab, setInnerTab] = useState<'dados' | 'descricao'>('dados');
  const [activeLightboxUrl, setActiveLightboxUrl] = useState<string | null>(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [nomeCientifico, setNomeCientifico] = useState('');
  const [descricao, setDescricao] = useState('');
  // Alturas de pastejo
  const [continuoAltura, setContinuoAltura] = useState('');
  const [rotEntrada, setRotEntrada] = useState('');
  const [rotSaida, setRotSaida] = useState('');
  const [rotatEntrada, setRotatEntrada] = useState('');
  const [rotatSaida, setRotatSaida] = useState('');
  // Fotos
  const [images, setImages] = useState<EditImageItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mantém referência viva das imagens para revogar blobs no unmount.
  const imagesRef = useRef<EditImageItem[]>([]);
  imagesRef.current = images;
  useEffect(() => {
    return () => {
      imagesRef.current.forEach((img) => {
        if (img.type === 'new' && img.url.startsWith('blob:')) URL.revokeObjectURL(img.url);
      });
    };
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const rows = await listEspeciesForrageiras(organizationId);
      setEspecies(rows);
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao carregar espécies forrageiras', 'error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, onToast]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Form helpers ────────────────────────────────────────────────────────────
  const limpar = useCallback(() => {
    setEditingId(null);
    setNome('');
    setNomeCientifico('');
    setDescricao('');
    setContinuoAltura('');
    setRotEntrada('');
    setRotSaida('');
    setRotatEntrada('');
    setRotatSaida('');
    setImages((prev) => {
      prev.forEach((img) => {
        if (img.type === 'new' && img.url.startsWith('blob:')) URL.revokeObjectURL(img.url);
      });
      return [];
    });
    setInnerTab('dados');
  }, []);

  const startEdit = useCallback((e: EspecieForrageira) => {
    setEditingId(e.id);
    setNome(e.nome);
    setNomeCientifico(e.nomeCientifico ?? '');
    setDescricao(e.descricao ?? '');
    const a = e.alturas || {};
    setContinuoAltura(fmtNum(a.continuo?.ideal ?? a.continuo?.idealMin));
    setRotEntrada(fmtNum(a.rotacionado?.entrada));
    setRotSaida(fmtNum(a.rotacionado?.saida));
    setRotatEntrada(fmtNum(a.rotatinuo?.entrada));
    setRotatSaida(fmtNum(a.rotatinuo?.saida));
    setInnerTab('dados');
    setAba('lancar');

    // Revoga blobs anteriores e resolve as fotos salvas (B2 → signed).
    setImages((prev) => {
      prev.forEach((img) => {
        if (img.type === 'new' && img.url.startsWith('blob:')) URL.revokeObjectURL(img.url);
      });
      return [];
    });
    (async () => {
      const items = await Promise.all(
        (e.imagens || []).map(async (url, idx) => {
          let display = url;
          try {
            display = await storageResolveUrl(url);
          } catch {
            /* mantém a url original se a assinatura falhar */
          }
          return { id: `existing-${idx}-${url}`, type: 'existing' as const, url: display, originalUrl: url };
        }),
      );
      setImages(items);
    })();
  }, []);

  // ── Fotos ─────────────────────────────────────────────────────────────────
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;

    const allowed = MAX_FOTOS - images.length;
    if (allowed <= 0) {
      onToast?.(`Você já adicionou o limite de ${MAX_FOTOS} fotos.`, 'warning');
      return;
    }
    const novos: EditImageItem[] = [];
    for (const file of files.slice(0, allowed)) {
      if (file.size > 5 * 1024 * 1024) {
        onToast?.(`A imagem "${file.name}" excede o tamanho máximo de 5MB.`, 'error');
        continue;
      }
      novos.push({
        id: `new-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        type: 'new',
        url: URL.createObjectURL(file),
        file,
      });
    }
    if (novos.length > 0) setImages((prev) => [...prev, ...novos]);
  };

  const handleRemoveImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target?.type === 'new' && target.url.startsWith('blob:')) URL.revokeObjectURL(target.url);
      return prev.filter((img) => img.id !== id);
    });
  };

  /** Sobe as fotos novas e devolve a lista final de URLs persistíveis (na ordem). */
  const resolveFinalImageUrls = async (): Promise<string[]> => {
    const urls: string[] = [];
    for (const img of images) {
      if (img.type === 'existing' && img.originalUrl) {
        urls.push(img.originalUrl);
      } else if (img.type === 'new' && img.file) {
        const ext = img.file.name.split('.').pop() || 'jpg';
        const path = `${organizationId}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
        await storageUpload('forrageiras-photos', path, img.file, { contentType: img.file.type });
        urls.push(storageGetPublicUrl('forrageiras-photos', path));
      }
    }
    return urls;
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const buildAlturas = (): AlturasPastejo => ({
    continuo: { ideal: numOrNull(continuoAltura) },
    rotacionado: { entrada: numOrNull(rotEntrada), saida: numOrNull(rotSaida) },
    rotatinuo: { entrada: numOrNull(rotatEntrada), saida: numOrNull(rotatSaida) },
  });

  const salvar = useCallback(async () => {
    const clean = nome.trim();
    if (!clean) {
      onToast?.('Informe o nome da espécie forrageira', 'error');
      setInnerTab('dados');
      return;
    }
    setSaving(true);
    try {
      const imagens = await resolveFinalImageUrls();
      const payload = {
        nome: clean,
        nomeCientifico: nomeCientifico.trim() || null,
        alturas: buildAlturas(),
        imagens,
        descricao: descricao.trim() || null,
      };
      if (editingId) {
        await updateEspecieForrageira(editingId, payload);
        onToast?.('Espécie forrageira atualizada com sucesso', 'success');
      } else {
        await createEspecieForrageira({ organizationId, ...payload });
        onToast?.('Espécie forrageira salva com sucesso', 'success');
      }
      limpar();
      await load();
      setAba('registros');
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar espécie forrageira', 'error');
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    nome, nomeCientifico, descricao, editingId, organizationId, images,
    continuoAltura, rotEntrada, rotSaida, rotatEntrada, rotatSaida,
    onToast, limpar, load,
  ]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteEspecieForrageira(deleteConfirmId);
      onToast?.('Espécie forrageira removida', 'success');
      if (editingId === deleteConfirmId) limpar();
      setDeleteConfirmId(null);
      await load();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao excluir espécie forrageira', 'error');
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

      const oldIndex = especies.findIndex((c) => c.id === String(active.id));
      const newIndex = especies.findIndex((c) => c.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = [...especies];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      setEspecies(reordered);

      try {
        await reorderEspeciesForrageiras(reordered.map((c, i) => ({ id: c.id, ordem: i })));
      } catch (err: any) {
        onToast?.(err.message || 'Erro ao reordenar', 'error');
        await load();
      }
    },
    [especies, onToast, load],
  );

  const sortableIds = especies.map((c) => c.id);
  const activeDragEspecie = activeId ? especies.find((c) => c.id === activeId) : null;
  const canSave = !!nome.trim() && !saving;

  // ── Render ────────────────────────────────────────────────────────────────
  if (!organizationId) {
    return (
      <div className="p-8 text-sm font-semibold text-gray-500">
        Selecione uma organização para gerenciar as espécies forrageiras.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 md:p-8 max-w-5xl mx-auto w-full min-h-screen animate-in fade-in duration-500">
      {/* Cabeçalho padrão */}
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
            title="Espécies Forrageiras"
            right={
              <TabSwitch
                tabs={[
                  { id: 'lancar', label: 'Lançamentos', icon: <Plus size={16} /> },
                  { id: 'registros', label: 'Registros', icon: <List size={16} />, badge: especies.length },
                ]}
                value={aba}
                onChange={(id) => setAba(id as 'lancar' | 'registros')}
              />
            }
          />
        </div>
      </div>

      {aba === 'lancar' ? (
        /* ── Aba Lançamentos ─────────────────────────────────────────────────── */
        <div className="flex flex-col gap-5 rounded-2xl border border-gray-200 bg-white p-5">
          {editingId && (
            <div className="flex items-center gap-2 rounded-lg border border-[#fcd9b6] bg-[#fff7ed] px-3 py-2 text-[13px] font-semibold text-[#ea580c]">
              <Info size={15} /> Editando uma espécie existente — altere os dados e clique em “Salvar alterações”.
            </div>
          )}

          {/* Abas internas: Dados / Descrição */}
          <TabSwitch
            tabs={[
              { id: 'dados', label: 'Dados', icon: <Leaf size={15} /> },
              { id: 'descricao', label: 'Descrição', icon: <FileText size={15} /> },
            ]}
            value={innerTab}
            onChange={(id) => setInnerTab(id as 'dados' | 'descricao')}
          />

          {innerTab === 'dados' ? (
            <>
              {/* Identificação */}
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex-1">
                  <label className={labelCls}>Nome <span className="text-[#DC2626]">*</span></label>
                  <input
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex.: Capim-marandu"
                    className={inputCls}
                  />
                </div>
                <div className="flex-1">
                  <label className={labelCls}>Nome científico</label>
                  <input
                    type="text"
                    value={nomeCientifico}
                    onChange={(e) => setNomeCientifico(e.target.value)}
                    placeholder="Ex.: Urochloa brizantha"
                    className={`${inputCls} italic`}
                  />
                </div>
              </div>

              {/* Alturas de pastejo */}
              <div>
                <div className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                  <Ruler size={13} className="text-[#16A34A]" /> Alturas de pastejo
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <RegimeBlock
                    icon={<InfinityIcon size={13} />}
                    title="Contínuo"
                    hint="Altura ideal a manter no pasto."
                    leftLabel="Altura de pastejo"
                    leftValue={continuoAltura}
                    onLeft={setContinuoAltura}
                  />
                  <RegimeBlock
                    icon={<Repeat size={13} />}
                    title="Rotacionado"
                    hint="Altura ao entrar e ao sair do piquete."
                    leftLabel="Altura de entrada"
                    rightLabel="Altura de saída"
                    leftValue={rotEntrada}
                    rightValue={rotSaida}
                    onLeft={setRotEntrada}
                    onRight={setRotSaida}
                  />
                  <RegimeBlock
                    icon={<RefreshCw size={13} />}
                    title="Rotatínuo"
                    hint="Altura ao entrar e ao sair do piquete."
                    leftLabel="Altura de entrada"
                    rightLabel="Altura de saída"
                    leftValue={rotatEntrada}
                    rightValue={rotatSaida}
                    onLeft={setRotatEntrada}
                    onRight={setRotatSaida}
                  />
                </div>
              </div>

              {/* Fotos */}
              <div>
                <label className={`${labelCls} flex items-center justify-between`}>
                  <span className="flex items-center gap-1.5">
                    <ImagePlus size={14} className="text-[#16A34A]" /> Fotos (até {MAX_FOTOS})
                  </span>
                  <span className="text-[11px] font-normal text-gray-400">Máx. 5MB por imagem</span>
                </label>
                <div className="flex flex-wrap gap-3">
                  {images.map((img) => (
                    <div key={img.id} className="relative h-24 w-24 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                      <img
                        src={img.url}
                        alt="Foto da espécie"
                        className="h-full w-full cursor-zoom-in object-cover"
                        onClick={() => setActiveLightboxUrl(img.url)}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(img.id)}
                        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/55 text-white transition-colors hover:bg-[#DC2626]"
                        title="Remover foto"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {images.length < MAX_FOTOS && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="grid h-24 w-24 place-items-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400 transition-colors hover:border-[#16A34A] hover:text-[#16A34A]"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <ImagePlus size={20} />
                        <span className="text-[10px] font-semibold">Adicionar</span>
                      </div>
                    </button>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageChange} className="hidden" />
              </div>
            </>
          ) : (
            /* Aba interna: Descrição */
            <div>
              <label className={`${labelCls} flex items-center gap-1.5`}>
                <FileText size={14} className="text-[#16A34A]" /> Descrição da espécie forrageira
              </label>
              <p className="mb-2 text-[12px] text-gray-400">
                Informações importantes sobre a espécie: adaptação, exigência de solo e fertilidade, tolerância a seca/frio,
                manejo recomendado, indicação de uso e observações relevantes.
              </p>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={12}
                placeholder="Escreva aqui as informações importantes sobre a espécie…"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15"
              />
            </div>
          )}

          <FormActions
            onCancel={limpar}
            onSave={salvar}
            saveDisabled={!canSave}
            saveLabel={editingId ? 'Salvar alterações' : 'Salvar'}
            cancelLabel={editingId ? 'Cancelar edição' : 'Limpar'}
            saveIcon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}
          />
        </div>
      ) : (
        /* ── Aba Registros ───────────────────────────────────────────────────── */
        loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : especies.length === 0 ? (
          <div className="text-center py-16 border border-dashed rounded-2xl p-12 shadow-md text-gray-400 border-gray-200 bg-white">
            <Sprout size={48} className="mx-auto mb-4 opacity-30 text-[#16A34A]" />
            <p className="text-sm font-semibold text-[#0F172A]">Nenhuma espécie forrageira cadastrada.</p>
            <p className="text-xs mt-1 opacity-70">Use a aba "Lançamentos" para começar.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#E5E7EB] bg-white overflow-hidden shadow-[0_1px_3px_rgba(16,24,40,0.08)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280] text-[11px] uppercase tracking-wider font-bold">
                  <th className="w-10" />
                  <th className="px-4 py-3.5 text-left">Espécie</th>
                  <th className="px-4 py-3.5 text-left">Alturas de pastejo</th>
                  <th className="px-4 py-3.5 text-center">Fotos</th>
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
                    {especies.map((esp) => (
                      <SortableRow
                        key={esp.id}
                        especie={esp}
                        onEdit={startEdit}
                        onDelete={(id) => setDeleteConfirmId(id)}
                      />
                    ))}
                  </tbody>
                </SortableContext>
                <DragOverlay dropAnimation={null}>
                  {activeDragEspecie ? (
                    <table className="w-full text-sm bg-white">
                      <tbody>
                        <tr className="shadow-2xl rounded border border-[#E5E7EB] text-[#0F172A] bg-white">
                          <td className="px-3 py-3 w-10">
                            <GripVertical size={16} className="text-[#16A34A]" />
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-bold">{activeDragEspecie.nome}</div>
                            {activeDragEspecie.nomeCientifico && (
                              <div className="text-xs italic text-gray-500">{activeDragEspecie.nomeCientifico}</div>
                            )}
                          </td>
                          <td className="px-4 py-3" />
                          <td className="px-4 py-3" />
                          <td className="px-4 py-3" />
                        </tr>
                      </tbody>
                    </table>
                  ) : null}
                </DragOverlay>
              </DndContext>
              <tfoot>
                <tr className="border-t border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280]">
                  <td colSpan={5} className="px-4 py-3 text-xs font-semibold leading-relaxed">
                    Total: {especies.length} {especies.length === 1 ? 'espécie cadastrada' : 'espécies cadastradas'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}

      {/* ── Lightbox de foto ──────────────────────────────────────────────────── */}
      {activeLightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-in fade-in duration-200"
          onClick={() => setActiveLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => setActiveLightboxUrl(null)}
          >
            <X size={20} />
          </button>
          <img
            src={activeLightboxUrl}
            alt="Foto ampliada"
            className="max-h-[88vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* ── Diálogo de exclusão ───────────────────────────────────────────────── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 max-w-sm w-full shadow-2xl transition-all duration-300">
            <h3 className="text-lg font-black tracking-tight mb-2 text-[#0F172A]">Confirmar Exclusão</h3>
            <p className="text-sm leading-relaxed mb-6 text-[#6B7280]">
              Tem certeza que deseja remover esta espécie forrageira? Esta ação não poderá ser desfeita.
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

export default EspeciesForrageirasManagement;
