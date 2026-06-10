import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  Search,
  Dna,
  Network,
  Download,
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
  listReprodutores,
  createReprodutor,
  updateReprodutor,
  deleteReprodutor,
  reorderReprodutores,
  type Reprodutor,
  type ReprodutorTipo,
  type Genealogia,
  type GenealogiaNo,
} from '../lib/api/reprodutoresClient';
import { CENTRAL_TOUROS, type CentralTouro } from '../lib/data/centralTouros';

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

const MAX_FOTOS = 5;

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
const textareaCls =
  'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15 resize-none';
const labelCls = 'mb-1 block text-[12.5px] font-semibold text-gray-700';

// ── Genealogia: descrição dos 6 nós (pai, mãe e 4 avós) ─────────────────────────

type GenealogiaKey =
  | 'pai'
  | 'mae'
  | 'avoPaternoPai'
  | 'avoPaternoMae'
  | 'avoMaternoPai'
  | 'avoMaternoMae';

interface NodeDef {
  key: GenealogiaKey;
  label: string;
  sexo: 'M' | 'F';
}

const LINHA_PATERNA: NodeDef[] = [
  { key: 'pai', label: 'Pai', sexo: 'M' },
  { key: 'avoPaternoPai', label: 'Avô paterno', sexo: 'M' },
  { key: 'avoPaternoMae', label: 'Avó paterna', sexo: 'F' },
];
const LINHA_MATERNA: NodeDef[] = [
  { key: 'mae', label: 'Mãe', sexo: 'F' },
  { key: 'avoMaternoPai', label: 'Avô materno', sexo: 'M' },
  { key: 'avoMaternoMae', label: 'Avó materna', sexo: 'F' },
];

const emptyNode = (): GenealogiaNo => ({ nome: '', registro: '' });
const getNode = (g: Genealogia, key: GenealogiaKey): GenealogiaNo => g[key] ?? emptyNode();
const hasGenealogia = (g: Genealogia): boolean =>
  Object.values(g || {}).some((n) => n && (n.nome?.trim() || n.registro?.trim()));

const SexoMark: React.FC<{ sexo: 'M' | 'F' }> = ({ sexo }) => (
  <span className={sexo === 'M' ? 'text-sky-600' : 'text-pink-500'}>{sexo === 'M' ? '♂' : '♀'}</span>
);

const tipoLabel = (t: ReprodutorTipo) => (t === 'embriao' ? 'Embrião' : 'Sêmen');

// ── Editor de um nó da genealogia ───────────────────────────────────────────────

const NodeEditor: React.FC<{
  def: NodeDef;
  value: GenealogiaNo;
  onChange: (v: GenealogiaNo) => void;
}> = ({ def, value, onChange }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-3">
    <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-gray-600">
      <SexoMark sexo={def.sexo} />
      <span>{def.label}</span>
    </div>
    <input
      type="text"
      value={value.nome}
      onChange={(e) => onChange({ ...value, nome: e.target.value })}
      placeholder="Nome"
      className={`${inputCls} mb-1.5`}
    />
    <input
      type="text"
      value={value.registro}
      onChange={(e) => onChange({ ...value, registro: e.target.value })}
      placeholder="Registro"
      className={inputCls}
    />
  </div>
);

const GenealogiaEditor: React.FC<{
  genealogia: Genealogia;
  onChange: (key: GenealogiaKey, v: GenealogiaNo) => void;
}> = ({ genealogia, onChange }) => (
  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
    {[
      { titulo: 'Linha Paterna', nodes: LINHA_PATERNA },
      { titulo: 'Linha Materna', nodes: LINHA_MATERNA },
    ].map(({ titulo, nodes }) => (
      <div key={titulo} className="flex flex-col gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#16a34a]">{titulo}</span>
        {nodes.map((def) => (
          <NodeEditor key={def.key} def={def} value={getNode(genealogia, def.key)} onChange={(v) => onChange(def.key, v)} />
        ))}
      </div>
    ))}
  </div>
);

// ── Visualização em pedigree (estilo colchete do diagrama) ──────────────────────

const PedigreeBox: React.FC<{ def: NodeDef; node: GenealogiaNo }> = ({ def, node }) => {
  const empty = !node.nome?.trim() && !node.registro?.trim();
  return (
    <div className={`rounded-lg border px-3 py-2 text-[12px] ${empty ? 'border-dashed border-gray-200 bg-gray-50/60' : 'border-gray-200 bg-white shadow-sm'}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
        <SexoMark sexo={def.sexo} />
        {def.label}
      </div>
      {empty ? (
        <div className="text-gray-300">—</div>
      ) : (
        <>
          <div className="font-bold leading-tight text-gray-800">{node.nome || '—'}</div>
          {node.registro?.trim() && <div className="text-[11px] text-gray-500">{node.registro}</div>}
        </>
      )}
    </div>
  );
};

/** Uma linha (pai ou mãe) com seus dois ascendentes, ligados por colchete. */
const PedigreeLinha: React.FC<{ parent: NodeDef; gp1: NodeDef; gp2: NodeDef; gen: Genealogia }> = ({
  parent,
  gp1,
  gp2,
  gen,
}) => (
  <div className="flex items-stretch gap-3">
    <div className="flex w-1/2 items-center">
      <div className="w-full">
        <PedigreeBox def={parent} node={getNode(gen, parent.key)} />
      </div>
    </div>
    {/* colchete */}
    <div className="flex w-3 flex-col items-center">
      <div className="flex-1 border-b border-r border-gray-300" />
      <div className="flex-1 border-t border-r border-gray-300" />
    </div>
    <div className="flex w-1/2 flex-col justify-center gap-2">
      <PedigreeBox def={gp1} node={getNode(gen, gp1.key)} />
      <PedigreeBox def={gp2} node={getNode(gen, gp2.key)} />
    </div>
  </div>
);

const PedigreeTree: React.FC<{ nome: string; genealogia: Genealogia }> = ({ nome, genealogia }) => (
  <div className="flex items-stretch gap-3">
    {/* Animal raiz */}
    <div className="flex w-40 shrink-0 items-center">
      <div className="w-full rounded-lg border border-[#16a34a]/30 bg-[#e7f6ec] px-3 py-2 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#16a34a]">Reprodutor</div>
        <div className="font-bold leading-tight text-gray-800">{nome || '—'}</div>
      </div>
    </div>
    {/* colchete principal */}
    <div className="flex w-3 flex-col items-center">
      <div className="flex-1 border-b border-r border-gray-300" />
      <div className="flex-1 border-t border-r border-gray-300" />
    </div>
    {/* Pai (cima) e Mãe (baixo) com seus avós */}
    <div className="flex flex-1 flex-col gap-4">
      <PedigreeLinha parent={LINHA_PATERNA[0]} gp1={LINHA_PATERNA[1]} gp2={LINHA_PATERNA[2]} gen={genealogia} />
      <PedigreeLinha parent={LINHA_MATERNA[0]} gp1={LINHA_MATERNA[1]} gp2={LINHA_MATERNA[2]} gen={genealogia} />
    </div>
  </div>
);

// ── Seletor de tipo (Sêmen / Embrião) ───────────────────────────────────────────

const TipoSelector: React.FC<{ value: ReprodutorTipo; onChange: (t: ReprodutorTipo) => void }> = ({ value, onChange }) => (
  <div className="inline-grid grid-cols-2 gap-1 rounded-xl border border-gray-200 bg-white p-1">
    {(['semen', 'embriao'] as ReprodutorTipo[]).map((t) => (
      <button
        key={t}
        type="button"
        onClick={() => onChange(t)}
        className={`rounded-lg px-5 py-1.5 text-sm font-semibold transition-colors ${
          value === t ? 'bg-[#16a34a] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
        }`}
      >
        {tipoLabel(t)}
      </button>
    ))}
  </div>
);

// ── Abas internas (Dados / Genealogia) ──────────────────────────────────────────

const InnerTabs: React.FC<{ value: 'dados' | 'genealogia'; onChange: (v: 'dados' | 'genealogia') => void }> = ({ value, onChange }) => (
  <div className="flex gap-1 border-b border-gray-200">
    {([
      { id: 'dados', label: 'Dados', icon: <Dna size={14} /> },
      { id: 'genealogia', label: 'Genealogia', icon: <Network size={14} /> },
    ] as const).map((t) => (
      <button
        key={t.id}
        type="button"
        onClick={() => onChange(t.id)}
        className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
          value === t.id ? 'border-[#16a34a] text-[#16a34a]' : 'border-transparent text-gray-500 hover:text-gray-700'
        }`}
      >
        {t.icon}
        {t.label}
      </button>
    ))}
  </div>
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

const SortableRow: React.FC<{
  reprodutor: Reprodutor;
  selected: boolean;
  menuOpen: boolean;
  onSelect: (r: Reprodutor) => void;
  onMenu: (e: React.MouseEvent, id: string) => void;
}> = ({ reprodutor, selected, menuOpen, onSelect, onMenu }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: reprodutor.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(reprodutor)}
      className={`cursor-pointer border-t border-gray-100 transition-colors ${selected ? 'bg-[#e7f6ec]' : 'hover:bg-gray-50'}`}
    >
      <td className="p-3">
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab text-gray-400 transition-colors hover:text-[#16A34A] active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
      </td>
      <td className={`p-3 font-semibold ${selected ? 'text-[#16a34a]' : 'text-gray-800'}`}>
        <div className="flex items-center gap-2">
          {reprodutor.imagens && reprodutor.imagens.length > 0 && (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[#e7f6ec] text-[#16a34a]" title="Possui fotos">
              <ImageIcon size={12} />
            </span>
          )}
          <span>{reprodutor.nome}</span>
        </div>
      </td>
      <td className="p-3">
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
            reprodutor.tipo === 'embriao' ? 'bg-[#EDE9FE] text-[#6D28D9]' : 'bg-[#DCFCE7] text-[#15803D]'
          }`}
        >
          {tipoLabel(reprodutor.tipo)}
        </span>
      </td>
      <td className="p-3 text-gray-500">{reprodutor.registro || '—'}</td>
      <td className="p-3 text-center">
        <button
          type="button"
          onClick={(e) => onMenu(e, reprodutor.id)}
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

// ── Main Component ──────────────────────────────────────────────────────────────

const ReprodutoresManagement: React.FC<Props> = ({ onToast, onBack }) => {
  const { user } = useAuth();
  const { selectedClient } = useClient();
  const organizationId = selectedClient?.id ?? user?.organizationId ?? '';

  const [reprodutores, setReprodutores] = useState<Reprodutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [activeLightboxUrl, setActiveLightboxUrl] = useState<string | null>(null);
  const [centralOpen, setCentralOpen] = useState(false);

  // Abas externas Lançamentos / Registros
  const [aba, setAba] = useState<'lancar' | 'registros'>('lancar');
  // Abas internas do formulário de lançamento
  const [innerTab, setInnerTab] = useState<'dados' | 'genealogia'>('dados');

  // ── Entrada da aba Lançamentos ─────────────────────────────────────────────
  const [nome, setNome] = useState('');
  const [registro, setRegistro] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [tipo, setTipo] = useState<ReprodutorTipo>('semen');
  const [raca, setRaca] = useState('');
  const [central, setCentral] = useState('');
  const [observacao, setObservacao] = useState('');
  const [genealogia, setGenealogia] = useState<Genealogia>({});
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nomeRef = useRef<HTMLInputElement>(null);

  // ── Detalhamento (aba Registros) ───────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = reprodutores.find((r) => r.id === selectedId) || null;
  const [modo, setModo] = useState<'visualizar' | 'editar'>('visualizar');
  const [detailTab, setDetailTab] = useState<'dados' | 'genealogia'>('dados');

  const [editNome, setEditNome] = useState('');
  const [editRegistro, setEditRegistro] = useState('');
  const [editDataNascimento, setEditDataNascimento] = useState('');
  const [editTipo, setEditTipo] = useState<ReprodutorTipo>('semen');
  const [editRaca, setEditRaca] = useState('');
  const [editCentral, setEditCentral] = useState('');
  const [editObservacao, setEditObservacao] = useState('');
  const [editGenealogia, setEditGenealogia] = useState<Genealogia>({});
  const [editImages, setEditImages] = useState<EditImageItem[]>([]);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URLs on unmount
  const imagePreviewsRef = useRef<string[]>([]);
  imagePreviewsRef.current = imagePreviews;
  const editImagesRef = useRef<EditImageItem[]>([]);
  editImagesRef.current = editImages;
  useEffect(() => {
    return () => {
      imagePreviewsRef.current.forEach((url) => URL.revokeObjectURL(url));
      editImagesRef.current.forEach((img) => {
        if (img.type === 'new' && img.url.startsWith('blob:')) URL.revokeObjectURL(img.url);
      });
    };
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Resolve as URLs (B2 → signed) das fotos de um registro em itens editáveis.
  const resolveImages = useCallback(async (urls: string[]): Promise<EditImageItem[]> => {
    return Promise.all(
      urls.map(async (url, idx) => {
        try {
          const resolved = await storageResolveUrl(url);
          return { id: `existing-${idx}-${url}`, type: 'existing' as const, url: resolved, originalUrl: url };
        } catch {
          return { id: `existing-${idx}-${url}`, type: 'existing' as const, url, originalUrl: url };
        }
      }),
    );
  }, []);

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const rows = await listReprodutores(organizationId);
      setReprodutores(rows);
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao carregar reprodutores', 'error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, onToast]);

  useEffect(() => {
    load();
  }, [load]);

  // Mantém a seleção válida quando a lista muda.
  useEffect(() => {
    setSelectedId((prev) => {
      if (prev && reprodutores.some((r) => r.id === prev)) return prev;
      return reprodutores[0]?.id ?? null;
    });
  }, [reprodutores]);

  // Carrega o detalhamento ao trocar de registro selecionado.
  useEffect(() => {
    if (selected) {
      setEditNome(selected.nome);
      setEditRegistro(selected.registro ?? '');
      setEditDataNascimento(selected.dataNascimento ?? '');
      setEditTipo(selected.tipo);
      setEditRaca(selected.raca ?? '');
      setEditCentral(selected.central ?? '');
      setEditObservacao(selected.observacao ?? '');
      setEditGenealogia(selected.genealogia ?? {});

      editImages.forEach((img) => {
        if (img.type === 'new' && img.url.startsWith('blob:')) URL.revokeObjectURL(img.url);
      });

      let cancelled = false;
      (async () => {
        const items = await resolveImages(selected.imagens || []);
        if (!cancelled) setEditImages(items);
      })();
      return () => {
        cancelled = true;
      };
    } else {
      setEditImages([]);
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Imagens ───────────────────────────────────────────────────────────────────
  const addFiles = (
    files: File[],
    currentCount: number,
    onValid: (file: File, blobUrl: string) => void,
  ) => {
    const allowed = MAX_FOTOS - currentCount;
    if (allowed <= 0) {
      onToast?.(`Você já adicionou o limite de ${MAX_FOTOS} fotos.`, 'warning');
      return;
    }
    for (const file of files.slice(0, allowed)) {
      if (file.size > 5 * 1024 * 1024) {
        onToast?.(`A imagem "${file.name}" excede o tamanho máximo de 5MB.`, 'error');
        continue;
      }
      onValid(file, URL.createObjectURL(file));
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    const validFiles: File[] = [];
    const newPreviews: string[] = [];
    addFiles(files, imageFiles.length, (file, blobUrl) => {
      validFiles.push(file);
      newPreviews.push(blobUrl);
    });
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
    const newItems: EditImageItem[] = [];
    addFiles(files, editImages.length, (file, blobUrl) => {
      newItems.push({
        id: `new-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        type: 'new',
        url: blobUrl,
        file,
      });
    });
    if (newItems.length > 0) setEditImages((prev) => [...prev, ...newItems]);
    e.target.value = '';
  };

  const handleRemoveEditImage = (id: string) => {
    const item = editImages.find((img) => img.id === id);
    if (item?.type === 'new' && item.url.startsWith('blob:')) URL.revokeObjectURL(item.url);
    setEditImages((prev) => prev.filter((img) => img.id !== id));
  };

  // ── Genealogia handlers ─────────────────────────────────────────────────────
  const setGenNode = (key: GenealogiaKey, v: GenealogiaNo) => setGenealogia((prev) => ({ ...prev, [key]: v }));
  const setEditGenNode = (key: GenealogiaKey, v: GenealogiaNo) => setEditGenealogia((prev) => ({ ...prev, [key]: v }));

  // ── Localizar das centrais → importa para o formulário ──────────────────────
  const [centralBusca, setCentralBusca] = useState('');
  const centralFiltrados = useMemo(() => {
    const q = centralBusca.trim().toLowerCase();
    if (!q) return CENTRAL_TOUROS;
    return CENTRAL_TOUROS.filter((t) =>
      [t.nome, t.registro, t.raca, t.central].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [centralBusca]);

  const importarDaCentral = (t: CentralTouro) => {
    setNome(t.nome);
    setRegistro(t.registro ?? '');
    setDataNascimento(t.dataNascimento ?? '');
    setTipo(t.tipo ?? 'semen');
    setRaca(t.raca ?? '');
    setCentral(t.central ?? '');
    setGenealogia(t.genealogia ?? {});
    setObservacao('');
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setImageFiles([]);
    setImagePreviews([]);
    setAba('lancar');
    setInnerTab('dados');
    setCentralOpen(false);
    setCentralBusca('');
    onToast?.(`"${t.nome}" importado. Revise os dados e salve.`, 'success');
  };

  // ── Upload das imagens novas → URLs ─────────────────────────────────────────
  const uploadFiles = async (files: File[]): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${organizationId}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
      await storageUpload('reprodutores-photos', path, file, { contentType: file.type });
      urls.push(storageGetPublicUrl('reprodutores-photos', path));
    }
    return urls;
  };

  // ── Lançamento ────────────────────────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setNome('');
    setRegistro('');
    setDataNascimento('');
    setTipo('semen');
    setRaca('');
    setCentral('');
    setObservacao('');
    setGenealogia({});
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setImageFiles([]);
    setImagePreviews([]);
    setInnerTab('dados');
  }, [imagePreviews]);

  const salvar = useCallback(async () => {
    const clean = nome.trim();
    if (!clean) {
      onToast?.('Informe o nome completo do reprodutor', 'error');
      setInnerTab('dados');
      return;
    }
    setSaving(true);
    try {
      const uploadedUrls = await uploadFiles(imageFiles);
      await createReprodutor({
        organizationId,
        nome: clean,
        registro: registro.trim() || null,
        dataNascimento: dataNascimento || null,
        tipo,
        raca: raca.trim() || null,
        central: central.trim() || null,
        imagens: uploadedUrls,
        genealogia,
        observacao: observacao.trim() || null,
      });
      onToast?.('Reprodutor salvo com sucesso', 'success');
      resetForm();
      await load();
      setAba('registros');
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar reprodutor', 'error');
    } finally {
      setSaving(false);
    }
  }, [nome, registro, dataNascimento, tipo, raca, central, observacao, genealogia, imageFiles, organizationId, onToast, resetForm, load]);

  // ── Edição (detalhamento) ───────────────────────────────────────────────────
  const cancelarEdicao = useCallback(async () => {
    if (selected) {
      setEditNome(selected.nome);
      setEditRegistro(selected.registro ?? '');
      setEditDataNascimento(selected.dataNascimento ?? '');
      setEditTipo(selected.tipo);
      setEditRaca(selected.raca ?? '');
      setEditCentral(selected.central ?? '');
      setEditObservacao(selected.observacao ?? '');
      setEditGenealogia(selected.genealogia ?? {});
      // Descarta fotos novas/removidas localmente e recarrega as salvas.
      editImages.forEach((img) => {
        if (img.type === 'new' && img.url.startsWith('blob:')) URL.revokeObjectURL(img.url);
      });
      setEditImages(await resolveImages(selected.imagens || []));
    }
    setModo('visualizar');
  }, [selected, editImages, resolveImages]);

  const salvarDetalhe = useCallback(async () => {
    if (!selectedId) return;
    const clean = editNome.trim();
    if (!clean) {
      onToast?.('Informe o nome completo do reprodutor', 'error');
      setDetailTab('dados');
      return;
    }
    setSaving(true);
    try {
      const finalUrls: string[] = [];
      for (const item of editImages) {
        if (item.type === 'existing' && item.originalUrl) {
          finalUrls.push(item.originalUrl);
        } else if (item.type === 'new' && item.file) {
          const [url] = await uploadFiles([item.file]);
          finalUrls.push(url);
        }
      }
      await updateReprodutor(selectedId, {
        nome: clean,
        registro: editRegistro.trim() || null,
        dataNascimento: editDataNascimento || null,
        tipo: editTipo,
        raca: editRaca.trim() || null,
        central: editCentral.trim() || null,
        imagens: finalUrls,
        genealogia: editGenealogia,
        observacao: editObservacao.trim() || null,
      });
      onToast?.('Reprodutor atualizado com sucesso', 'success');
      await load();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar reprodutor', 'error');
    } finally {
      setSaving(false);
    }
  }, [selectedId, editNome, editRegistro, editDataNascimento, editTipo, editRaca, editCentral, editObservacao, editGenealogia, editImages, onToast, load]);

  // ── Delete ────────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteReprodutor(deleteConfirmId);
      onToast?.('Reprodutor removido', 'success');
      setDeleteConfirmId(null);
      await load();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao excluir reprodutor', 'error');
    }
  };

  // ── Drag-and-Drop ───────────────────────────────────────────────────────────
  const handleDragStart = useCallback((event: { active: { id: unknown } }) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over || active.id === over.id) return;
      const oldIndex = reprodutores.findIndex((r) => r.id === String(active.id));
      const newIndex = reprodutores.findIndex((r) => r.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const reordered = [...reprodutores];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      setReprodutores(reordered);
      try {
        await reorderReprodutores(reordered.map((r, i) => ({ id: r.id, ordem: i })));
      } catch (err: any) {
        onToast?.(err.message || 'Erro ao reordenar', 'error');
        await load();
      }
    },
    [reprodutores, onToast, load],
  );

  const sortableIds = reprodutores.map((r) => r.id);
  const activeDrag = activeId ? reprodutores.find((r) => r.id === activeId) : null;

  // ── Menu de ações ─────────────────────────────────────────────────────────────
  const toggleMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu((prev) => (prev?.id === id ? null : { id, x: r.right, y: r.bottom }));
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);

  // ── Divisor arrastável ──────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────────
  if (!organizationId) {
    return (
      <div className="p-8 text-sm font-semibold text-gray-500">
        Selecione uma organização para gerenciar os reprodutores.
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl animate-in flex-col p-6 duration-500 fade-in md:p-8">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-5 rounded-xl p-2.5 text-gray-500 transition-all hover:bg-[#E7F6EC] hover:text-[#16A34A]"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="flex-1">
          <PageHeader
            title="Sêmen e Embriões"
            right={
              <TabSwitch
                tabs={[
                  { id: 'lancar', label: 'Lançamentos', icon: <Plus size={16} /> },
                  { id: 'registros', label: 'Registros', icon: <List size={16} />, badge: reprodutores.length },
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
        <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          {/* Botão Localizar das centrais */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#16a34a]/20 bg-[#e7f6ec]/40 p-3">
            <div className="text-[12.5px] text-gray-600">
              <span className="font-semibold text-gray-800">Não quer digitar tudo?</span> Importe um touro pré-cadastrado das centrais.
            </div>
            <button
              type="button"
              onClick={() => setCentralOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#16a34a] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#15803d]"
            >
              <Search size={15} />
              Localizar das centrais
            </button>
          </div>

          <InnerTabs value={innerTab} onChange={setInnerTab} />

          {innerTab === 'dados' ? (
            <div className="flex flex-col gap-4">
              <div>
                <label className={labelCls}>
                  Nome completo <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  ref={nomeRef}
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: SAV Renown 3439"
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={labelCls}>Registro</label>
                  <input type="text" value={registro} onChange={(e) => setRegistro(e.target.value)} placeholder="Nº de registro" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Data de nascimento</label>
                  <input type="date" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={labelCls}>Raça</label>
                  <input type="text" value={raca} onChange={(e) => setRaca(e.target.value)} placeholder="Ex: Angus, Nelore" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Central</label>
                  <input type="text" value={central} onChange={(e) => setCentral(e.target.value)} placeholder="Central de origem (opcional)" className={inputCls} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Tipo de material</label>
                <TipoSelector value={tipo} onChange={setTipo} />
              </div>

              <div>
                <label className={labelCls}>Observação</label>
                <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Detalhes adicionais (opcional)" rows={2} className={textareaCls} />
              </div>

              {/* Fotos */}
              <div>
                <label className={`${labelCls} flex justify-between`}>
                  <span>Fotos (até {MAX_FOTOS})</span>
                  <span className="text-[11px] font-normal text-gray-400">Máx. 5MB por imagem</span>
                </label>
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  {imagePreviews.map((url, idx) => (
                    <div key={idx} className="group relative h-20 w-20 overflow-hidden rounded-xl border border-gray-100 bg-gray-50 shadow-sm">
                      <img src={url} alt="Foto" className="h-full w-full cursor-zoom-in object-cover" onClick={() => setActiveLightboxUrl(url)} />
                      <button
                        type="button"
                        onClick={() => handleRemoveImageFile(idx)}
                        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 shadow-md transition-all hover:bg-black/85 group-hover:opacity-100"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  {imageFiles.length < MAX_FOTOS && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-20 w-20 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 text-gray-400 transition-all hover:border-[#16a34a] hover:bg-[#e7f6ec]/30 hover:text-[#16a34a]"
                    >
                      <Plus size={20} />
                      <span className="mt-1 text-[10px] font-semibold">Adicionar</span>
                    </button>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageChange} className="hidden" />
              </div>
            </div>
          ) : (
            /* Genealogia */
            <div className="flex flex-col gap-3">
              <p className="text-[12.5px] text-gray-500">Preencha pai, mãe e os avós paternos e maternos. Cada nó aceita nome e registro.</p>
              <GenealogiaEditor genealogia={genealogia} onChange={setGenNode} />
            </div>
          )}

          <FormActions
            onCancel={resetForm}
            onSave={salvar}
            saveDisabled={!nome.trim() || saving}
            saveIcon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}
          />
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : reprodutores.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 py-16 text-center text-gray-400 shadow-md">
          <Dna size={48} className="mx-auto mb-4 text-[#16A34A] opacity-30" />
          <p className="text-sm font-semibold text-[#0F172A]">Nenhum reprodutor cadastrado.</p>
          <p className="mt-1 text-xs opacity-70">Use a aba "Lançamentos" para começar.</p>
        </div>
      ) : (
        /* ── Aba Registros: master-detail ────────────────────────────────────── */
        <>
          <div className="mb-4">
            <h2 className="text-[17px] font-bold text-gray-900">Sêmen e Embriões — Reprodutores cadastrados</h2>
            <p className="mt-0.5 text-[12.5px] text-gray-500">Clique em um reprodutor para abri-lo; use ••• para ver ou excluir.</p>
          </div>
          <div
            ref={splitRef}
            className="flex h-[calc(100vh-240px)] min-h-[460px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white"
          >
            {/* Master */}
            <div className="min-h-0 shrink-0 overflow-y-auto" style={{ height: `${masterPct}%` }}>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <table className="w-full text-left text-[13px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[#fcfcfd] text-[11px] uppercase tracking-wide text-gray-500">
                      <th className="w-8 p-3" />
                      <th className="p-3 font-bold">Reprodutor</th>
                      <th className="p-3 font-bold">Tipo</th>
                      <th className="p-3 font-bold">Registro</th>
                      <th className="p-3 text-center font-bold">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                      {reprodutores.map((r) => (
                        <SortableRow
                          key={r.id}
                          reprodutor={r}
                          selected={selectedId === r.id}
                          menuOpen={menu?.id === r.id}
                          onSelect={(rep) => {
                            setSelectedId(rep.id);
                            setModo('visualizar');
                            setDetailTab('dados');
                          }}
                          onMenu={toggleMenu}
                        />
                      ))}
                    </SortableContext>
                  </tbody>
                </table>
                <DragOverlay dropAnimation={null}>
                  {activeDrag ? (
                    <div className="flex items-center gap-3 rounded border border-[#E5E7EB] bg-white px-4 py-3 shadow-2xl">
                      <GripVertical size={16} className="text-[#16A34A]" />
                      <span className="truncate font-bold text-[#0F172A]">{activeDrag.nome}</span>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>

            {/* Divisor */}
            <div
              role="separator"
              aria-orientation="horizontal"
              onPointerDown={startResize}
              onPointerMove={onResize}
              onPointerUp={endResize}
              onPointerCancel={endResize}
              className="group relative flex h-2.5 shrink-0 cursor-row-resize touch-none items-center justify-center border-t-4 border-[#e7f6ec] bg-[#fafbfc] transition-colors hover:border-[#16a34a]/40"
              title="Arraste para ajustar a altura"
            >
              <span className="h-1 w-10 rounded-full bg-gray-300 transition-colors group-hover:bg-[#16a34a]" />
            </div>

            {/* Detail */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#fafbfc]">
              {selected ? (
                <div className="flex flex-1 flex-col gap-4 p-5 animate-in duration-200 fade-in">
                  {/* Cabeçalho do detalhe */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-bold leading-tight text-gray-900">{selected.nome}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                            selected.tipo === 'embriao' ? 'bg-[#EDE9FE] text-[#6D28D9]' : 'bg-[#DCFCE7] text-[#15803D]'
                          }`}
                        >
                          {tipoLabel(selected.tipo)}
                        </span>
                        {selected.registro && <span>Reg.: {selected.registro}</span>}
                        {selected.raca && <span>· {selected.raca}</span>}
                        {selected.central && <span>· {selected.central}</span>}
                      </div>
                    </div>
                    {modo === 'visualizar' && (
                      <button
                        type="button"
                        onClick={() => setModo('editar')}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-xs font-bold text-gray-700 shadow-sm transition-all hover:border-[#16a34a] hover:bg-gray-50 hover:text-[#16a34a]"
                      >
                        <Pencil size={13} className="text-[#16a34a]" />
                        Editar
                      </button>
                    )}
                  </div>

                  <InnerTabs value={detailTab} onChange={setDetailTab} />

                  {modo === 'visualizar' ? (
                    /* ── Visualizar ─────────────────────────────────────────── */
                    detailTab === 'dados' ? (
                      <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                          <Campo label="Data de nascimento" value={selected.dataNascimento ? formatBR(selected.dataNascimento) : null} />
                          <Campo label="Registro" value={selected.registro} />
                          <Campo label="Raça" value={selected.raca} />
                          <Campo label="Central" value={selected.central} />
                          <Campo label="Tipo" value={tipoLabel(selected.tipo)} />
                        </div>
                        {selected.observacao && (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Observação</span>
                            <p className="whitespace-pre-wrap rounded-xl border border-gray-100 bg-white p-3.5 text-sm leading-relaxed text-gray-800 shadow-sm">
                              {selected.observacao}
                            </p>
                          </div>
                        )}
                        {editImages.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Fotos</span>
                            <div className="mt-0.5 flex flex-wrap gap-3">
                              {editImages.map((img) => (
                                <div
                                  key={img.id}
                                  onClick={() => setActiveLightboxUrl(img.url)}
                                  className="group relative h-24 w-24 cursor-zoom-in overflow-hidden rounded-xl border border-gray-100 bg-gray-50 shadow-sm transition-transform hover:scale-[1.03]"
                                >
                                  <img src={img.url} alt={selected.nome} className="h-full w-full object-cover" />
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                                    <Eye size={18} className="text-white" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                        {hasGenealogia(selected.genealogia) ? (
                          <PedigreeTree nome={selected.nome} genealogia={selected.genealogia} />
                        ) : (
                          <p className="py-6 text-center text-sm text-gray-400">Genealogia não informada.</p>
                        )}
                      </div>
                    )
                  ) : /* ── Editar ───────────────────────────────────────────────── */
                  detailTab === 'dados' ? (
                    <div className="flex flex-col gap-4">
                      <div>
                        <label className={labelCls}>
                          Nome completo <span className="text-[#DC2626]">*</span>
                        </label>
                        <input type="text" value={editNome} onChange={(e) => setEditNome(e.target.value)} className={inputCls} />
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className={labelCls}>Registro</label>
                          <input type="text" value={editRegistro} onChange={(e) => setEditRegistro(e.target.value)} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Data de nascimento</label>
                          <input type="date" value={editDataNascimento} onChange={(e) => setEditDataNascimento(e.target.value)} className={inputCls} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className={labelCls}>Raça</label>
                          <input type="text" value={editRaca} onChange={(e) => setEditRaca(e.target.value)} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Central</label>
                          <input type="text" value={editCentral} onChange={(e) => setEditCentral(e.target.value)} className={inputCls} />
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>Tipo de material</label>
                        <TipoSelector value={editTipo} onChange={setEditTipo} />
                      </div>
                      <div>
                        <label className={labelCls}>Observação</label>
                        <textarea value={editObservacao} onChange={(e) => setEditObservacao(e.target.value)} rows={2} className={textareaCls} />
                      </div>
                      <div>
                        <label className={`${labelCls} flex justify-between`}>
                          <span>Fotos (até {MAX_FOTOS})</span>
                          <span className="text-[11px] font-normal text-gray-400">Máx. 5MB por imagem</span>
                        </label>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3">
                          {editImages.map((img) => (
                            <div key={img.id} className="group relative h-20 w-20 overflow-hidden rounded-xl border border-gray-100 bg-gray-50 shadow-sm">
                              <img src={img.url} alt="Foto" className="h-full w-full cursor-zoom-in object-cover" onClick={() => setActiveLightboxUrl(img.url)} />
                              <button
                                type="button"
                                onClick={() => handleRemoveEditImage(img.id)}
                                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 shadow-md transition-all hover:bg-black/85 group-hover:opacity-100"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                          {editImages.length < MAX_FOTOS && (
                            <button
                              type="button"
                              onClick={() => editFileInputRef.current?.click()}
                              className="flex h-20 w-20 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 text-gray-400 transition-all hover:border-[#16a34a] hover:bg-[#e7f6ec]/30 hover:text-[#16a34a]"
                            >
                              <Plus size={20} />
                              <span className="mt-1 text-[10px] font-semibold">Adicionar</span>
                            </button>
                          )}
                        </div>
                        <input ref={editFileInputRef} type="file" accept="image/*" multiple onChange={handleEditImageChange} className="hidden" />
                      </div>
                      <DetailActions saving={saving} onCancel={cancelarEdicao} onSave={salvarDetalhe} />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <GenealogiaEditor genealogia={editGenealogia} onChange={setEditGenNode} />
                      <DetailActions saving={saving} onCancel={cancelarEdicao} onSave={salvarDetalhe} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-center text-sm text-gray-400">
                  Selecione um registro acima para ver os detalhes.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Menu de ações ──────────────────────────────────────────────────────── */}
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
                setDetailTab('dados');
                closeMenu();
              }}
            />
            <MenuItem
              icon={<Pencil size={15} />}
              label="Editar"
              onClick={() => {
                setSelectedId(menu.id);
                setModo('editar');
                setDetailTab('dados');
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

      {/* ── Modal: Localizar das centrais ──────────────────────────────────────── */}
      {centralOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in duration-200 fade-in"
          onClick={() => setCentralOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 p-5">
              <div className="flex items-center gap-2.5">
                <Search size={18} className="text-[#16a34a]" />
                <h3 className="text-base font-black tracking-tight text-[#0F172A]">Localizar das centrais</h3>
              </div>
              <button type="button" onClick={() => setCentralOpen(false)} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>
            <div className="border-b border-gray-100 p-4">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  autoFocus
                  value={centralBusca}
                  onChange={(e) => setCentralBusca(e.target.value)}
                  placeholder="Buscar por nome, registro, raça ou central..."
                  className={`${inputCls} pl-9`}
                />
              </div>
              <p className="mt-2 text-[11px] text-gray-400">
                Catálogo demonstrativo. A base completa das centrais será disponibilizada em breve.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {centralFiltrados.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-400">Nenhum touro encontrado para "{centralBusca}".</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {centralFiltrados.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                      <div className="min-w-0">
                        <div className="truncate font-bold text-gray-800">{t.nome}</div>
                        <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-gray-500">
                          {t.registro && <span>Reg.: {t.registro}</span>}
                          {t.raca && <span>· {t.raca}</span>}
                          {t.central && <span>· {t.central}</span>}
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-500">{tipoLabel(t.tipo ?? 'semen')}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => importarDaCentral(t)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#16a34a] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#15803d]"
                      >
                        <Download size={13} />
                        Importar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmação de exclusão ────────────────────────────────────────────── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in duration-200 fade-in">
          <div className="w-full max-w-sm rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-black tracking-tight text-[#0F172A]">Confirmar Exclusão</h3>
            <p className="mb-6 text-sm leading-relaxed text-[#6B7280]">
              Tem certeza que deseja remover este reprodutor? Esta ação não poderá ser desfeita.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-xl border border-[#E5E7EB] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#6B7280] transition-all hover:bg-[#F9FAFB]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-xl bg-[#DC2626] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-red-950/10 transition-all hover:bg-[#B91C1C]"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ───────────────────────────────────────────────────────────── */}
      {activeLightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in duration-200 fade-in"
          onClick={() => setActiveLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-black/40 p-2 text-white/70 transition-colors hover:bg-black/60 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              setActiveLightboxUrl(null);
            }}
          >
            <X size={24} />
          </button>
          <div className="relative flex max-h-[90vh] max-w-[90vw] items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={activeLightboxUrl}
              alt="Foto ampliada"
              className="max-h-[85vh] max-w-[85vw] rounded-lg border border-white/10 object-contain shadow-2xl animate-in zoom-in-95 duration-150"
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ── Helpers de apresentação ─────────────────────────────────────────────────────

const Campo: React.FC<{ label: string; value?: string | null }> = ({ label, value }) =>
  value ? (
    <div className="flex flex-col">
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</span>
      <span className="text-sm font-semibold text-gray-800">{value}</span>
    </div>
  ) : null;

const DetailActions: React.FC<{ saving: boolean; onCancel: () => void; onSave: () => void }> = ({ saving, onCancel, onSave }) => (
  <div className="mt-2 flex flex-wrap items-center gap-3">
    <button
      type="button"
      onClick={onCancel}
      className="h-10 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
    >
      Cancelar
    </button>
    <button
      type="button"
      onClick={onSave}
      disabled={saving}
      className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-[#16a34a] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#15803d] disabled:cursor-not-allowed disabled:bg-[#86cfa4]"
    >
      {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
      Salvar alterações
    </button>
  </div>
);

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' (sem criar Date para evitar fuso). */
function formatBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export default ReprodutoresManagement;
