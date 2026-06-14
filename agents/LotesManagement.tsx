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
  Pencil,
  Layers,
  Calendar,
  MapPin,
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
import { useHierarchy } from '../contexts/HierarchyContext';
import PageHeader from '../components/ui/PageHeader';
import TabSwitch from '../components/ui/TabSwitch';
import FormActions from '../components/ui/FormActions';
import {
  listLotes,
  createLote,
  updateLote,
  deleteLote,
  reorderLotes,
  type Lote,
} from '../lib/api/lotesClient';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onBack?: () => void;
  theme?: 'light' | 'dark';
}

const toSentenceCase = (s: string): string => {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Formata 'YYYY-MM-DD' para 'DD/MM/AAAA' (sem efeitos de fuso). */
const formatDateBR = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

/** Finalidades do lote — identidade imutável; "Cria" habilita o card reprodutivo na Gestão de Lotes. */
const FINALIDADES = ['Cria', 'Recria', 'Terminação', 'Outra Finalidade'] as const;

/** Retiro da fazenda (Cadastro de Áreas / farm_retiros). */
interface Retiro {
  id: string;
  name: string;
}

/** Lista os retiros de uma fazenda (vazio quando a fazenda não tem retiros). */
function useRetiros(farmId: string): Retiro[] {
  const [retiros, setRetiros] = useState<Retiro[]>([]);
  useEffect(() => {
    if (!farmId) {
      setRetiros([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/farm-locations?farmId=${encodeURIComponent(farmId)}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const rows = (json?.data ?? json) as any[];
        setRetiros(Array.isArray(rows) ? rows.map((x) => ({ id: x.id, name: x.name })) : []);
      })
      .catch(() => {
        if (!cancelled) setRetiros([]);
      });
    return () => {
      cancelled = true;
    };
  }, [farmId]);
  return retiros;
}

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
const textareaCls =
  'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15 resize-none';

// ── Toggle (switch) ─────────────────────────────────────────────────────────────

const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}> = ({ checked, onChange, label }) => (
  <label className="flex items-center gap-2.5 cursor-pointer select-none">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? 'bg-[#16a34a]' : 'bg-gray-300'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
    <span className="text-sm font-semibold text-gray-700">{label}</span>
  </label>
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

// ── Badge de status ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ finalizado: boolean }> = ({ finalizado }) => (
  <span
    className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
      finalizado ? 'bg-gray-100 text-gray-500' : 'bg-[#DCFCE7] text-[#15803D]'
    }`}
  >
    {finalizado ? 'Finalizado' : 'Em andamento'}
  </span>
);

// ── Linha da tabela (master) ────────────────────────────────────────────────────

interface SortableRowProps {
  lote: Lote;
  selected: boolean;
  menuOpen: boolean;
  local: string;
  onSelect: (l: Lote) => void;
  onMenu: (e: React.MouseEvent, id: string) => void;
}

const SortableRow: React.FC<SortableRowProps> = ({ lote, selected, menuOpen, local, onSelect, onMenu }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lote.id,
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
      onClick={() => onSelect(lote)}
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
        {lote.nome}
      </td>
      <td className="p-3 text-gray-600">{local}</td>
      <td className="p-3 text-gray-600 whitespace-nowrap">{formatDateBR(lote.dataInicio)}</td>
      <td className="p-3">
        <StatusBadge finalizado={lote.finalizado} />
      </td>
      <td className="p-3 text-center">
        <button
          type="button"
          onClick={(e) => onMenu(e, lote.id)}
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

const LotesManagement: React.FC<Props> = ({ onToast, onBack }) => {
  const { user } = useAuth();
  const { selectedClient } = useClient();
  const { farms, selectedFarm } = useHierarchy();

  const organizationId = selectedClient?.id ?? user?.organizationId ?? '';

  const farmName = useCallback(
    (id: string | null | undefined) => (id ? farms.find((f) => f.id === id)?.name ?? '—' : '—'),
    [farms],
  );

  const [lotes, setLotes] = useState<Lote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  // Abas Lançamentos / Registros
  const [aba, setAba] = useState<'lancar' | 'registros'>('lancar');

  // Entrada da aba Lançamentos
  const [farmId, setFarmId] = useState('');
  const [retiro, setRetiro] = useState('');
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [finalidade, setFinalidade] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [finalizado, setFinalizado] = useState(false);
  const [descricao, setDescricao] = useState('');
  const nomeRef = useRef<HTMLInputElement>(null);

  const retiros = useRetiros(farmId);

  // Fazenda padrão: a selecionada na hierarquia (ou a única existente).
  useEffect(() => {
    setFarmId((prev) => prev || selectedFarm?.id || (farms.length === 1 ? farms[0].id : ''));
  }, [selectedFarm, farms]);

  // Fazenda com um único retiro: já vem selecionado (não pergunta toda vez).
  useEffect(() => {
    if (retiros.length === 1) setRetiro((prev) => (prev === retiros[0].name ? prev : retiros[0].name));
  }, [retiros]);

  // Detalhamento editável (aba Registros)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = lotes.find((l) => l.id === selectedId) || null;
  const [editFarmId, setEditFarmId] = useState('');
  const [editRetiro, setEditRetiro] = useState('');
  const [editNome, setEditNome] = useState('');
  const [editCodigo, setEditCodigo] = useState('');
  const [editFinalidade, setEditFinalidade] = useState('');
  const [editDataInicio, setEditDataInicio] = useState('');
  const [editFinalizado, setEditFinalizado] = useState(false);
  const [editDescricao, setEditDescricao] = useState('');

  const editRetiros = useRetiros(editFarmId);

  // Fazenda do registro com um único retiro: já vem selecionado na edição.
  useEffect(() => {
    if (editRetiros.length === 1) setEditRetiro((prev) => (prev === editRetiros[0].name ? prev : editRetiros[0].name));
  }, [editRetiros]);

  // Modo de visualização/edição no detalhamento
  const [modo, setModo] = useState<'visualizar' | 'editar'>('visualizar');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleSelectLote = useCallback((l: Lote) => {
    setSelectedId(l.id);
    setModo('visualizar');
  }, []);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadLotes = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const rows = await listLotes(organizationId);
      setLotes(rows);
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao carregar lotes', 'error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, onToast]);

  useEffect(() => {
    loadLotes();
  }, [loadLotes]);

  // Auto-seleciona o primeiro lote e mantém a seleção válida quando a lista muda.
  useEffect(() => {
    setSelectedId((prev) => {
      if (prev && lotes.some((l) => l.id === prev)) return prev;
      return lotes[0]?.id ?? null;
    });
  }, [lotes]);

  useEffect(() => {
    if (selected) {
      setEditFarmId(selected.farmId ?? '');
      setEditRetiro(selected.retiro ?? '');
      setEditNome(selected.nome);
      setEditCodigo(selected.codigo ?? '');
      setEditFinalidade(selected.finalidade ?? '');
      setEditDataInicio(selected.dataInicio);
      setEditFinalizado(selected.finalizado);
      setEditDescricao(selected.descricao ?? '');
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lançamento ──────────────────────────────────────────────────────────────

  const cancelLancamento = useCallback(() => {
    setRetiro('');
    setNome('');
    setCodigo('');
    setFinalidade('');
    setDataInicio('');
    setFinalizado(false);
    setDescricao('');
  }, []);

  const salvar = useCallback(async () => {
    const clean = toSentenceCase(nome);
    if (!clean) {
      onToast?.('Informe o nome do lote', 'error');
      return;
    }
    if (!dataInicio) {
      onToast?.('Informe a data de início', 'error');
      return;
    }
    if (!farmId) {
      onToast?.('Selecione a fazenda do lote', 'error');
      return;
    }
    if (retiros.length > 0 && !retiro) {
      onToast?.('Selecione o retiro do lote', 'error');
      return;
    }
    const lower = clean.toLowerCase();
    if (lotes.some((l) => l.nome.trim().toLowerCase() === lower)) {
      onToast?.('Este lote já está cadastrado', 'warning');
      return;
    }
    setSaving(true);
    try {
      await createLote({
        nome: clean,
        farmId: farmId || null,
        retiro: retiro || null,
        codigo: codigo.trim() || null,
        finalidade: finalidade || null,
        dataInicio,
        finalizado,
        descricao: descricao.trim() || null,
        organizationId,
      });
      onToast?.('Lote salvo com sucesso', 'success');
      cancelLancamento();
      await loadLotes();
      setAba('registros');
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar lote', 'error');
    } finally {
      setSaving(false);
    }
  }, [nome, farmId, retiro, retiros, codigo, finalidade, dataInicio, finalizado, descricao, organizationId, lotes, onToast, loadLotes, cancelLancamento]);

  // ── Edição (detalhamento da aba Registros) ──────────────────────────────────

  const cancelarEdicao = useCallback(() => {
    if (selected) {
      setEditFarmId(selected.farmId ?? '');
      setEditRetiro(selected.retiro ?? '');
      setEditNome(selected.nome);
      setEditCodigo(selected.codigo ?? '');
      setEditFinalidade(selected.finalidade ?? '');
      setEditDataInicio(selected.dataInicio);
      setEditFinalizado(selected.finalizado);
      setEditDescricao(selected.descricao ?? '');
    }
    setModo('visualizar');
  }, [selected]);

  const salvarDetalhe = useCallback(async () => {
    if (!selectedId) return;
    const clean = toSentenceCase(editNome);
    if (!clean) {
      onToast?.('Informe o nome do lote', 'error');
      return;
    }
    if (!editDataInicio) {
      onToast?.('Informe a data de início', 'error');
      return;
    }
    if (!editFarmId) {
      onToast?.('Selecione a fazenda do lote', 'error');
      return;
    }
    if (editRetiros.length > 0 && !editRetiro) {
      onToast?.('Selecione o retiro do lote', 'error');
      return;
    }
    setSaving(true);
    try {
      await updateLote(selectedId, {
        nome: clean,
        farmId: editFarmId || null,
        retiro: editRetiro || null,
        codigo: editCodigo.trim() || null,
        finalidade: editFinalidade || null,
        dataInicio: editDataInicio,
        finalizado: editFinalizado,
        descricao: editDescricao.trim() || null,
      });
      onToast?.('Lote atualizado com sucesso', 'success');
      await loadLotes();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar lote', 'error');
    } finally {
      setSaving(false);
    }
  }, [selectedId, editFarmId, editRetiro, editRetiros, editNome, editCodigo, editFinalidade, editDataInicio, editFinalizado, editDescricao, onToast, loadLotes]);

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteLote(deleteConfirmId);
      onToast?.('Lote removido', 'success');
      setDeleteConfirmId(null);
      await loadLotes();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao excluir lote', 'error');
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

      const oldIndex = lotes.findIndex((l) => l.id === String(active.id));
      const newIndex = lotes.findIndex((l) => l.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = [...lotes];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      setLotes(reordered);

      const items = reordered.map((l, i) => ({ id: l.id, ordem: i }));
      try {
        await reorderLotes(items);
      } catch (err: any) {
        onToast?.(err.message || 'Erro ao reordenar', 'error');
        await loadLotes();
      }
    },
    [lotes, onToast, loadLotes],
  );

  const sortableIds = lotes.map((l) => l.id);
  const activeDragLote = activeId ? lotes.find((l) => l.id === activeId) : null;

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
        Selecione uma organização para gerenciar os lotes.
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
            title="Lotes"
            right={
              <TabSwitch
                tabs={[
                  { id: 'lancar', label: 'Lançamentos', icon: <Plus size={16} /> },
                  { id: 'registros', label: 'Registros', icon: <List size={16} />, badge: lotes.length },
                ]}
                value={aba}
                onChange={(id) => setAba(id as 'lancar' | 'registros')}
              />
            }
          />
        </div>
      </div>

      {aba === 'lancar' ? (
        /* ── Aba Lançamentos: cadastro direto de um lote ─────────────────────── */
        <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          {/* Localização: o lote pertence a uma Fazenda; e a um Retiro quando houver. */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
                Fazenda <span className="text-[#DC2626]">*</span>
              </label>
              <select
                value={farmId}
                onChange={(e) => {
                  setFarmId(e.target.value);
                  setRetiro('');
                }}
                className={inputCls}
              >
                <option value="">Selecione…</option>
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
                Retiro {retiros.length > 0 && <span className="text-[#DC2626]">*</span>}
              </label>
              <select
                value={retiro}
                onChange={(e) => setRetiro(e.target.value)}
                disabled={!farmId || retiros.length === 0}
                className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400`}
              >
                <option value="">
                  {!farmId ? 'Selecione a fazenda' : retiros.length === 0 ? 'Fazenda sem retiros' : '—'}
                </option>
                {retiros.map((r) => (
                  <option key={r.id} value={r.name}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
                Nome <span className="text-[#DC2626]">*</span>
              </label>
              <input
                ref={nomeRef}
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') salvar();
                }}
                placeholder="Nome"
                className={inputCls}
              />
            </div>

            <div className="w-full sm:w-48">
              <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
                Data Início <span className="text-[#DC2626]">*</span>
              </label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className={inputCls}
              />
            </div>

            <div className="pb-2.5">
              <Toggle checked={finalizado} onChange={setFinalizado} label="Lote Finalizado" />
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="w-full sm:w-40">
              <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">Código</label>
              <input
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ex.: RC-01"
                className={`${inputCls} font-mono`}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">Finalidade</label>
              <select value={finalidade} onChange={(e) => setFinalidade(e.target.value)} className={inputCls}>
                <option value="">Selecione…</option>
                {FINALIDADES.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">Descrição</label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva detalhes do lote (opcional)"
              rows={3}
              className={textareaCls}
            />
          </div>

          <FormActions
            onCancel={cancelLancamento}
            onSave={salvar}
            saveDisabled={!nome.trim() || !dataInicio || saving}
            saveIcon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}
          />
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : lotes.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-2xl p-12 shadow-md text-gray-400 border-gray-200 bg-white">
          <Layers size={48} className="mx-auto mb-4 opacity-30 text-[#16A34A]" />
          <p className="text-sm font-semibold text-[#0F172A]">Nenhum lote cadastrado.</p>
          <p className="text-xs mt-1 opacity-70">Use a aba "Lançamentos" para começar.</p>
        </div>
      ) : (
        /* ── Aba Registros: master-detail (50% lista · 50% detalhes) ─────────── */
        <>
        <div className="mb-4">
          <h2 className="text-[17px] font-bold text-gray-900">Todos os lotes — Lotes</h2>
          <p className="mt-0.5 text-[12.5px] text-gray-500">
            Clique em um lote para abri-lo; use ••• para ver ou excluir.
          </p>
        </div>
        <div
          ref={splitRef}
          className="flex h-[calc(100vh-240px)] min-h-[440px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white"
        >
          {/* Master: relação de lotes */}
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
                    <th className="p-3 font-bold">Nome</th>
                    <th className="p-3 font-bold">Fazenda / Retiro</th>
                    <th className="p-3 font-bold">Data Início</th>
                    <th className="p-3 font-bold">Situação</th>
                    <th className="p-3 text-center font-bold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                    {lotes.map((lote) => (
                      <SortableRow
                        key={lote.id}
                        lote={lote}
                        selected={selectedId === lote.id}
                        menuOpen={menu?.id === lote.id}
                        local={lote.farmId ? `${farmName(lote.farmId)}${lote.retiro ? ` · ${lote.retiro}` : ''}` : '—'}
                        onSelect={handleSelectLote}
                        onMenu={toggleMenu}
                      />
                    ))}
                  </SortableContext>
                </tbody>
              </table>
              <DragOverlay dropAnimation={null}>
                {activeDragLote ? (
                  <div className="flex items-center gap-3 rounded border border-[#E5E7EB] bg-white px-4 py-3 shadow-2xl">
                    <GripVertical size={16} className="text-[#16A34A]" />
                    <span className="truncate font-bold text-[#0F172A]">{activeDragLote.nome}</span>
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
            title="Arraste para ajustar o espaço da lista e dos detalhes"
          >
            <span className="h-1 w-10 rounded-full bg-gray-300 transition-colors group-hover:bg-[#16a34a]" />
          </div>

          {/* Detail: detalhes do lote selecionado */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#fafbfc]">
            {selected ? (
              modo === 'visualizar' ? (
                /* ── View Mode ─────────────────────────────────────────────────── */
                <div className="flex flex-1 flex-col gap-4 p-5 animate-in fade-in duration-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        {selected.codigo && (
                          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[12px] font-bold text-gray-700">
                            {selected.codigo}
                          </span>
                        )}
                        <h3 className="text-base font-bold text-gray-900 leading-tight">{selected.nome}</h3>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500">
                        {selected.farmId && (
                          <>
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin size={13} className="text-[#16a34a]" />
                              <span className="text-gray-700">
                                {farmName(selected.farmId)}
                                {selected.retiro ? ` · ${selected.retiro}` : ''}
                              </span>
                            </span>
                            <span className="text-gray-300">|</span>
                          </>
                        )}
                        {selected.finalidade && (
                          <>
                            <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[#2563EB]">{selected.finalidade}</span>
                            <span className="text-gray-300">|</span>
                          </>
                        )}
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar size={13} className="text-[#16a34a]" />
                          Início: <span className="text-gray-700">{formatDateBR(selected.dataInicio)}</span>
                        </span>
                        <span className="text-gray-300">|</span>
                        <StatusBadge finalizado={selected.finalizado} />
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

                  {selected.descricao && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Descrição</span>
                      <p className="text-sm text-gray-800 bg-white rounded-xl p-3.5 border border-gray-100 leading-relaxed shadow-sm whitespace-pre-wrap">
                        {selected.descricao}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                /* ── Edit Mode ─────────────────────────────────────────────────── */
                <div className="flex flex-1 flex-col gap-4 p-5 animate-in fade-in duration-200">
                  <div className="flex justify-between items-start border-b border-gray-100 pb-3">
                    <h3 className="text-base font-bold text-gray-900 leading-tight">Editar Lote</h3>
                  </div>

                  {/* Localização: o lote pertence a uma Fazenda; e a um Retiro quando houver. */}
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
                        Fazenda <span className="text-[#DC2626]">*</span>
                      </label>
                      <select
                        value={editFarmId}
                        onChange={(e) => {
                          setEditFarmId(e.target.value);
                          setEditRetiro('');
                        }}
                        className={inputCls}
                      >
                        <option value="">Selecione…</option>
                        {farms.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
                        Retiro {editRetiros.length > 0 && <span className="text-[#DC2626]">*</span>}
                      </label>
                      <select
                        value={editRetiro}
                        onChange={(e) => setEditRetiro(e.target.value)}
                        disabled={!editFarmId || editRetiros.length === 0}
                        className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400`}
                      >
                        <option value="">
                          {!editFarmId ? 'Selecione a fazenda' : editRetiros.length === 0 ? 'Fazenda sem retiros' : '—'}
                        </option>
                        {editRetiros.map((r) => (
                          <option key={r.id} value={r.name}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
                        Nome <span className="text-[#DC2626]">*</span>
                      </label>
                      <input
                        type="text"
                        value={editNome}
                        onChange={(e) => setEditNome(e.target.value)}
                        placeholder="Nome"
                        className={inputCls}
                      />
                    </div>
                    <div className="w-full sm:w-48">
                      <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
                        Data Início <span className="text-[#DC2626]">*</span>
                      </label>
                      <input
                        type="date"
                        value={editDataInicio}
                        onChange={(e) => setEditDataInicio(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div className="pb-2.5">
                      <Toggle checked={editFinalizado} onChange={setEditFinalizado} label="Lote Finalizado" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                    <div className="w-full sm:w-40">
                      <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">Código</label>
                      <input
                        type="text"
                        value={editCodigo}
                        onChange={(e) => setEditCodigo(e.target.value)}
                        placeholder="Ex.: RC-01"
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">Finalidade</label>
                      <select value={editFinalidade} onChange={(e) => setEditFinalidade(e.target.value)} className={inputCls}>
                        <option value="">Selecione…</option>
                        {FINALIDADES.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[12.5px] font-semibold text-gray-700">Descrição</label>
                    <textarea
                      value={editDescricao}
                      onChange={(e) => setEditDescricao(e.target.value)}
                      placeholder="Descreva detalhes do lote (opcional)"
                      rows={3}
                      className={`${textareaCls} min-h-[60px]`}
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
              Tem certeza que deseja remover este lote? Esta ação não poderá ser desfeita.
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

export default LotesManagement;
