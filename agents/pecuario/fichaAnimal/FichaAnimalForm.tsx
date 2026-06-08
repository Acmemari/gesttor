import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Save,
  Network,
  Images,
  Syringe,
  Pencil,
  UploadCloud,
  ImageIcon,
  Video,
  Trash2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Sprout,
  BadgeCheck,
  Fingerprint,
  Palette,
} from 'lucide-react';
import FieldControl from '../nascimento/FieldControl';
import BrincoBovinoIcon from '../nascimento/BrincoBovinoIcon';
import DnaHelixIcon from './DnaHelixIcon';
import PesagemGmdIcon from './PesagemGmdIcon';
import ComedouroIcon from './ComedouroIcon';
import ProgenieIcon from './ProgenieIcon';
import ReprodutivoIcon from './ReprodutivoIcon';
import {
  FIELD_BY_ID,
  COLOSTRO,
  FRAMES,
  CATEGORIAS_GENEALOGICAS,
  CEIP,
  EVENTOS_ENTRADA,
} from '../nascimento/fieldRegistry';
import { sexoFromCategoria } from '../nascimento/util';
import type { LrField, LookupItem } from '../nascimento/types';
import { useHorizontalOverflow } from '../../../hooks/useHorizontalOverflow';
import AnimalStatusBadge from './AnimalStatusBadge';

interface FichaAnimalFormProps {
  /**
   * Persiste a ficha. Retorne `false` para sinalizar falha (o formulário mantém
   * os dados preenchidos); qualquer outro retorno é tratado como sucesso e limpa
   * o formulário. O toast de sucesso fica a cargo de quem persiste.
   */
  onSave?: (values: Record<string, string>) => boolean | void | Promise<boolean | void>;
  categories: LookupItem[];
  lotes: LookupItem[];
  /** Sobrescreve opções de campos 'select' (ex.: raças cadastradas). */
  optionsOverride?: Record<string, string[]>;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  /**
   * Valores iniciais da ficha — preenche o formulário ao abrir um animal já
   * existente (ex.: gerado automaticamente a partir de um nascimento). Em modo
   * de criação fica indefinido e o formulário começa em branco.
   */
  initialValues?: Record<string, string>;
}

type TabId =
  | 'identificacao'
  | 'origem'
  | 'genealogia'
  | 'fotos'
  | 'progenies'
  | 'pesagens'
  | 'reprodutivo'
  | 'sanitario'
  | 'nutricional'
  | 'melhoramento';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: TabDef[] = [
  { id: 'identificacao', label: 'Identificação', icon: BrincoBovinoIcon },
  { id: 'origem', label: 'Origem', icon: MapPin },
  { id: 'genealogia', label: 'Genealogia', icon: Network },
  { id: 'progenies', label: 'Progênies', icon: ProgenieIcon },
  { id: 'pesagens', label: 'Pesagens e GMD', icon: PesagemGmdIcon },
  { id: 'reprodutivo', label: 'Reprodutivo', icon: ReprodutivoIcon },
  { id: 'sanitario', label: 'Sanitário', icon: Syringe },
  { id: 'nutricional', label: 'Nutricional', icon: ComedouroIcon },
  { id: 'fotos', label: 'Fotos e vídeos', icon: Images },
  { id: 'melhoramento', label: 'Programa Melhoramento', icon: DnaHelixIcon },
];

const ALL_TAB_IDS = TABS.map((t) => t.id);
/** Identificação é sempre visível — guarda a chave (ID Manejo) da ficha. */
const LOCKED_TAB: TabId = 'identificacao';
/** Preferência (por usuário/navegador) de quais abas exibir na Ficha Animal. */
const TAB_PREF_KEY = 'inttegra:ficha-animal-tabs';

/** Lê as abas visíveis do localStorage; por padrão, todas. */
function loadEnabledTabs(): TabId[] {
  if (typeof window === 'undefined') return [...ALL_TAB_IDS];
  try {
    const raw = localStorage.getItem(TAB_PREF_KEY);
    if (!raw) return [...ALL_TAB_IDS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...ALL_TAB_IDS];
    const valid = parsed.filter((id): id is TabId => ALL_TAB_IDS.includes(id));
    // Identificação nunca pode ficar de fora.
    const withLocked = valid.includes(LOCKED_TAB) ? valid : [LOCKED_TAB, ...valid];
    // "Origem" é nova: garante que apareça mesmo para quem já tinha preferência salva.
    return withLocked.includes('origem') ? withLocked : [...withLocked, 'origem'];
  } catch {
    return [...ALL_TAB_IDS];
  }
}

/** Mídia selecionada (foto/vídeo) com pré-visualização local. */
interface MediaItem {
  id: number;
  name: string;
  size: number;
  /** object URL para pré-visualização. */
  url: string;
  kind: 'image' | 'video';
}

/** Formata o tamanho do arquivo de forma legível. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Aba Identificação, dividida em três grupos visuais. Os campos compartilhados
 * com o Lançamento Rápido reutilizam a definição canônica (FIELD_BY_ID) para
 * manter rótulos/tipos em sincronia; os campos exclusivos da ficha são
 * declarados inline.
 */

/** Grupo 1 — dados mínimos para abrir a ficha. */
const ESSENCIAL_FIELDS: LrField[] = [
  FIELD_BY_ID.apelido,
  FIELD_BY_ID.categoria,
  FIELD_BY_ID.sexo,
  FIELD_BY_ID.raca,
  FIELD_BY_ID.grau,
  { id: 'eventoEntrada', label: 'Evento de Entrada', type: 'select', options: EVENTOS_ENTRADA, placeholder: 'Evento de Entrada', def: 'dados' },
  { id: 'dataEntrada', label: 'Data da Entrada', type: 'date', def: 'dados' },
];

/** Grupo 2 — números e documentos que identificam o animal. */
const IDENTIFICADORES_FIELDS: LrField[] = [
  { id: 'rfid', label: 'ID Eletrônico', type: 'text', placeholder: 'ID Eletrônico', def: 'dados' },
  FIELD_BY_ID.sisbov,
  FIELD_BY_ID.rgn,
  FIELD_BY_ID.rgd,
  FIELD_BY_ID.serie,
  { id: 'nome', label: 'Nome completo', type: 'text', placeholder: 'Nome completo', def: 'dados', span: 2 },
];

/** Grupo 3 — características físicas e classificação genealógica. */
const CARACTERISTICAS_FIELDS: LrField[] = [
  FIELD_BY_ID.pelagem,
  FIELD_BY_ID.chifre,
  { id: 'frame', label: 'Frame', type: 'select', options: FRAMES, placeholder: 'Frame', def: 'dados' },
  { id: 'categoriaGenealogica', label: 'Categoria Genealógica', type: 'select', options: CATEGORIAS_GENEALOGICAS, placeholder: 'Categoria Genealógica', def: 'dados' },
  { id: 'ceip', label: 'CEIP', type: 'select', options: CEIP, placeholder: 'CEIP', def: 'dados' },
  FIELD_BY_ID.obs,
];

/** Campos da aba Genealogia: Pai, Mãe, Avô Paterno e Avô Materno. */
const GENEALOGIA_FIELDS: LrField[] = [
  { id: 'pai', label: 'Pai', type: 'text', placeholder: 'Pai — ID/Nome', def: 'dados' },
  { id: 'mae', label: 'Mãe', type: 'text', placeholder: 'Mãe — ID/Nome', def: 'dados' },
  { id: 'avoPaterno', label: 'Avô Paterno', type: 'text', placeholder: 'Avô Paterno — ID/Nome', def: 'dados' },
  { id: 'avoMaterno', label: 'Avô Materno', type: 'text', placeholder: 'Avô Materno — ID/Nome', def: 'dados' },
];

/**
 * Dados de nascimento exibidos na aba "Origem".
 * Reutiliza os ids do registro (data, pesoNascer, colostro) para que os valores
 * fiquem em sincronia com os demais campos da ficha e sejam preenchidos
 * automaticamente ao lançar um nascimento.
 */
const ORIGEM_NASC_FIELDS: LrField[] = [
  { id: 'data', label: 'Data de nascimento', type: 'date', def: 'dados' },
  { id: 'pesoNascer', label: 'Peso ao nascer', type: 'weight', def: 'dados' },
  { id: 'colostro', label: 'Mamou colostro?', type: 'select', options: COLOSTRO, def: 'dados' },
  { id: 'fazendaNascimento', label: 'Fazenda de nascimento', type: 'text', placeholder: 'Fazenda onde nasceu', def: 'dados' },
  { id: 'mae', label: 'Mãe', type: 'text', placeholder: 'Mãe — ID/Nome', def: 'dados' },
  { id: 'parto', label: 'Tipo de parto', type: 'select', options: ['Normal', 'Distócico', 'Assistido', 'Cesárea'], placeholder: 'Tipo de parto', def: 'dados' },
];

/** Aba ainda sem campos definidos (o usuário preenche depois). */
const EmptyTab: React.FC<{ icon: React.ElementType; title: string }> = ({ icon: Icon, title }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e7f6ec] text-[#16a34a]">
      <Icon size={26} />
    </div>
    <h4 className="text-sm font-bold text-gray-700">{title}</h4>
    <p className="max-w-sm text-[12.5px] leading-relaxed text-gray-400">
      Os campos desta seção serão definidos em breve. A estrutura já está pronta para receber os
      dados posteriormente.
    </p>
  </div>
);

/**
 * Formulário de inclusão de uma Ficha Animal, exibido inline na aba "Lançar".
 * Organizado em abas internas (Identificação, Genealogia, etc.), no mesmo padrão
 * visual da tela de Nascimento (verde #16a34a sobre branco).
 */
const FichaAnimalForm: React.FC<FichaAnimalFormProps> = ({
  onSave,
  categories,
  lotes,
  optionsOverride,
  onToast,
  initialValues,
}) => {
  const [tab, setTab] = useState<TabId>('identificacao');
  const [values, setValues] = useState<Record<string, string>>(() => initialValues ?? {});
  const [saving, setSaving] = useState(false);
  // Edição (ficha já persistida) vs. criação — muda apenas rótulos do rodapé.
  const isEdit = Boolean(initialValues?.__id);

  // Abrindo outro animal: re-semeia o formulário com os valores recebidos.
  useEffect(() => {
    if (initialValues) setValues(initialValues);
  }, [initialValues]);

  const setValue = (id: string, v: string) => setValues((prev) => ({ ...prev, [id]: v }));

  // Ao selecionar a Categoria, o Sexo vem por padrão (derivado do cadastro da
  // categoria). Padrão do sistema — vale para todo campo de categoria.
  const handleFieldChange = (field: LrField, v: string) => {
    setValue(field.id, v);
    if (field.type === 'cat') {
      const sexo = sexoFromCategoria(categories, v);
      if (sexo) setValue('sexo', sexo);
    }
  };

  // ── Abas visíveis (preferência do usuário, persistida no navegador) ─────────
  const [enabledTabs, setEnabledTabs] = useState<TabId[]>(loadEnabledTabs);
  const [editingTabs, setEditingTabs] = useState(false);
  const tabEditorRef = useRef<HTMLDivElement | null>(null);

  // Persiste a preferência sempre que mudar.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(TAB_PREF_KEY, JSON.stringify(enabledTabs));
    } catch {
      /* quota cheia ou modo privado — mantém apenas em memória */
    }
  }, [enabledTabs]);

  // Fecha o seletor de abas ao clicar fora dele.
  useEffect(() => {
    if (!editingTabs) return;
    const onDown = (e: MouseEvent) => {
      if (tabEditorRef.current && !tabEditorRef.current.contains(e.target as Node)) {
        setEditingTabs(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [editingTabs]);

  // Abas exibidas, sempre na ordem canônica de TABS.
  const visibleTabs = useMemo(
    () => TABS.filter((t) => enabledTabs.includes(t.id)),
    [enabledTabs],
  );

  // Se a aba ativa for escondida, volta para Identificação.
  useEffect(() => {
    if (!enabledTabs.includes(tab)) setTab(LOCKED_TAB);
  }, [enabledTabs, tab]);

  const toggleTab = (id: TabId) => {
    if (id === LOCKED_TAB) return; // sempre visível
    setEnabledTabs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // ── Fotos e vídeos (pré-visualização local; o upload para storage será
  // conectado junto com a persistência da ficha). ────────────────────────────
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const mediaSeq = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Espelho do estado para revogar os object URLs ao desmontar (evita vazamento).
  const mediaRef = useRef<MediaItem[]>([]);
  useEffect(() => {
    mediaRef.current = media;
  }, [media]);
  useEffect(() => () => mediaRef.current.forEach((m) => URL.revokeObjectURL(m.url)), []);

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    const accepted = arr.filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
    const rejeitados = arr.length - accepted.length;
    if (rejeitados > 0) {
      onToast?.(`${rejeitados} arquivo(s) ignorado(s) — envie apenas imagens ou vídeos`, 'warning');
    }
    if (!accepted.length) return;
    const items: MediaItem[] = accepted.map((f) => ({
      id: ++mediaSeq.current,
      name: f.name,
      size: f.size,
      url: URL.createObjectURL(f),
      kind: f.type.startsWith('video/') ? 'video' : 'image',
    }));
    setMedia((prev) => [...prev, ...items]);
  };

  const removeMedia = (id: number) =>
    setMedia((prev) => {
      const item = prev.find((m) => m.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter((m) => m.id !== id);
    });

  const clearMedia = () => {
    mediaRef.current.forEach((m) => URL.revokeObjectURL(m.url));
    setMedia([]);
  };

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  // Largura no grid: respeita o span do campo (1/2/3 colunas).
  const spanClass = (f: LrField) =>
    f.span === 3 ? 'lg:col-span-3 sm:col-span-2' : f.span === 2 ? 'sm:col-span-2' : '';

  // Renderiza um grupo da aba Identificação (cabeçalho + grade de campos).
  const renderGroup = (title: string, Icon: React.ElementType, fields: LrField[]) => (
    <div>
      <div className="mb-3 flex items-center gap-2 border-b border-gray-100 pb-2 text-[12.5px] font-bold uppercase tracking-wider text-[#16a34a]">
        <Icon size={15} /> {title}
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <div key={f.id} className={spanClass(f)}>
            <FieldControl
              field={f}
              value={values[f.id] ?? ''}
              onChange={(v) => handleFieldChange(f, v)}
              categories={categories}
              lotes={lotes}
              optionsOverride={optionsOverride}
              grid
            />
          </div>
        ))}
      </div>
    </div>
  );

  const limpar = () => {
    clearMedia();
    setValues({});
    setTab('identificacao');
  };

  const handleSave = async () => {
    const apelido = (values.apelido || '').trim();
    if (!apelido) {
      onToast?.('Informe o ID Manejo (chave da ficha)', 'error');
      setTab('identificacao');
      return;
    }
    setSaving(true);
    try {
      // A confirmação (toast de sucesso) é dada pelo pai após a gravação no banco.
      const ok = await onSave?.({ ...values, apelido });
      // Falha de gravação: mantém os dados preenchidos para nova tentativa.
      if (ok === false) return;
      limpar();
    } finally {
      setSaving(false);
    }
  };

  const activeTab = useMemo(() => TABS.find((t) => t.id === tab) ?? TABS[0], [tab]);

  // ── Barra de abas rolável: setas aparecem quando há abas fora da vista ───────
  const {
    ref: tabsScrollRef,
    canScrollLeft,
    canScrollRight,
    update: updateTabsOverflow,
    scrollByDir: scrollTabs,
  } = useHorizontalOverflow<HTMLDivElement>([visibleTabs, media.length]);

  // Ao trocar de aba, rola a barra para manter a aba ativa visível (sem rolar a
  // página) — assim selecionar uma aba escondida traz ela para a vista.
  useEffect(() => {
    const c = tabsScrollRef.current;
    if (!c) return;
    const btn = c.querySelector<HTMLElement>('[data-active="true"]');
    if (btn) {
      const left = btn.offsetLeft;
      const right = left + btn.offsetWidth;
      if (left < c.scrollLeft) {
        c.scrollTo({ left: Math.max(0, left - 12), behavior: 'smooth' });
      } else if (right > c.scrollLeft + c.clientWidth) {
        c.scrollTo({ left: right - c.clientWidth + 12, behavior: 'smooth' });
      }
    }
    updateTabsOverflow();
  }, [tab, visibleTabs, updateTabsOverflow]);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      {/* Cabeçalho do card */}
      <div className="border-b border-gray-200 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-gray-900">
            {initialValues?.apelido ? `Ficha · ${initialValues.apelido}` : 'Nova ficha animal'}
          </h3>
          {/* Status derivado automaticamente da situação do animal (Ativo/Morte/Venda). */}
          <AnimalStatusBadge situacao={values.situacao} />
        </div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-gray-500">
          Só o <span className="font-semibold text-gray-700">ID Manejo</span> é obrigatório — todo o
          resto pode ser preenchido depois. Sem brinco, o animal entra como
          <span className="font-semibold text-gray-700"> “não identificado”</span>.
        </p>
      </div>

      {/* Abas internas (com seletor de quais abas exibir) */}
      <div className="flex items-stretch border-b border-gray-200 px-3">
        {/* Botão lápis: cada usuário escolhe os grupos que quer ver */}
        <div className="relative flex shrink-0 items-center" ref={tabEditorRef}>
          <button
            type="button"
            onClick={() => setEditingTabs((v) => !v)}
            title="Escolher quais abas exibir"
            aria-label="Escolher quais abas exibir"
            aria-expanded={editingTabs}
            className={`mr-1 inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
              editingTabs
                ? 'border-[#16a34a] bg-[#e7f6ec] text-[#16a34a]'
                : 'border-gray-200 text-gray-400 hover:border-[#16a34a]/40 hover:text-[#16a34a]'
            }`}
          >
            <Pencil size={14} />
          </button>

          {editingTabs ? (
            <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
              <p className="px-2 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Abas visíveis
              </p>
              <div className="max-h-72 overflow-y-auto">
                {TABS.map((t) => {
                  const Icon = t.icon;
                  const locked = t.id === LOCKED_TAB;
                  const checked = enabledTabs.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] ${
                        locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-[#16a34a]"
                        checked={checked}
                        disabled={locked}
                        onChange={() => toggleTab(t.id)}
                      />
                      <Icon size={15} className="shrink-0 text-gray-400" />
                      <span className="font-medium text-gray-700">{t.label}</span>
                      {locked ? (
                        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-gray-300">
                          fixa
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Abas — uma linha; setas de rolagem surgem quando não cabem todas */}
        <div className="relative flex min-w-0 flex-1 items-stretch">
          {canScrollLeft ? (
            <>
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-white to-transparent" />
              <button
                type="button"
                onClick={() => scrollTabs(-1)}
                aria-label="Rolar abas para a esquerda"
                className="absolute left-0 top-1/2 z-20 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:text-[#16a34a]"
              >
                <ChevronLeft size={16} />
              </button>
            </>
          ) : null}

          <div
            ref={tabsScrollRef}
            onScroll={updateTabsOverflow}
            className="flex min-w-0 flex-1 gap-1 overflow-x-auto scrollbar-hide"
          >
            {visibleTabs.map((t) => {
              const active = t.id === tab;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  data-active={active ? 'true' : undefined}
                  onClick={() => setTab(t.id)}
                  className={`-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                    active
                      ? 'border-[#16a34a] text-[#16a34a]'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon size={15} className={active ? 'text-[#16a34a]' : 'text-gray-400'} />
                  {t.label}
                  {t.id === 'fotos' && media.length ? (
                    <span
                      className={`rounded-full px-1.5 text-[10.5px] font-bold ${
                        active ? 'bg-[#e7f6ec] text-[#16a34a]' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {media.length}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {canScrollRight ? (
            <>
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-white to-transparent" />
              <button
                type="button"
                onClick={() => scrollTabs(1)}
                aria-label="Rolar abas para a direita"
                className="absolute right-0 top-1/2 z-20 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:text-[#16a34a]"
              >
                <ChevronRight size={16} />
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Corpo */}
      <div className="px-5 py-5">
        {tab === 'identificacao' ? (
          <div className="flex flex-col gap-6">
            {renderGroup('Cadastro Essencial', BadgeCheck, ESSENCIAL_FIELDS)}
            {renderGroup('Identificadores', Fingerprint, IDENTIFICADORES_FIELDS)}
            {renderGroup('Características', Palette, CARACTERISTICAS_FIELDS)}
          </div>
        ) : tab === 'origem' ? (
          <div className="flex flex-col gap-5">
            {/* Dados de nascimento — preenchidos ao lançar um nascimento */}
            <div>
              <div className="mb-3 flex items-center gap-2 border-b border-gray-100 pb-2 text-[12.5px] font-bold uppercase tracking-wider text-[#16a34a]">
                <Sprout size={15} /> Dados de nascimento
              </div>
              <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {ORIGEM_NASC_FIELDS.map((f) => (
                  <div key={f.id} className={spanClass(f)}>
                    <FieldControl
                      field={f}
                      value={values[f.id] ?? ''}
                      onChange={(v) => setValue(f.id, v)}
                      categories={categories}
                      lotes={lotes}
                      optionsOverride={optionsOverride}
                      grid
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : tab === 'genealogia' ? (
          <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
            {GENEALOGIA_FIELDS.map((f) => (
              <div key={f.id}>
                <FieldControl
                  field={f}
                  value={values[f.id] ?? ''}
                  onChange={(v) => setValue(f.id, v)}
                  categories={categories}
                  lotes={lotes}
                  optionsOverride={optionsOverride}
                  grid
                />
              </div>
            ))}
          </div>
        ) : tab === 'fotos' ? (
          <div className="flex flex-col gap-4">
            {/* Área de envio (clique ou arraste) */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-9 text-center transition-colors ${
                dragOver ? 'border-[#16a34a] bg-[#e7f6ec]' : 'border-gray-200 bg-[#fafbfc]'
              }`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e7f6ec] text-[#16a34a]">
                <UploadCloud size={24} />
              </div>
              <p className="text-sm font-semibold text-gray-700">Arraste fotos e vídeos aqui</p>
              <p className="text-[12px] text-gray-400">ou</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#15803d]"
              >
                <ImageIcon size={16} /> Selecionar arquivos
              </button>
              <p className="mt-1 text-[11.5px] text-gray-400">
                Imagens (JPG, PNG, WEBP) e vídeos (MP4, MOV)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={onPickFiles}
              />
            </div>

            {/* Galeria de pré-visualização */}
            {media.length ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-gray-600">
                    {media.length} arquivo{media.length > 1 ? 's' : ''} selecionado
                    {media.length > 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={clearMedia}
                    className="text-[12.5px] font-semibold text-gray-400 hover:text-red-500"
                  >
                    Remover todos
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {media.map((m) => (
                    <div
                      key={m.id}
                      className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white"
                    >
                      <div className="relative aspect-square w-full bg-gray-50">
                        {m.kind === 'image' ? (
                          <img src={m.url} alt={m.name} className="h-full w-full object-cover" />
                        ) : (
                          <video src={m.url} className="h-full w-full object-cover" muted playsInline />
                        )}
                        {m.kind === 'video' ? (
                          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            <Video size={11} /> vídeo
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => removeMedia(m.id)}
                          className="absolute right-1.5 top-1.5 rounded-md bg-black/55 p-1 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
                          title="Remover"
                          aria-label={`Remover ${m.name}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <div className="px-2 py-1.5">
                        <p className="truncate text-[11.5px] font-medium text-gray-700" title={m.name}>
                          {m.name}
                        </p>
                        <p className="text-[10.5px] text-gray-400">{formatSize(m.size)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <EmptyTab icon={activeTab.icon} title={activeTab.label} />
        )}
      </div>

      {/* Rodapé */}
      <div className="flex items-center gap-3 border-t border-gray-200 px-5 py-4">
        <div className="flex-1" />
        <button
          type="button"
          onClick={limpar}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isEdit ? 'Limpar' : 'Cancelar'}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#15803d] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save size={16} /> {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Salvar'}
        </button>
      </div>
    </div>
  );
};

export default FichaAnimalForm;
