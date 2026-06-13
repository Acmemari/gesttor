import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  List,
  ArrowLeft,
  Edit2,
  Trash2,
  GripVertical,
  Loader2,
  Check,
  X,
  Droplets,
  Lock,
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
import PageHeader from '../components/ui/PageHeader';
import TabSwitch from '../components/ui/TabSwitch';
import FormActions from '../components/ui/FormActions';
import InlineEntryTable, { type Column } from '../components/ui/InlineEntryTable';
import {
  listPadraoRacial,
  createPadraoRacial,
  updatePadraoRacial,
  deletePadraoRacial,
  reorderPadraoRacial,
  type PadraoRacial,
} from '../lib/api/padraoRacialClient';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onBack?: () => void;
  theme?: 'light' | 'dark';
}

/** Registro ainda não persistido, acumulado na régua de lançamento. */
interface DraftPadrao {
  localId: number;
  nome: string;
  classificacao: string | null;
  ceip: boolean;
  grauSangue: string | null;
  observacao: string;
}

/** Padrão Racial — opções exclusivas (selecione apenas uma). */
const CLASSIFICACOES = ['PO', 'PC', 'PA', 'LA', 'Comercial'] as const;
/** Classificações "puras", que permitem CEIP e assumem Grau de Sangue "Puro" por padrão. */
const CLASSIF_PURO = ['PO', 'PC', 'PA', 'LA'];

/** Significado de cada padrão racial — exibido como dica ao passar o mouse. */
const PADRAO_RACIAL_INFO: Record<string, string> = {
  PO: 'Puro de Origem: genealogia conhecida e registrada conforme as regras da ABCZ.',
  PC: 'Puro Controlado: categoria intermediária, com controle genealógico, podendo em certos cruzamentos evoluir para PO.',
  PA: 'Puro por Avaliação: animal aprovado por avaliação racial, normalmente sem genealogia completa para ser PO.',
  LA: 'Livro Aberto: termo tradicional para animais aceitos em registro mesmo sem origem completa conhecida. Em muitos contextos, é usado informalmente como PA.',
  Comercial: 'Animal sem registro genealógico, classificado apenas para fins comerciais.',
  CEIP: 'Programa oficial de melhoramento genético reconhecido pelo MAPA, que certifica animais de corte com desempenho superior dentro de uma população avaliada, por meio do Certificado Especial de Identificação e Produção. Indica mérito genético e produtivo, independentemente de registro genealógico. Pode ser marcado sozinho ou junto de PO, PC, PA ou LA, mas nunca com Comercial.',
};
/** Grau de Sangue — opções da lista suspensa. */
const GRAU_SANGUE_OPTS = [
  'Puro',
  '1/2 sangue',
  '3/4 sangue',
  '5/8 sangue',
  '3/8 sangue',
  '7/8 sangue',
  '15/16 sangue',
] as const;

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
const selectCls =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
const selectCompactCls =
  'h-9 min-w-[140px] px-2 rounded-lg border border-gray-200 bg-white text-[13px] text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
const textareaCls =
  'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15 resize-none';

// ── UI helpers ─────────────────────────────────────────────────────────────────

/** Switch de situação (ativo/inativo). */
const SituacaoSwitch: React.FC<{ checked: boolean; onClick: () => void }> = ({ checked, onClick }) => (
  <div className="flex items-center gap-2.5">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 ${
        checked ? 'bg-[#16A34A]' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
    <span className="text-sm font-semibold text-[#0F172A]">{checked ? 'Ativo' : 'Inativo'}</span>
  </div>
);

/**
 * Grupo de checkboxes do Padrão Racial.
 * PO/PC/LA/Comercial são exclusivos entre si (clicar um desmarca os demais).
 * CEIP fica sempre habilitado: pode ser marcado sozinho ou junto de PO/PC/LA,
 * mas nunca com Comercial (marcar um desmarca o outro).
 */
const PadraoRacialField: React.FC<{
  value: string | null;
  ceip: boolean;
  onChange: (value: string | null, ceip: boolean) => void;
  size?: 'md' | 'sm';
}> = ({ value, ceip, onChange, size = 'md' }) => {
  const box = 'h-4 w-4 rounded border-gray-300 text-[#16a34a] focus:ring-[#16a34a] disabled:opacity-40';
  const txt = size === 'sm' ? 'text-[13px]' : 'text-sm';
  const labelCls = `group relative flex items-center gap-2 ${txt} font-semibold text-gray-700 cursor-pointer select-none`;
  const tipCls =
    'pointer-events-none absolute bottom-full left-0 z-20 mb-2 w-72 rounded-lg bg-[#0F172A] px-3 py-2 text-[11px] font-normal leading-snug text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100';

  const toggle = (c: string) => {
    if (value === c) {
      onChange(null, ceip); // desmarca o padrão racial; CEIP (se marcado) pode ficar sozinho
    } else if (c === 'Comercial') {
      onChange('Comercial', false); // Comercial não combina com CEIP
    } else {
      onChange(c, ceip); // PO/PC/LA combinam com CEIP
    }
  };

  const toggleCeip = (checked: boolean) => {
    // CEIP nunca combina com Comercial: ao marcá-lo, o Comercial é desmarcado.
    if (checked && value === 'Comercial') {
      onChange(null, true);
    } else {
      onChange(value, checked);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {CLASSIFICACOES.map((c) => (
        <label key={c} className={labelCls}>
          <input
            type="checkbox"
            checked={value === c}
            onChange={() => toggle(c)}
            className={box}
          />
          <span className="border-b border-dotted border-gray-300">{c}</span>
          <span role="tooltip" className={tipCls}>{PADRAO_RACIAL_INFO[c]}</span>
        </label>
      ))}
      <label className={labelCls}>
        <input
          type="checkbox"
          checked={ceip}
          onChange={(e) => toggleCeip(e.target.checked)}
          className={box}
        />
        <span className="border-b border-dotted border-gray-300">CEIP</span>
        <span role="tooltip" className={tipCls}>{PADRAO_RACIAL_INFO.CEIP}</span>
      </label>
    </div>
  );
};

/** Lista suspensa do Grau de Sangue. */
const GrauSangueSelect: React.FC<{
  value: string | null;
  onChange: (v: string | null) => void;
  compact?: boolean;
}> = ({ value, onChange, compact }) => (
  <select
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value || null)}
    className={compact ? selectCompactCls : selectCls}
  >
    <option value="">Selecione…</option>
    {GRAU_SANGUE_OPTS.map((g) => (
      <option key={g} value={g}>
        {g}
      </option>
    ))}
  </select>
);

/** Célula com os badges do Padrão Racial + CEIP. */
const PadraoRacialCell: React.FC<{ value: string | null; ceip: boolean }> = ({ value, ceip }) => {
  if (!value && !ceip) return <span className="text-sm text-gray-300">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value && (
        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[#EEF2FF] text-[#4338CA]">
          {value}
        </span>
      )}
      {ceip && (
        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[#FCE7F3] text-[#BE185D]">
          CEIP
        </span>
      )}
    </div>
  );
};

/** Célula com o Grau de Sangue. */
const GrauSangueCell: React.FC<{ value: string | null }> = ({ value }) =>
  value ? (
    <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#F1F5F9] text-[#475569]">
      {value}
    </span>
  ) : (
    <span className="text-sm text-gray-300">—</span>
  );

// ── Sortable Row (aba Registros) ───────────────────────────────────────────────

interface SortableRowProps {
  item: PadraoRacial;
  editing: boolean;
  editNome: string;
  editClassificacao: string | null;
  editCeip: boolean;
  editGrauSangue: string | null;
  editAtivo: boolean;
  onStartEdit: (p: PadraoRacial) => void;
  onChangeEditNome: (v: string) => void;
  onChangeEditClassificacao: (value: string | null, ceip: boolean) => void;
  onChangeEditGrauSangue: (v: string | null) => void;
  onToggleEditAtivo: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onToggleAtivoDirect: (p: PadraoRacial) => void;
}

const SortableRow: React.FC<SortableRowProps> = ({
  item,
  editing,
  editNome,
  editClassificacao,
  editCeip,
  editGrauSangue,
  editAtivo,
  onStartEdit,
  onChangeEditNome,
  onChangeEditClassificacao,
  onChangeEditGrauSangue,
  onToggleEditAtivo,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onToggleAtivoDirect,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: editing,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const isSystem = item.sistema;

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="border-b border-[#E5E7EB] transition-colors duration-150 hover:bg-[#F9FAFB]"
    >
      <td className="px-3 py-3 w-8">
        <button
          type="button"
          disabled={editing}
          className="cursor-grab active:cursor-grabbing transition-colors text-gray-400 hover:text-[#16A34A] disabled:opacity-30"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
      </td>
      <td className="px-4 py-3 text-[#0F172A]">
        {editing ? (
          <input
            type="text"
            autoFocus
            value={editNome}
            onChange={(e) => onChangeEditNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            className={inputCls}
          />
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-bold">{item.nome}</span>
            {isSystem && (
              <span
                title="Registro padrão do sistema — só pode ser ativado/inativado"
                className="inline-flex items-center gap-1 rounded-md bg-[#F1F5F9] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#64748B]"
              >
                <Lock size={10} /> Padrão
              </span>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-[#0F172A]">
        {editing ? (
          <PadraoRacialField
            value={editClassificacao}
            ceip={editCeip}
            onChange={onChangeEditClassificacao}
            size="sm"
          />
        ) : (
          <PadraoRacialCell value={item.classificacao} ceip={item.ceip} />
        )}
      </td>
      <td className="px-4 py-3 text-[#0F172A]">
        {editing ? (
          <GrauSangueSelect value={editGrauSangue} onChange={onChangeEditGrauSangue} compact />
        ) : (
          <GrauSangueCell value={item.grauSangue} />
        )}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <SituacaoSwitch checked={editAtivo} onClick={onToggleEditAtivo} />
        ) : isSystem ? (
          // Registro padrão: situação é editável diretamente (único controle permitido).
          <SituacaoSwitch checked={item.ativo} onClick={() => onToggleAtivoDirect(item)} />
        ) : (
          <span
            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
              item.ativo ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#F3F4F6] text-[#6B7280]'
            }`}
          >
            {item.ativo ? 'Ativo' : 'Inativo'}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {editing ? (
            <>
              <button
                type="button"
                onClick={onSaveEdit}
                className="p-1.5 rounded-lg transition-all text-[#16A34A] hover:bg-[#E7F6EC]"
                title="Salvar"
              >
                <Check size={16} />
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                className="p-1.5 rounded-lg transition-all text-gray-400 hover:text-[#0F172A] hover:bg-gray-100"
                title="Cancelar"
              >
                <X size={16} />
              </button>
            </>
          ) : isSystem ? (
            <span
              title="Registro padrão do sistema não pode ser alterado ou excluído"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-300"
            >
              <Lock size={13} />
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onStartEdit(item)}
                className="p-1.5 rounded-lg transition-all text-gray-400 hover:text-[#16A34A] hover:bg-[#E7F6EC]"
              >
                <Edit2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                className="p-1.5 rounded-lg transition-all text-gray-400 hover:text-[#DC2626] hover:bg-red-50"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const PadraoRacialManagement: React.FC<Props> = ({ onToast, onBack }) => {
  const { user } = useAuth();
  const { selectedClient } = useClient();

  const organizationId = selectedClient?.id ?? user?.organizationId ?? '';

  const [items, setItems] = useState<PadraoRacial[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Régua de lançamento (aba Lançamentos)
  const [aba, setAba] = useState<'lancar' | 'registros'>('lancar');
  const [drafts, setDrafts] = useState<DraftPadrao[]>([]);
  const [nome, setNome] = useState('');
  const [classificacao, setClassificacao] = useState<string | null>(null);
  const [ceip, setCeip] = useState(false);
  const [grauSangue, setGrauSangue] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');
  const draftSeq = useRef(1);

  // Edição inline (aba Registros)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editClassificacao, setEditClassificacao] = useState<string | null>(null);
  const [editCeip, setEditCeip] = useState(false);
  const [editGrauSangue, setEditGrauSangue] = useState<string | null>(null);
  const [editAtivo, setEditAtivo] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Ao escolher PO/PC/LA, o Grau de Sangue assume "Puro" por padrão.
  const aplicarPadraoRacial = useCallback(
    (value: string | null, c: boolean, setClassif: (v: string | null) => void, setC: (v: boolean) => void, setGrau: (v: string | null) => void) => {
      setClassif(value);
      setC(c);
      if (value !== null && CLASSIF_PURO.includes(value)) {
        setGrau('Puro');
      }
    },
    [],
  );

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadItems = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const rows = await listPadraoRacial(organizationId);
      setItems(rows);
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao carregar padrões raciais', 'error');
    } finally {
      setLoading(false);
    }
  }, [organizationId, onToast]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // ── Lançamento inline ───────────────────────────────────────────────────────

  const resetEntrada = useCallback(() => {
    setNome('');
    setClassificacao(null);
    setCeip(false);
    setGrauSangue(null);
    setObservacao('');
  }, []);

  const addDraft = useCallback(() => {
    const clean = nome.trim();
    if (!clean) {
      onToast?.('Informe o nome do registro', 'error');
      return;
    }
    const lower = clean.toLowerCase();
    const dupDraft = drafts.some((d) => d.nome.trim().toLowerCase() === lower);
    const dupSaved = items.some((p) => p.nome.trim().toLowerCase() === lower);
    if (dupDraft || dupSaved) {
      onToast?.('Esse registro já foi adicionado', 'warning');
      return;
    }
    setDrafts((prev) => [
      ...prev,
      {
        localId: draftSeq.current++,
        nome: clean,
        classificacao,
        ceip,
        grauSangue,
        observacao: observacao.trim(),
      },
    ]);
    resetEntrada();
  }, [nome, classificacao, ceip, grauSangue, observacao, drafts, items, onToast, resetEntrada]);

  const removeDraft = useCallback((localId: number) => {
    setDrafts((prev) => prev.filter((d) => d.localId !== localId));
  }, []);

  const cancelLancamento = useCallback(() => {
    setDrafts([]);
    resetEntrada();
  }, [resetEntrada]);

  const salvarLote = useCallback(async () => {
    if (!drafts.length) return;
    setSaving(true);
    try {
      for (const d of drafts) {
        await createPadraoRacial({
          nome: d.nome.trim(),
          classificacao: d.classificacao,
          ceip: d.ceip,
          grauSangue: d.grauSangue,
          observacao: d.observacao || null,
          ativo: true,
          organizationId,
        });
      }
      const n = drafts.length;
      onToast?.(`${n} ${n === 1 ? 'registro salvo' : 'registros salvos'} com sucesso`, 'success');
      setDrafts([]);
      resetEntrada();
      await loadItems();
      setAba('registros');
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar registros', 'error');
      await loadItems();
    } finally {
      setSaving(false);
    }
  }, [drafts, organizationId, onToast, loadItems, resetEntrada]);

  // ── Edição inline (Registros) ───────────────────────────────────────────────

  const startEdit = useCallback((item: PadraoRacial) => {
    if (item.sistema) return; // registro padrão não é editável
    setEditingId(item.id);
    setEditNome(item.nome);
    setEditClassificacao(item.classificacao);
    setEditCeip(item.ceip);
    setEditGrauSangue(item.grauSangue);
    setEditAtivo(item.ativo);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    const clean = editNome.trim();
    if (!clean) {
      onToast?.('Informe o nome do registro', 'error');
      return;
    }
    try {
      await updatePadraoRacial(editingId, {
        nome: clean,
        classificacao: editClassificacao,
        ceip: editCeip,
        grauSangue: editGrauSangue,
        ativo: editAtivo,
      });
      onToast?.('Registro atualizado com sucesso', 'success');
      setEditingId(null);
      await loadItems();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar registro', 'error');
    }
  }, [editingId, editNome, editClassificacao, editCeip, editGrauSangue, editAtivo, onToast, loadItems]);

  // Toggle direto de situação (usado nos registros padrão do sistema).
  const toggleAtivoDirect = useCallback(
    async (item: PadraoRacial) => {
      const novo = !item.ativo;
      setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, ativo: novo } : p)));
      try {
        await updatePadraoRacial(item.id, { ativo: novo });
      } catch (err: any) {
        onToast?.(err.message || 'Erro ao alterar situação', 'error');
        await loadItems();
      }
    },
    [onToast, loadItems],
  );

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deletePadraoRacial(deleteConfirmId);
      onToast?.('Registro removido', 'success');
      setDeleteConfirmId(null);
      await loadItems();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao excluir registro', 'error');
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

      const oldIndex = items.findIndex((p) => p.id === String(active.id));
      const newIndex = items.findIndex((p) => p.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = [...items];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      setItems(reordered);

      const payload = reordered.map((p, i) => ({ id: p.id, ordem: i }));
      try {
        await reorderPadraoRacial(payload);
      } catch (err: any) {
        onToast?.(err.message || 'Erro ao reordenar', 'error');
        await loadItems();
      }
    },
    [items, onToast, loadItems],
  );

  const sortableIds = items.map((p) => p.id);
  const activeDragItem = activeId ? items.find((p) => p.id === activeId) : null;

  // ── Régua de lançamento: colunas ────────────────────────────────────────────

  const draftColumns: Column<DraftPadrao>[] = [
    { key: 'nome', header: 'Nome', render: (d) => <span className="font-semibold text-gray-800">{d.nome}</span> },
    {
      key: 'classificacao',
      header: 'Padrão Racial',
      render: (d) => <PadraoRacialCell value={d.classificacao} ceip={d.ceip} />,
    },
    {
      key: 'grauSangue',
      header: 'Grau de Sangue',
      render: (d) => <GrauSangueCell value={d.grauSangue} />,
    },
    {
      key: 'observacao',
      header: 'Observação',
      render: (d) =>
        d.observacao ? (
          <span className="text-gray-700">{d.observacao}</span>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  if (!organizationId) {
    return (
      <div className="p-8 text-sm font-semibold text-gray-500">
        Selecione uma organização para gerenciar os padrões raciais.
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
            title="Padrão Racial e Grau de Sangue"
            right={
              <TabSwitch
                tabs={[
                  { id: 'lancar', label: 'Lançamentos', icon: <Plus size={16} /> },
                  { id: 'registros', label: 'Registros', icon: <List size={16} />, badge: items.length },
                ]}
                value={aba}
                onChange={(id) => setAba(id as 'lancar' | 'registros')}
              />
            }
          />
        </div>
      </div>

      {aba === 'lancar' ? (
        /* ── Aba Lançamentos: entrada inline (clicar → aparece na régua) ─────── */
        <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5">
          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
              Nome <span className="text-[#DC2626]">*</span>
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addDraft();
              }}
              placeholder="Ex: PO Nelore, 1/2 Sangue Angus, Comercial..."
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-2 block text-[12.5px] font-semibold text-gray-700">Padrão Racial</label>
            <PadraoRacialField
              value={classificacao}
              ceip={ceip}
              onChange={(v, c) => aplicarPadraoRacial(v, c, setClassificacao, setCeip, setGrauSangue)}
            />
            <p className="mt-1.5 text-[11px] text-gray-400">
              Selecione apenas um padrão racial (PO, PC, PA, LA ou Comercial). O CEIP pode ser marcado sozinho ou junto de PO, PC, PA ou LA, mas nunca com Comercial. Passe o mouse sobre cada opção para ver o significado.
            </p>
          </div>

          <div className="max-w-xs">
            <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">Grau de Sangue</label>
            <GrauSangueSelect value={grauSangue} onChange={setGrauSangue} />
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">Observação</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Observação livre sobre o registro (opcional)"
              rows={2}
              className={textareaCls}
            />
          </div>

          {drafts.length > 0 && (
            <InlineEntryTable
              columns={draftColumns}
              rows={drafts}
              rowKey={(d) => d.localId}
              onRemove={(d) => removeDraft(d.localId)}
            />
          )}

          <FormActions
            onCancel={cancelLancamento}
            onSave={salvarLote}
            saveDisabled={drafts.length === 0 || saving}
            saveIcon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}
            status={
              drafts.length ? (
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#16a34a]">
                  <Check size={14} /> {drafts.length} {drafts.length === 1 ? 'registro a salvar' : 'registros a salvar'}
                </span>
              ) : null
            }
          />
        </div>
      ) : (
        /* ── Aba Registros: lista persistida (reorder + edição inline + excluir) ── */
        loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-gray-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 border border-dashed rounded-2xl p-12 shadow-md text-gray-400 border-gray-200 bg-white">
            <Droplets size={48} className="mx-auto mb-4 opacity-30 text-[#16A34A]" />
            <p className="text-sm font-semibold text-[#0F172A]">Nenhum registro cadastrado.</p>
            <p className="text-xs mt-1 opacity-70">Use a aba "Lançamentos" para começar.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#E5E7EB] bg-white overflow-hidden shadow-[0_1px_3px_rgba(16,24,40,0.08)]">
            <div className="max-h-[calc(100vh-220px)] overflow-x-auto overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280] text-[11px] uppercase tracking-wider font-bold">
                  <th className="w-10" />
                  <th className="px-4 py-3.5 text-left">Nome</th>
                  <th className="px-4 py-3.5 text-left">Padrão Racial</th>
                  <th className="px-4 py-3.5 text-left">Grau de Sangue</th>
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
                    {items.map((item) => (
                      <SortableRow
                        key={item.id}
                        item={item}
                        editing={editingId === item.id}
                        editNome={editNome}
                        editClassificacao={editClassificacao}
                        editCeip={editCeip}
                        editGrauSangue={editGrauSangue}
                        editAtivo={editAtivo}
                        onStartEdit={startEdit}
                        onChangeEditNome={setEditNome}
                        onChangeEditClassificacao={(v, c) =>
                          aplicarPadraoRacial(v, c, setEditClassificacao, setEditCeip, setEditGrauSangue)
                        }
                        onChangeEditGrauSangue={setEditGrauSangue}
                        onToggleEditAtivo={() => setEditAtivo((v) => !v)}
                        onSaveEdit={saveEdit}
                        onCancelEdit={cancelEdit}
                        onDelete={(id) => setDeleteConfirmId(id)}
                        onToggleAtivoDirect={toggleAtivoDirect}
                      />
                    ))}
                  </tbody>
                </SortableContext>
                <DragOverlay dropAnimation={null}>
                  {activeDragItem ? (
                    <table className="w-full text-sm bg-white">
                      <tbody>
                        <tr className="shadow-2xl rounded border border-[#E5E7EB] text-[#0F172A] bg-white">
                          <td className="px-3 py-3 w-10">
                            <GripVertical size={16} className="text-[#16A34A]" />
                          </td>
                          <td className="px-4 py-3 text-[#0F172A]">
                            <div className="font-bold">{activeDragItem.nome}</div>
                          </td>
                          <td className="px-4 py-3">
                            <PadraoRacialCell value={activeDragItem.classificacao} ceip={activeDragItem.ceip} />
                          </td>
                          <td className="px-4 py-3">
                            <GrauSangueCell value={activeDragItem.grauSangue} />
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                                activeDragItem.ativo
                                  ? 'bg-[#DCFCE7] text-[#15803D]'
                                  : 'bg-[#F3F4F6] text-[#6B7280]'
                              }`}
                            >
                              {activeDragItem.ativo ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="px-4 py-3" />
                        </tr>
                      </tbody>
                    </table>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </table>
            </div>
            <div className="border-t border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3 text-xs font-semibold leading-relaxed text-[#6B7280]">
              Total: {items.length} {items.length === 1 ? 'registro cadastrado' : 'registros cadastrados'}
            </div>
          </div>
        )
      )}

      {/* ── Delete Confirmation Dialog ─────────────────────────────────────── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-6 max-w-sm w-full shadow-2xl transition-all duration-300">
            <h3 className="text-lg font-black tracking-tight mb-2 text-[#0F172A]">Confirmar Exclusão</h3>
            <p className="text-sm leading-relaxed mb-6 text-[#6B7280]">
              Tem certeza que deseja remover este registro? Esta ação não poderá ser desfeita.
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

export default PadraoRacialManagement;
