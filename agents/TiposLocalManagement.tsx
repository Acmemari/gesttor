import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  List,
  ArrowLeft,
  Edit2,
  Trash2,
  GripVertical,
  Loader2,
  Info,
  MapPin,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Layers,
  Lock,
  FileText,
  Tag,
  Sprout,
  Link2,
  ExternalLink,
} from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
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
  listTiposLocal,
  createCategoria,
  updateCategoria,
  deleteCategoria,
  reorderCategorias,
  createTipo,
  updateTipo,
  deleteTipo,
  reorderTipos,
  createDetalhe,
  updateDetalhe,
  deleteDetalhe,
  reorderDetalhes,
  seedDetalhes,
  type TipoLocalCategoria,
  type TipoLocalItem,
  type TipoLocalDetalhe,
} from '../lib/api/tiposLocalClient';
import {
  listEspeciesForrageiras,
  type EspecieForrageira,
} from '../lib/api/especiesForrageirasClient';
import { TIPO_ICON_PRESETS, TipoIcon } from './tiposLocalIcons';

// ── Constants & helpers ─────────────────────────────────────────────────────────

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
const labelCls = 'mb-1 block text-[12.5px] font-semibold text-gray-700';

const COLOR_PRESETS = [
  '#16a34a', '#15803d', '#ca8a04', '#d97706', '#0e7490',
  '#2563eb', '#0d9488', '#9333ea', '#dc2626', '#6b7280',
];

const FALLBACK_COR = '#6b7280';

const norm = (nome: string) => nome.trim().toLowerCase();

// Tipos do sistema que não podem ser excluídos (nome normalizado).
// Espelha TIPOS_PROTEGIDOS do repo (src/DB/repositories/tipos-local.ts) — manter em sincronia.
const TIPOS_PROTEGIDOS = new Set(['pastagem cultivada', 'forrageira de corte/silagem/feno']);
const isTipoProtegido = (nome: string) => TIPOS_PROTEGIDOS.has(norm(nome));

// "Pastagem cultivada": 3º nível é um ESPELHO read-only de TODAS as espécies forrageiras.
const isTipoEspeciesMirror = (nome: string) => norm(nome) === 'pastagem cultivada';

// "Forrageira de corte/Silagem/Feno" (e o legado "Capineira / forrageira de corte"):
// 3º nível é um SELETOR — o usuário escolhe quais espécies forrageiras vincular; cada
// escolha vira um tipo_local_detalhes (subconjunto curado, editável/reordenável).
const TIPOS_SELETOR_ESPECIE = new Set([
  'forrageira de corte/silagem/feno',
  'capineira / forrageira de corte',
]);
const isTipoSeletorEspecie = (nome: string) => TIPOS_SELETOR_ESPECIE.has(norm(nome));

interface Props {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onBack?: () => void;
  /** Navega para a tela "Espécies Forrageiras" (botão Adicionar de "Pastagem cultivada"). */
  onNavigateToEspecies?: () => void;
  theme?: 'light' | 'dark';
}

// ── Sortable Row (um detalhe — 3º nível — dentro de um tipo) ─────────────────────

interface DetalheRowProps {
  detalhe: TipoLocalDetalhe;
  onSave: (id: string, nome: string) => void;
  onDelete: (id: string) => void;
}

const DetalheRow: React.FC<DetalheRowProps> = ({ detalhe, onSave, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: detalhe.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(detalhe.nome);

  const startEdit = () => {
    setVal(detalhe.nome);
    setEditing(true);
  };
  const commit = () => {
    const clean = val.trim();
    if (clean && clean !== detalhe.nome) onSave(detalhe.id, clean);
    setEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-white"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-[#16A34A]"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
      {editing ? (
        <input
          type="text"
          value={val}
          autoFocus
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { setVal(detalhe.nome); setEditing(false); }
          }}
          className="h-7 flex-1 rounded-md border border-[#16a34a] bg-white px-2 text-[12.5px] text-gray-800 focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="min-w-0 flex-1 truncate text-left text-[12.5px] text-[#0F172A] hover:text-[#16A34A]"
          title="Clique para renomear"
        >
          {detalhe.nome}
        </button>
      )}
      <button
        type="button"
        onClick={startEdit}
        className="rounded p-1 text-gray-300 transition-all hover:bg-[#E7F6EC] hover:text-[#16A34A]"
        title="Renomear"
      >
        <Edit2 size={12} />
      </button>
      <button
        type="button"
        onClick={() => onDelete(detalhe.id)}
        className="rounded p-1 text-gray-300 transition-all hover:bg-red-50 hover:text-[#DC2626]"
        title="Excluir"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
};

// ── Gerenciador do 3º nível (reusado: linha do tipo em Registros + form de edição) ─

interface DetalheManagerProps {
  tipoId: string;
  detalhes: TipoLocalDetalhe[];
  onAddDetalhe: (tipoId: string, nome: string) => void;
  onEditDetalhe: (id: string, nome: string) => void;
  onDeleteDetalhe: (id: string) => void;
  onReorderDetalhes: (tipoId: string, ordered: TipoLocalDetalhe[]) => void;
  onSeedDetalhes: (tipoId: string) => void;
  /** Quando fornecido, habilita o SELETOR de Espécies Forrageiras (catálogo da org). */
  especies?: EspecieForrageira[];
  /** Abre o cadastro de Espécies Forrageiras (link "cadastrar nova espécie"). */
  onNavigateToEspecies?: () => void;
}

const DetalheManager: React.FC<DetalheManagerProps> = ({
  tipoId, detalhes, onAddDetalhe, onEditDetalhe, onDeleteDetalhe, onReorderDetalhes, onSeedDetalhes,
  especies, onNavigateToEspecies,
}) => {
  const [novoDetalhe, setNovoDetalhe] = useState('');
  const [especieSel, setEspecieSel] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Modo seletor: lista espécies forrageiras do catálogo para o usuário vincular.
  const seletorEspecie = !!especies;
  const especiesDisponiveis = useMemo(() => {
    if (!especies) return [];
    const vinculadas = new Set(detalhes.map((d) => d.nome.trim().toLowerCase()));
    return especies.filter((e) => !vinculadas.has(e.nome.trim().toLowerCase()));
  }, [especies, detalhes]);

  const submitEspecie = () => {
    const nome = especieSel.trim();
    if (!nome) return;
    onAddDetalhe(tipoId, nome);
    setEspecieSel('');
  };

  const handleDetalheDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = detalhes.findIndex((d) => d.id === String(active.id));
    const newIndex = detalhes.findIndex((d) => d.id === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = [...detalhes];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    onReorderDetalhes(tipoId, reordered);
  };

  const submitNovo = () => {
    const clean = novoDetalhe.trim();
    if (!clean) return;
    onAddDetalhe(tipoId, clean);
    setNovoDetalhe('');
  };

  return (
    <div className="rounded-lg border border-[#F1F5F9] bg-[#FAFAFA]">
      <div className="flex items-center justify-between gap-2 border-b border-[#F1F5F9] px-2.5 py-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Detalhamento</span>
        {!seletorEspecie && (
          <button
            type="button"
            onClick={() => onSeedDetalhes(tipoId)}
            className="flex items-center gap-1 rounded-md border border-[#bbf7d0] bg-[#F0FDF4] px-2 py-1 text-[10.5px] font-bold text-[#15803d] transition-colors hover:bg-[#dcfce7]"
            title="Carregar itens sugeridos para este tipo"
          >
            <Sparkles size={12} /> Carregar pré-cadastrados
          </button>
        )}
      </div>

      {/* Seletor de Espécies Forrageiras (só para tipos vinculados ao catálogo) */}
      {seletorEspecie && (
        <div className="border-b border-[#F1F5F9] bg-[#F0FDF4]/40 px-2.5 py-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Sprout size={12} className="text-[#15803d]" />
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#15803d]">
              Vincular espécie forrageira
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={especieSel}
              onChange={(e) => setEspecieSel(e.target.value)}
              disabled={especiesDisponiveis.length === 0}
              className="h-8 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-[12.5px] text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[2px] focus:ring-[#16a34a]/15 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">
                {especiesDisponiveis.length > 0
                  ? '— Selecionar espécie forrageira —'
                  : especies!.length === 0
                    ? 'Nenhuma espécie cadastrada'
                    : 'Todas as espécies já vinculadas'}
              </option>
              {especiesDisponiveis.map((e) => (
                <option key={e.id} value={e.nome}>
                  {e.nome}{e.nomeCientifico ? ` — ${e.nomeCientifico}` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={submitEspecie}
              disabled={!especieSel}
              className="flex h-8 items-center gap-1 rounded-lg bg-[#16A34A] px-2.5 text-[12px] font-bold text-white transition-all hover:bg-[#15803D] disabled:opacity-40"
            >
              <Plus size={13} /> Vincular
            </button>
          </div>
          {onNavigateToEspecies && (
            <button
              type="button"
              onClick={onNavigateToEspecies}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#15803d] hover:underline"
            >
              <Plus size={11} /> Cadastrar nova espécie forrageira <ExternalLink size={10} className="opacity-70" />
            </button>
          )}
        </div>
      )}

      {detalhes.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDetalheDragEnd}>
          <SortableContext items={detalhes.map((d) => d.id)} strategy={verticalListSortingStrategy}>
            <div className="px-1 py-0.5">
              {detalhes.map((d) => (
                <DetalheRow key={d.id} detalhe={d} onSave={onEditDetalhe} onDelete={onDeleteDetalhe} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="px-2.5 py-2 text-[11.5px] text-gray-400">
          {seletorEspecie
            ? 'Nenhuma espécie vinculada ainda. Selecione uma espécie forrageira acima.'
            : 'Nenhum detalhe ainda. Use “Carregar pré-cadastrados” ou adicione abaixo.'}
        </div>
      )}

      {/* Adicionar detalhe livre (inline) — também serve p/ itens fora do catálogo */}
      <div className="flex items-center gap-1.5 px-2.5 py-2">
        <input
          type="text"
          value={novoDetalhe}
          onChange={(e) => setNovoDetalhe(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitNovo(); } }}
          placeholder={seletorEspecie ? 'Outro item (texto livre)…' : 'Adicionar detalhe (ex.: Capim-Marandu)…'}
          className="h-8 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 text-[12.5px] text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[2px] focus:ring-[#16a34a]/15"
        />
        <button
          type="button"
          onClick={submitNovo}
          disabled={!novoDetalhe.trim()}
          className="flex h-8 items-center gap-1 rounded-lg bg-[#16A34A] px-2.5 text-[12px] font-bold text-white transition-all hover:bg-[#15803D] disabled:opacity-40"
        >
          <Plus size={13} /> Add
        </button>
      </div>
    </div>
  );
};

// ── Espelho read-only das Espécies Forrageiras (3º nível de "Pastagem cultivada") ─
// O detalhamento de "Pastagem cultivada" é VINCULADO ao cadastro de Espécies
// Forrageiras: a lista abaixo reflete aquele cadastro (na mesma ordem) e não é
// editável aqui — para alterar, use a tela "Espécies Forrageiras".

interface EspeciesForrageirasMirrorProps {
  especies: EspecieForrageira[];
  /** Abre a tela "Espécies Forrageiras" (botão Adicionar). Sem ele, o botão some. */
  onAdd?: () => void;
}

const EspeciesForrageirasMirror: React.FC<EspeciesForrageirasMirrorProps> = ({ especies, onAdd }) => (
  <div className="rounded-lg border border-[#bbf7d0] bg-[#F0FDF4]/50">
    <div className="flex items-center gap-1.5 border-b border-[#dcfce7] px-2.5 py-1.5">
      <Link2 size={12} className="text-[#15803d]" />
      <span className="text-[11px] font-bold uppercase tracking-wide text-[#15803d]">
        Vinculado ao cadastro de Espécies Forrageiras
      </span>
    </div>

    {especies.length === 0 ? (
      <div className="px-2.5 py-2 text-[11.5px] text-gray-400">
        Nenhuma espécie cadastrada. Use “Adicionar espécie forrageira” para cadastrar — elas aparecem aqui automaticamente.
      </div>
    ) : (
      <div className="px-1 py-0.5">
        {especies.map((e) => (
          <div key={e.id} className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <Sprout size={13} className="shrink-0 text-[#16a34a]" />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#0F172A]">
              {e.nome}
              {e.nomeCientifico && (
                <span className="ml-1.5 text-[11px] italic text-gray-400">{e.nomeCientifico}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    )}

    <div className="border-t border-[#dcfce7] px-2.5 py-1.5 text-[11px] leading-snug text-gray-400">
      Lista somente-leitura. Adicione, renomeie, reordene ou remova espécies na tela “Espécies Forrageiras”.
    </div>

    {onAdd && (
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-1.5 border-t border-[#dcfce7] py-2 text-[12px] font-semibold text-[#15803d] transition-colors hover:bg-[#dcfce7]"
        title="Abrir o cadastro de Espécies Forrageiras"
      >
        <Plus size={14} /> Adicionar espécie forrageira <ExternalLink size={12} className="opacity-70" />
      </button>
    )}
  </div>
);

// ── Sortable Row (um tipo dentro de uma categoria) ──────────────────────────────

interface TipoRowProps {
  tipo: TipoLocalItem;
  cor: string;
  detalhes: TipoLocalDetalhe[];
  /** Espécies forrageiras da org — só usadas no espelho de "Pastagem cultivada". */
  especies: EspecieForrageira[];
  /** Abre o cadastro de Espécies Forrageiras (botão Adicionar do espelho). */
  onNavigateToEspecies?: () => void;
  onEdit: (t: TipoLocalItem) => void;
  onDelete: (id: string) => void;
  onAddDetalhe: (tipoId: string, nome: string) => void;
  onEditDetalhe: (id: string, nome: string) => void;
  onDeleteDetalhe: (id: string) => void;
  onReorderDetalhes: (tipoId: string, ordered: TipoLocalDetalhe[]) => void;
  onSeedDetalhes: (tipoId: string) => void;
}

const TipoRow: React.FC<TipoRowProps> = ({
  tipo, cor, detalhes, especies, onNavigateToEspecies, onEdit, onDelete,
  onAddDetalhe, onEditDetalhe, onDeleteDetalhe, onReorderDetalhes, onSeedDetalhes,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tipo.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const [expanded, setExpanded] = useState(false);

  // 3º nível vinculado às Espécies Forrageiras:
  //  • "Pastagem cultivada" → espelho read-only de TODAS as espécies.
  //  • "Forrageira de corte/Silagem/Feno" → seletor (subconjunto curado em detalhes).
  const mirror = isTipoEspeciesMirror(tipo.nome);
  const seletor = isTipoSeletorEspecie(tipo.nome);
  const detCount = mirror ? especies.length : detalhes.length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border-b border-[#F1F5F9] last:border-b-0"
    >
      <div className="flex items-center gap-2 px-2 py-2.5 transition-colors hover:bg-[#F9FAFB]">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-[#16A34A]"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`rounded p-0.5 text-gray-300 transition-all hover:text-[#16A34A] ${expanded ? 'rotate-90 text-[#16A34A]' : ''}`}
          title={expanded ? 'Recolher detalhamento' : 'Detalhar (3º nível)'}
        >
          <ChevronRight size={15} />
        </button>
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[15px] text-[#0F172A]"
          style={{ backgroundColor: `${cor}1a` }}
          title={cor}
        >
          <TipoIcon
            name={tipo.icone}
            size={15}
            fallback={<span className="h-2 w-2 rounded-full" style={{ backgroundColor: cor }} />}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-semibold text-[#0F172A]">{tipo.nome}</span>
            {detCount > 0 && (
              <span className="shrink-0 rounded-full bg-[#F0FDF4] px-1.5 text-[10.5px] font-bold text-[#15803d]">
                {detCount}
              </span>
            )}
          </div>
          {tipo.descricao && (
            <div className="truncate text-[11.5px] text-gray-400">{tipo.descricao}</div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(tipo)}
            className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-[#E7F6EC] hover:text-[#16A34A]"
          >
            <Edit2 size={14} />
          </button>
          {isTipoProtegido(tipo.nome) ? (
            <span
              className="grid place-items-center p-1.5 text-gray-300"
              title="Tipo do sistema — não pode ser excluído"
            >
              <Lock size={14} />
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onDelete(tipo.id)}
              className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-red-50 hover:text-[#DC2626]"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 3º nível: detalhamento do tipo (espelho ou seletor de Espécies Forrageiras) */}
      {expanded && (
        <div className="mb-2 ml-9 mr-2">
          {mirror ? (
            <EspeciesForrageirasMirror especies={especies} onAdd={onNavigateToEspecies} />
          ) : (
            <DetalheManager
              tipoId={tipo.id}
              detalhes={detalhes}
              onAddDetalhe={onAddDetalhe}
              onEditDetalhe={onEditDetalhe}
              onDeleteDetalhe={onDeleteDetalhe}
              onReorderDetalhes={onReorderDetalhes}
              onSeedDetalhes={onSeedDetalhes}
              especies={seletor ? especies : undefined}
              onNavigateToEspecies={seletor ? onNavigateToEspecies : undefined}
            />
          )}
        </div>
      )}
    </div>
  );
};

// ── Seção de uma categoria (cabeçalho + lista DnD de tipos) ──────────────────────

interface CategoriaSectionProps {
  categoria: TipoLocalCategoria;
  tipos: TipoLocalItem[];
  detalhesPorTipo: Record<string, TipoLocalDetalhe[]>;
  especies: EspecieForrageira[];
  onNavigateToEspecies?: () => void;
  isFirst: boolean;
  isLast: boolean;
  onMove: (id: string, dir: -1 | 1) => void;
  onEditCategoria: (c: TipoLocalCategoria) => void;
  onDeleteCategoria: (c: TipoLocalCategoria) => void;
  onEditTipo: (t: TipoLocalItem) => void;
  onDeleteTipo: (id: string) => void;
  onReorderTipos: (categoriaId: string, ordered: TipoLocalItem[]) => void;
  onAddTipo: (categoriaId: string) => void;
  onAddDetalhe: (tipoId: string, nome: string) => void;
  onEditDetalhe: (id: string, nome: string) => void;
  onDeleteDetalhe: (id: string) => void;
  onReorderDetalhes: (tipoId: string, ordered: TipoLocalDetalhe[]) => void;
  onSeedDetalhes: (tipoId: string) => void;
}

const CategoriaSection: React.FC<CategoriaSectionProps> = ({
  categoria, tipos, detalhesPorTipo, especies, onNavigateToEspecies, isFirst, isLast, onMove,
  onEditCategoria, onDeleteCategoria, onEditTipo, onDeleteTipo, onReorderTipos, onAddTipo,
  onAddDetalhe, onEditDetalhe, onDeleteDetalhe, onReorderDetalhes, onSeedDetalhes,
}) => {
  const cor = categoria.cor || FALLBACK_COR;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tipos.findIndex((t) => t.id === String(active.id));
    const newIndex = tipos.findIndex((t) => t.id === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = [...tipos];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    onReorderTipos(categoria.id, reordered);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
      {/* Cabeçalho da categoria */}
      <div
        className="flex items-center gap-2.5 px-3 py-2.5"
        style={{ backgroundColor: `${cor}12`, borderBottom: `2px solid ${cor}` }}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[17px] text-[#0F172A]" style={{ backgroundColor: `${cor}26` }}>
          <TipoIcon name={categoria.icone} size={16} fallback={<Tag size={15} style={{ color: cor }} />} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-[#0F172A]">{categoria.nome}</div>
          <div className="text-[11px] font-semibold text-gray-400">
            {tipos.length} {tipos.length === 1 ? 'tipo' : 'tipos'}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={isFirst}
            onClick={() => onMove(categoria.id, -1)}
            className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-white/70 hover:text-[#0F172A] disabled:opacity-25"
            title="Mover para cima"
          >
            <ChevronUp size={15} />
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={() => onMove(categoria.id, 1)}
            className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-white/70 hover:text-[#0F172A] disabled:opacity-25"
            title="Mover para baixo"
          >
            <ChevronDown size={15} />
          </button>
          <button
            type="button"
            onClick={() => onEditCategoria(categoria)}
            className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-white/70 hover:text-[#16A34A]"
            title="Renomear categoria"
          >
            <Edit2 size={14} />
          </button>
          <button
            type="button"
            onClick={() => onDeleteCategoria(categoria)}
            className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-white/70 hover:text-[#DC2626]"
            title="Excluir categoria"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Lista de tipos */}
      {tipos.length === 0 ? (
        <div className="px-4 py-4 text-center text-[12.5px] text-gray-400">Nenhum tipo nesta categoria ainda.</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={tipos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <div className="px-1">
              {tipos.map((t) => (
                <TipoRow
                  key={t.id}
                  tipo={t}
                  cor={t.cor || cor}
                  detalhes={detalhesPorTipo[t.id] ?? []}
                  especies={especies}
                  onNavigateToEspecies={onNavigateToEspecies}
                  onEdit={onEditTipo}
                  onDelete={onDeleteTipo}
                  onAddDetalhe={onAddDetalhe}
                  onEditDetalhe={onEditDetalhe}
                  onDeleteDetalhe={onDeleteDetalhe}
                  onReorderDetalhes={onReorderDetalhes}
                  onSeedDetalhes={onSeedDetalhes}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <button
        type="button"
        onClick={() => onAddTipo(categoria.id)}
        className="flex w-full items-center justify-center gap-1.5 border-t border-[#F1F5F9] py-2 text-[12px] font-semibold text-gray-400 transition-colors hover:bg-[#F0FDF4] hover:text-[#16A34A]"
      >
        <Plus size={14} /> Adicionar tipo nesta categoria
      </button>
    </div>
  );
};

// ── Picker de cor (presets + nativo + herdar) ───────────────────────────────────

const ColorPicker: React.FC<{ value: string; onChange: (v: string) => void; allowInherit?: boolean }> = ({
  value, onChange, allowInherit,
}) => (
  <div className="flex flex-wrap items-center gap-1.5">
    {allowInherit && (
      <button
        type="button"
        onClick={() => onChange('')}
        className={`h-7 rounded-lg border px-2 text-[11px] font-semibold transition-all ${
          !value ? 'border-[#16a34a] bg-[#F0FDF4] text-[#15803d]' : 'border-gray-200 text-gray-500 hover:border-gray-300'
        }`}
      >
        Herdar
      </button>
    )}
    {COLOR_PRESETS.map((c) => (
      <button
        key={c}
        type="button"
        onClick={() => onChange(c)}
        className={`h-7 w-7 rounded-lg border-2 transition-all ${value === c ? 'border-[#0F172A] scale-110' : 'border-transparent'}`}
        style={{ backgroundColor: c }}
        title={c}
      />
    ))}
    <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-lg border border-dashed border-gray-300">
      <input
        type="color"
        value={value || FALLBACK_COR}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <span className="grid h-full w-full place-items-center text-gray-400">
        <Plus size={13} />
      </span>
    </label>
  </div>
);

// ── Picker de ícone (lucide, preto-e-branco) ─────────────────────────────────────

const IconePicker: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 bg-gray-50 text-[#0F172A]">
        <TipoIcon name={value} size={18} fallback={<span className="text-[11px] text-gray-300">—</span>} />
      </span>
      {value && (
        <button type="button" onClick={() => onChange('')} className="text-[11px] font-semibold text-gray-400 hover:text-[#DC2626]">
          Limpar
        </button>
      )}
    </div>
    <div className="flex max-h-44 flex-wrap gap-1 overflow-y-auto pr-1">
      {TIPO_ICON_PRESETS.map(({ name, label, Icon }) => (
        <button
          key={name}
          type="button"
          title={label}
          aria-label={label}
          onClick={() => onChange(name)}
          className={`grid h-8 w-8 place-items-center rounded-lg border text-[#0F172A] transition-all ${
            value === name ? 'border-[#16a34a] bg-[#F0FDF4]' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

const TiposLocalManagement: React.FC<Props> = ({ onToast, onBack, onNavigateToEspecies }) => {
  const { user } = useAuth();
  const { selectedClient } = useClient();
  const organizationId = selectedClient?.id ?? user?.organizationId ?? '';

  const [categorias, setCategorias] = useState<TipoLocalCategoria[]>([]);
  const [tipos, setTipos] = useState<TipoLocalItem[]>([]);
  const [detalhes, setDetalhes] = useState<TipoLocalDetalhe[]>([]);
  // Espécies forrageiras: fonte única do 3º nível de "Pastagem cultivada".
  const [especies, setEspecies] = useState<EspecieForrageira[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aba, setAba] = useState<'lancar' | 'registros'>('registros');

  // Form do TIPO
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [cor, setCor] = useState('');
  const [icone, setIcone] = useState('');
  const [descricao, setDescricao] = useState('');

  // Modal de categoria
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catEditingId, setCatEditingId] = useState<string | null>(null);
  const [catNome, setCatNome] = useState('');
  const [catCor, setCatCor] = useState('');
  const [catIcone, setCatIcone] = useState('');
  const [catSaving, setCatSaving] = useState(false);

  // Confirmações de exclusão
  const [deleteTipoId, setDeleteTipoId] = useState<string | null>(null);
  const [deleteDetalheId, setDeleteDetalheId] = useState<string | null>(null);
  const [deleteCat, setDeleteCat] = useState<TipoLocalCategoria | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const [data, esp] = await Promise.all([
        listTiposLocal(organizationId),
        // Espelho de "Pastagem cultivada"; falha aqui não derruba os tipos.
        listEspeciesForrageiras(organizationId).catch(() => [] as EspecieForrageira[]),
      ]);
      setCategorias(data.categorias);
      setTipos(data.tipos);
      setDetalhes(data.detalhes ?? []);
      setEspecies(esp);
      setCategoriaId((prev) => prev || data.categorias[0]?.id || '');
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao carregar tipos de locais', 'error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, onToast]);

  useEffect(() => {
    load();
  }, [load]);

  const tiposPorCategoria = useMemo(() => {
    const map: Record<string, TipoLocalItem[]> = {};
    for (const c of categorias) map[c.id] = [];
    for (const t of tipos) (map[t.categoriaId] ??= []).push(t);
    return map;
  }, [categorias, tipos]);

  const detalhesPorTipo = useMemo(() => {
    const map: Record<string, TipoLocalDetalhe[]> = {};
    for (const t of tipos) map[t.id] = [];
    for (const d of detalhes) (map[d.tipoId] ??= []).push(d);
    return map;
  }, [tipos, detalhes]);

  // ── Form helpers (TIPO) ──────────────────────────────────────────────────────
  const limpar = useCallback(() => {
    setEditingId(null);
    setNome('');
    setCor('');
    setIcone('');
    setDescricao('');
    setCategoriaId((prev) => prev || categorias[0]?.id || '');
  }, [categorias]);

  const startEditTipo = useCallback((t: TipoLocalItem) => {
    setEditingId(t.id);
    setNome(t.nome);
    setCategoriaId(t.categoriaId);
    setCor(t.cor ?? '');
    setIcone(t.icone ?? '');
    setDescricao(t.descricao ?? '');
    setAba('lancar');
  }, []);

  const startAddTipo = useCallback((catId: string) => {
    setEditingId(null);
    setNome('');
    setCor('');
    setIcone('');
    setDescricao('');
    setCategoriaId(catId);
    setAba('lancar');
  }, []);

  const salvarTipo = useCallback(async () => {
    const clean = nome.trim();
    if (!clean) {
      onToast?.('Informe o nome do tipo de local', 'error');
      return;
    }
    if (!categoriaId) {
      onToast?.('Selecione uma categoria (ou crie uma)', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nome: clean,
        categoriaId,
        cor: cor.trim() || null,
        icone: icone.trim() || null,
        descricao: descricao.trim() || null,
      };
      if (editingId) {
        await updateTipo(editingId, payload);
        onToast?.('Tipo de local atualizado', 'success');
      } else {
        await createTipo({ organizationId, ...payload });
        onToast?.('Tipo de local salvo', 'success');
      }
      limpar();
      await load();
      setAba('registros');
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar tipo de local', 'error');
    } finally {
      setSaving(false);
    }
  }, [nome, categoriaId, cor, icone, descricao, editingId, organizationId, onToast, limpar, load]);

  const handleDeleteTipo = async () => {
    if (!deleteTipoId) return;
    try {
      await deleteTipo(deleteTipoId);
      onToast?.('Tipo de local removido', 'success');
      if (editingId === deleteTipoId) limpar();
      setDeleteTipoId(null);
      await load();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao excluir tipo de local', 'error');
    }
  };

  // ── Reorder tipos (dentro de uma categoria) ──────────────────────────────────
  const handleReorderTipos = useCallback(async (catId: string, ordered: TipoLocalItem[]) => {
    // Atualização otimista: substitui os tipos dessa categoria pela nova ordem.
    setTipos((prev) => {
      const others = prev.filter((t) => t.categoriaId !== catId);
      const renum = ordered.map((t, i) => ({ ...t, ordem: i }));
      return [...others, ...renum];
    });
    try {
      await reorderTipos(ordered.map((t, i) => ({ id: t.id, ordem: i })));
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao reordenar', 'error');
      await load();
    }
  }, [onToast, load]);

  // ── Detalhes (3º nível) ───────────────────────────────────────────────────────
  const handleAddDetalhe = useCallback(async (tipoId: string, nomeRaw: string) => {
    const clean = nomeRaw.trim();
    if (!clean) return;
    try {
      const novo = await createDetalhe({ organizationId, tipoId, nome: clean });
      setDetalhes((prev) => [...prev, novo]);
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao adicionar detalhe', 'error');
    }
  }, [organizationId, onToast]);

  const handleEditDetalhe = useCallback(async (id: string, nomeRaw: string) => {
    const clean = nomeRaw.trim();
    if (!clean) return;
    try {
      const upd = await updateDetalhe(id, { nome: clean });
      setDetalhes((prev) => prev.map((d) => (d.id === id ? upd : d)));
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar detalhe', 'error');
    }
  }, [onToast]);

  const handleDeleteDetalhe = async () => {
    if (!deleteDetalheId) return;
    try {
      await deleteDetalhe(deleteDetalheId);
      setDetalhes((prev) => prev.filter((d) => d.id !== deleteDetalheId));
      setDeleteDetalheId(null);
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao excluir detalhe', 'error');
    }
  };

  const handleReorderDetalhes = useCallback(async (tipoId: string, ordered: TipoLocalDetalhe[]) => {
    // Atualização otimista: substitui os detalhes desse tipo pela nova ordem.
    setDetalhes((prev) => {
      const others = prev.filter((d) => d.tipoId !== tipoId);
      const renum = ordered.map((d, i) => ({ ...d, ordem: i }));
      return [...others, ...renum];
    });
    try {
      await reorderDetalhes(ordered.map((d, i) => ({ id: d.id, ordem: i })));
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao reordenar', 'error');
      await load();
    }
  }, [onToast, load]);

  const handleSeedDetalhes = useCallback(async (tipoId: string) => {
    try {
      const { inserted, available } = await seedDetalhes(organizationId, tipoId);
      if (inserted > 0) {
        onToast?.(`${inserted} ${inserted === 1 ? 'item adicionado' : 'itens adicionados'}`, 'success');
        await load();
      } else if (available > 0) {
        onToast?.('Os itens pré-cadastrados deste tipo já estão na lista', 'info');
      } else {
        onToast?.('Este tipo não tem itens pré-cadastrados — adicione manualmente', 'info');
      }
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao carregar pré-cadastrados', 'error');
    }
  }, [organizationId, onToast, load]);

  // ── Categorias ────────────────────────────────────────────────────────────────
  // Criação de categoria desabilitada: as categorias do catálogo já cobrem tudo;
  // a UI só permite EDITAR as existentes (openEditCategoria).
  const openEditCategoria = (c: TipoLocalCategoria) => {
    setCatEditingId(c.id);
    setCatNome(c.nome);
    setCatCor(c.cor ?? '');
    setCatIcone(c.icone ?? '');
    setCatModalOpen(true);
  };

  const salvarCategoria = async () => {
    const clean = catNome.trim();
    if (!clean) {
      onToast?.('Informe o nome da categoria', 'error');
      return;
    }
    setCatSaving(true);
    try {
      if (catEditingId) {
        await updateCategoria(catEditingId, { nome: clean, cor: catCor.trim() || null, icone: catIcone.trim() || null });
        onToast?.('Categoria atualizada', 'success');
        await load();
      } else {
        const novo = await createCategoria({ organizationId, nome: clean, cor: catCor.trim() || null, icone: catIcone.trim() || null });
        onToast?.('Categoria criada', 'success');
        await load();
        setCategoriaId(novo.id); // já seleciona no form de tipo
      }
      setCatModalOpen(false);
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar categoria', 'error');
    } finally {
      setCatSaving(false);
    }
  };

  const handleDeleteCategoria = async () => {
    if (!deleteCat) return;
    try {
      await deleteCategoria(deleteCat.id);
      onToast?.('Categoria removida', 'success');
      if (categoriaId === deleteCat.id) setCategoriaId('');
      setDeleteCat(null);
      await load();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao excluir categoria', 'error');
    }
  };

  const moveCategoria = useCallback(async (id: string, dir: -1 | 1) => {
    const idx = categorias.findIndex((c) => c.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= categorias.length) return;
    const reordered = [...categorias];
    [reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]];
    setCategorias(reordered);
    try {
      await reorderCategorias(reordered.map((c, i) => ({ id: c.id, ordem: i })));
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao reordenar categorias', 'error');
      await load();
    }
  }, [categorias, onToast, load]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (!organizationId) {
    return (
      <div className="p-8 text-sm font-semibold text-gray-500">
        Selecione uma organização para gerenciar os tipos de locais.
      </div>
    );
  }

  const totalTipos = tipos.length;
  const canSave = !!nome.trim() && !!categoriaId && !saving;

  // Tipo em edição vinculado às Espécies Forrageiras? (espelho ou seletor)
  const editingTipo = editingId ? tipos.find((t) => t.id === editingId) : null;
  const editingMirror = !!editingTipo && isTipoEspeciesMirror(editingTipo.nome);
  const editingSeletor = !!editingTipo && isTipoSeletorEspecie(editingTipo.nome);

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
            title="Tipos de Locais"
            right={
              <TabSwitch
                tabs={[
                  { id: 'lancar', label: 'Lançamentos', icon: <Plus size={16} /> },
                  { id: 'registros', label: 'Registros', icon: <List size={16} />, badge: totalTipos },
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
              <Info size={15} /> Editando um tipo existente — altere os dados e clique em “Salvar alterações”.
            </div>
          )}

          {/* Nome + Categoria */}
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <label className={labelCls}>Nome <span className="text-[#DC2626]">*</span></label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Pastagem cultivada"
                className={inputCls}
              />
            </div>
            <div className="flex-1">
              <label className={labelCls}>Categoria <span className="text-[#DC2626]">*</span></label>
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className={inputCls}
              >
                {categorias.length === 0 && <option value="">— nenhuma categoria —</option>}
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Cor + Ícone */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className={labelCls}>Cor <span className="font-normal text-gray-400">(opcional — herda da categoria)</span></label>
              <ColorPicker value={cor} onChange={setCor} allowInherit />
            </div>
            <div>
              <label className={labelCls}>Ícone <span className="font-normal text-gray-400">(opcional)</span></label>
              <IconePicker value={icone} onChange={setIcone} />
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className={`${labelCls} flex items-center gap-1.5`}>
              <FileText size={14} className="text-[#16A34A]" /> Descrição <span className="font-normal text-gray-400">(opcional)</span>
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={4}
              placeholder="Observações sobre o tipo de local (uso indicado, manejo, características)…"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15"
            />
          </div>

          {/* Detalhamento (3º nível) — ex.: espécies de uma pastagem, culturas de uma silagem */}
          <div>
            <label className={`${labelCls} flex items-center gap-1.5`}>
              <Layers size={14} className="text-[#16A34A]" /> Detalhamento <span className="font-normal text-gray-400">(3º nível — opcional)</span>
            </label>
            {editingId ? (
              editingMirror ? (
                <EspeciesForrageirasMirror especies={especies} onAdd={onNavigateToEspecies} />
              ) : (
                <>
                  <DetalheManager
                    tipoId={editingId}
                    detalhes={detalhesPorTipo[editingId] ?? []}
                    onAddDetalhe={handleAddDetalhe}
                    onEditDetalhe={handleEditDetalhe}
                    onDeleteDetalhe={(id) => setDeleteDetalheId(id)}
                    onReorderDetalhes={handleReorderDetalhes}
                    onSeedDetalhes={handleSeedDetalhes}
                    especies={editingSeletor ? especies : undefined}
                    onNavigateToEspecies={editingSeletor ? onNavigateToEspecies : undefined}
                  />
                  <p className="mt-1 text-[11.5px] text-gray-400">
                    As alterações de detalhamento são salvas na hora (independente do botão “Salvar alterações”).
                  </p>
                </>
              )
            ) : (
              <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5 text-[12.5px] text-gray-400">
                Salve o tipo primeiro para habilitar o detalhamento (ex.: espécies de uma pastagem, culturas de uma silagem).
              </p>
            )}
          </div>

          <FormActions
            onCancel={limpar}
            onSave={salvarTipo}
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
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center">
              <p className="text-[12.5px] font-semibold text-gray-500">
                {categorias.length} {categorias.length === 1 ? 'categoria' : 'categorias'} · {totalTipos} {totalTipos === 1 ? 'tipo' : 'tipos'}
              </p>
            </div>

            {categorias.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center text-gray-400 shadow-md">
                <MapPin size={48} className="mx-auto mb-4 text-[#16A34A] opacity-30" />
                <p className="text-sm font-semibold text-[#0F172A]">Nenhuma categoria cadastrada.</p>
                <p className="mt-1 text-xs opacity-70">Crie uma categoria para começar a cadastrar tipos de locais.</p>
              </div>
            ) : (
              categorias.map((c, i) => (
                <CategoriaSection
                  key={c.id}
                  categoria={c}
                  tipos={tiposPorCategoria[c.id] ?? []}
                  detalhesPorTipo={detalhesPorTipo}
                  especies={especies}
                  onNavigateToEspecies={onNavigateToEspecies}
                  isFirst={i === 0}
                  isLast={i === categorias.length - 1}
                  onMove={moveCategoria}
                  onEditCategoria={openEditCategoria}
                  onDeleteCategoria={setDeleteCat}
                  onEditTipo={startEditTipo}
                  onDeleteTipo={(id) => setDeleteTipoId(id)}
                  onReorderTipos={handleReorderTipos}
                  onAddTipo={startAddTipo}
                  onAddDetalhe={handleAddDetalhe}
                  onEditDetalhe={handleEditDetalhe}
                  onDeleteDetalhe={(id) => setDeleteDetalheId(id)}
                  onReorderDetalhes={handleReorderDetalhes}
                  onSeedDetalhes={handleSeedDetalhes}
                />
              ))
            )}
          </div>
        )
      )}

      {/* ── Modal de categoria ────────────────────────────────────────────────── */}
      {catModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-black tracking-tight text-[#0F172A]">
              {catEditingId ? 'Editar categoria' : 'Nova categoria'}
            </h3>
            <div className="flex flex-col gap-4">
              <div>
                <label className={labelCls}>Nome <span className="text-[#DC2626]">*</span></label>
                <input
                  type="text"
                  value={catNome}
                  onChange={(e) => setCatNome(e.target.value)}
                  placeholder="Ex.: Pecuária"
                  className={inputCls}
                  autoFocus
                />
              </div>
              <div>
                <label className={labelCls}>Cor</label>
                <ColorPicker value={catCor} onChange={setCatCor} />
              </div>
              <div>
                <label className={labelCls}>Ícone <span className="font-normal text-gray-400">(opcional)</span></label>
                <IconePicker value={catIcone} onChange={setCatIcone} />
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCatModalOpen(false)}
                className="rounded-xl border border-[#E5E7EB] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#6B7280] transition-all hover:bg-[#F9FAFB]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarCategoria}
                disabled={!catNome.trim() || catSaving}
                className="flex items-center gap-2 rounded-xl bg-[#16A34A] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-all hover:bg-[#15803D] disabled:opacity-50"
              >
                {catSaving && <Loader2 size={14} className="animate-spin" />}
                {catEditingId ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmação: excluir tipo ─────────────────────────────────────────── */}
      {deleteTipoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-black tracking-tight text-[#0F172A]">Confirmar Exclusão</h3>
            <p className="mb-6 text-sm leading-relaxed text-[#6B7280]">
              Tem certeza que deseja remover este tipo de local? Esta ação não poderá ser desfeita.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTipoId(null)}
                className="rounded-xl border border-[#E5E7EB] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#6B7280] transition-all hover:bg-[#F9FAFB]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteTipo}
                className="rounded-xl bg-[#DC2626] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-all hover:bg-[#B91C1C]"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmação: excluir detalhe ──────────────────────────────────────── */}
      {deleteDetalheId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-black tracking-tight text-[#0F172A]">Excluir detalhe</h3>
            <p className="mb-6 text-sm leading-relaxed text-[#6B7280]">
              Tem certeza que deseja remover este detalhe? Esta ação não poderá ser desfeita.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteDetalheId(null)}
                className="rounded-xl border border-[#E5E7EB] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#6B7280] transition-all hover:bg-[#F9FAFB]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteDetalhe}
                className="rounded-xl bg-[#DC2626] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-all hover:bg-[#B91C1C]"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmação: excluir categoria (com cascade) ──────────────────────── */}
      {deleteCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-black tracking-tight text-[#0F172A]">Excluir categoria</h3>
            <p className="mb-6 text-sm leading-relaxed text-[#6B7280]">
              Excluir <strong className="text-[#0F172A]">{deleteCat.nome}</strong>
              {(tiposPorCategoria[deleteCat.id]?.length ?? 0) > 0 ? (
                <> também removerá <strong className="text-[#DC2626]">{tiposPorCategoria[deleteCat.id].length} tipo(s)</strong> dentro dela. </>
              ) : (
                <> (sem tipos). </>
              )}
              Esta ação não poderá ser desfeita.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteCat(null)}
                className="rounded-xl border border-[#E5E7EB] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#6B7280] transition-all hover:bg-[#F9FAFB]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteCategoria}
                className="rounded-xl bg-[#DC2626] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-all hover:bg-[#B91C1C]"
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

export default TiposLocalManagement;
