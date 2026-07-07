import React, { useState, useEffect, useCallback, useRef, useMemo, useId } from 'react';
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
  Dna,
  Lock,
  Info,
  Star,
  HelpCircle,
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
  listAnimalBreeds,
  createAnimalBreed,
  updateAnimalBreed,
  deleteAnimalBreed,
  reorderAnimalBreeds,
  type AnimalBreed,
  type ComposicaoComponente,
} from '../lib/api/animalBreedsClient';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onBack?: () => void;
  theme?: 'light' | 'dark';
}

/** Raça ainda não persistida, acumulada na régua de lançamento. */
interface DraftBreed {
  localId: number;
  nome: string;
  codigoAsbia: string;
  composicao: ComposicaoComponente[];
  observacao: string;
}

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
const selectCls =
  'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
const textareaCls =
  'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15 resize-none';

// ── Composição Racial: helpers ──────────────────────────────────────────────────

/** Formata um percentual em pt-BR com 2 casas (ex.: 62.5 → "62,50%"). */
const formatPercent = (n: number): string =>
  `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** Converte texto pt-BR ("62,5") em número (62.5), limitado a 0–100; NaN se inválido. */
const parsePercent = (s: string): number => {
  const n = parseFloat(String(s).replace(',', '.').trim());
  if (!Number.isFinite(n)) return NaN;
  return Math.round(Math.min(Math.max(n, 0), 100) * 100) / 100;
};

/** Soma dos percentuais, arredondada a 2 casas. */
const somaComposicao = (comp: ComposicaoComponente[]): number =>
  Math.round(comp.reduce((s, c) => s + c.percentual, 0) * 100) / 100;

/** Composição válida: ≥1 componente, soma 100% e exatamente uma principal. */
const composicaoValida = (comp: ComposicaoComponente[]): boolean =>
  comp.length > 0 && somaComposicao(comp) === 100 && comp.filter((c) => c.principal).length === 1;

// ── UI helpers ─────────────────────────────────────────────────────────────────

/** Switch de situação (ativa/inativa). */
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
    <span className="text-sm font-semibold text-[#0F172A]">{checked ? 'Ativa' : 'Inativa'}</span>
  </div>
);

/** Célula do código ASBIA/INTERBULL. */
const CodigoCell: React.FC<{ codigo: string | null }> = ({ codigo }) =>
  codigo ? (
    <span className="font-mono text-sm font-bold uppercase tracking-widest text-[#0F172A]">{codigo}</span>
  ) : (
    <span className="text-sm text-gray-300">—</span>
  );

/** Célula com os badges da composição racial (principal destacada). */
const ComposicaoCell: React.FC<{ comp?: ComposicaoComponente[] | null }> = ({ comp }) => {
  if (!comp || comp.length === 0) return <span className="text-sm text-gray-300">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {comp.map((c, i) => (
        <span
          key={`${c.breedId ?? c.nome}-${i}`}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            c.principal
              ? 'bg-[#E7F6EC] text-[#15803D] ring-1 ring-inset ring-[#16A34A]/30'
              : 'bg-[#F1F5F9] text-[#475569]'
          }`}
          title={c.principal ? 'Raça principal' : undefined}
        >
          {c.principal && <Star size={9} className="fill-current" />}
          {c.nome} {formatPercent(c.percentual)}
        </span>
      ))}
    </div>
  );
};

/**
 * Editor da Composição Racial.
 * O usuário escolhe uma raça (do cadastro), informa o percentual e marca a
 * principal; "+" adiciona a linha. A soma deve totalizar 100% e exatamente uma
 * raça é a principal (a primeira adicionada é principal por padrão).
 */
const ComposicaoRacialEditor: React.FC<{
  breeds: AnimalBreed[];
  value: ComposicaoComponente[];
  onChange: (next: ComposicaoComponente[]) => void;
  onToast?: Props['onToast'];
}> = ({ breeds, value, onChange, onToast }) => {
  const radioName = useId();
  const [selId, setSelId] = useState('');
  const [pctText, setPctText] = useState('');
  const [principalInput, setPrincipalInput] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Raças disponíveis no dropdown: ativas e ainda não usadas na composição.
  const available = useMemo(
    () =>
      breeds
        .filter((b) => b.ativo && !value.some((c) => c.breedId === b.id))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [breeds, value],
  );

  const total = somaComposicao(value);
  const principais = value.filter((c) => c.principal).length;
  const completo = composicaoValida(value);
  const isFirst = value.length === 0; // a primeira raça será sempre a principal

  const add = () => {
    if (!selId) {
      onToast?.('Selecione a raça da composição', 'error');
      return;
    }
    if (value.some((c) => c.breedId === selId)) {
      onToast?.('Essa raça já está na composição', 'warning');
      return;
    }
    const pct = parsePercent(pctText);
    if (!(pct > 0)) {
      onToast?.('Informe um percentual válido (maior que zero)', 'error');
      return;
    }
    const breed = breeds.find((b) => b.id === selId);
    if (!breed) return;

    const makePrincipal = isFirst ? true : principalInput;
    let next: ComposicaoComponente[] = [
      ...value,
      { breedId: breed.id, nome: breed.nome, percentual: pct, principal: makePrincipal },
    ];
    if (makePrincipal) {
      const lastIdx = next.length - 1;
      next = next.map((c, i) => ({ ...c, principal: i === lastIdx }));
    }
    onChange(next);
    setSelId('');
    setPctText('');
    setPrincipalInput(false);
  };

  const setPrincipal = (idx: number) =>
    onChange(value.map((c, i) => ({ ...c, principal: i === idx })));

  const remove = (idx: number) => {
    let next = value.filter((_, i) => i !== idx);
    // garante que sempre reste uma principal
    if (next.length > 0 && !next.some((c) => c.principal)) {
      next = next.map((c, i) => ({ ...c, principal: i === 0 }));
    }
    onChange(next);
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <label className="text-[12.5px] font-semibold text-gray-700">
          Composição Racial <span className="text-[#DC2626]">*</span>
        </label>
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[#16a34a] transition-colors hover:bg-[#E7F6EC]"
        >
          <HelpCircle size={13} /> Como preencher?
        </button>
      </div>

      {showHelp && (
        <div className="mb-2 rounded-lg border border-[#D1FAE5] bg-[#F0FDF4] p-3 text-[12px] leading-relaxed text-[#15803D]">
          Informe as raças que compõem esta raça e o percentual de cada uma. A soma deve totalizar{' '}
          <strong>100%</strong> e exatamente uma raça deve ser a <strong>principal</strong>.
          <br />
          Ex.: <strong>Brangus</strong> = Angus 62,50% + Nelore 37,50%. &nbsp;•&nbsp;{' '}
          <strong>Nelore</strong> = Nelore 100,00%.
        </div>
      )}

      {/* Linha de entrada: raça + percentual + principal + adicionar */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-[#FAFAFA] p-3">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Raça</label>
          <select value={selId} onChange={(e) => setSelId(e.target.value)} className={selectCls}>
            <option value="">Selecione a raça…</option>
            {available.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="w-[130px]">
          <label className="mb-1 block text-[11.5px] font-semibold text-gray-600">Percentual</label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              value={pctText}
              onChange={(e) => setPctText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="0,00"
              className={`${inputCls} pr-7 text-right`}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">
              %
            </span>
          </div>
        </div>
        <label
          className={`flex h-10 items-center gap-2 text-[12.5px] font-semibold cursor-pointer select-none ${
            isFirst ? 'text-gray-400' : 'text-gray-700'
          }`}
          title={isFirst ? 'A primeira raça da composição é a principal' : undefined}
        >
          <input
            type="checkbox"
            checked={isFirst ? true : principalInput}
            disabled={isFirst}
            onChange={(e) => setPrincipalInput(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-[#16a34a] focus:ring-[#16a34a] disabled:opacity-60"
          />
          Principal
        </label>
        <button
          type="button"
          onClick={add}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#16a34a] text-white transition-colors hover:bg-[#15803d]"
          title="Adicionar à composição"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Lista dos componentes adicionados + total */}
      {value.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <tbody>
              {value.map((c, i) => (
                <tr key={`${c.breedId ?? c.nome}-${i}`} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2 font-semibold text-gray-800">{c.nome}</td>
                  <td className="w-28 px-3 py-2 text-right tabular-nums text-gray-700">
                    {formatPercent(c.percentual)}
                  </td>
                  <td className="w-32 px-3 py-2">
                    <label className="inline-flex cursor-pointer select-none items-center gap-1.5 text-[12px] font-semibold text-gray-700">
                      <input
                        type="radio"
                        name={radioName}
                        checked={c.principal}
                        onChange={() => setPrincipal(i)}
                        className="h-3.5 w-3.5 border-gray-300 text-[#16a34a] focus:ring-[#16a34a]"
                      />
                      {c.principal ? (
                        <span className="inline-flex items-center gap-1 text-[#15803D]">
                          <Star size={12} className="fill-current" /> Principal
                        </span>
                      ) : (
                        'Principal'
                      )}
                    </label>
                  </td>
                  <td className="w-10 px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-[#DC2626]"
                      title="Remover"
                    >
                      <X size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div
            className={`flex items-center justify-between px-3 py-2 text-[12px] font-bold ${
              completo ? 'bg-[#F0FDF4] text-[#15803D]' : 'bg-[#FEF2F2] text-[#B91C1C]'
            }`}
          >
            <span>Total</span>
            <span className="tabular-nums">
              {formatPercent(total)}
              {total === 100
                ? ' ✓'
                : total < 100
                ? ` — faltam ${formatPercent(100 - total)}`
                : ` — excede ${formatPercent(total - 100)}`}
            </span>
          </div>
          {principais !== 1 && (
            <div className="bg-[#FEF2F2] px-3 pb-2 text-[11px] font-semibold text-[#B91C1C]">
              Marque exatamente uma raça principal.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Sortable Row (aba Registros) ───────────────────────────────────────────────

interface SortableRowProps {
  breed: AnimalBreed;
  onStartEdit: (b: AnimalBreed) => void;
  onDelete: (id: string) => void;
  onToggleAtivoDirect: (b: AnimalBreed) => void;
  onEditComposicao: (b: AnimalBreed) => void;
}

const SortableRow: React.FC<SortableRowProps> = ({
  breed,
  onStartEdit,
  onDelete,
  onToggleAtivoDirect,
  onEditComposicao,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: breed.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const isSystem = breed.sistema;

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="border-b border-[#E5E7EB] transition-colors duration-150 hover:bg-[#F9FAFB]"
    >
      <td className="px-3 py-3 w-8">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing transition-colors text-gray-400 hover:text-[#16A34A] disabled:opacity-30"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
      </td>
      <td className="px-4 py-3 text-[#0F172A]">
        <div className="flex items-center gap-2">
          <span className="font-bold">{breed.nome}</span>
          {isSystem && (
            <span
              title="Raça padrão do sistema — não pode ser excluída"
              className="inline-flex items-center gap-1 rounded-md bg-[#F1F5F9] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#64748B]"
            >
              <Lock size={10} /> Padrão
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-[#0F172A]">
        <CodigoCell codigo={breed.codigoAsbia} />
      </td>
      <td className="px-4 py-3 text-[#0F172A]">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <ComposicaoCell comp={breed.composicaoRacial} />
          </div>
          <button
            type="button"
            onClick={() => onEditComposicao(breed)}
            className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 transition-all hover:bg-[#E7F6EC] hover:text-[#16A34A]"
            title="Editar composição racial"
          >
            <Dna size={15} />
          </button>
        </div>
      </td>
      <td className="px-4 py-3">
        {isSystem ? (
          // Raça padrão: situação é editável diretamente na lista.
          <SituacaoSwitch checked={breed.ativo} onClick={() => onToggleAtivoDirect(breed)} />
        ) : (
          <span
            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
              breed.ativo ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#F3F4F6] text-[#6B7280]'
            }`}
          >
            {breed.ativo ? 'Ativa' : 'Inativa'}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onStartEdit(breed)}
            className="p-1.5 rounded-lg transition-all text-gray-400 hover:text-[#16A34A] hover:bg-[#E7F6EC]"
            title="Editar raça"
          >
            <Edit2 size={15} />
          </button>
          {isSystem ? (
            <span
              title="Raça padrão do sistema não pode ser excluída"
              className="inline-flex items-center gap-1 p-1.5 text-[11px] font-semibold text-gray-300"
            >
              <Lock size={13} />
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onDelete(breed.id)}
              className="p-1.5 rounded-lg transition-all text-gray-400 hover:text-[#DC2626] hover:bg-red-50"
              title="Excluir raça"
            >
              <Trash2 size={15} />
            </button>
          )}
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Régua de lançamento (aba Lançamentos)
  const [aba, setAba] = useState<'lancar' | 'registros'>('lancar');
  const [drafts, setDrafts] = useState<DraftBreed[]>([]);
  const [nome, setNome] = useState('');
  const [codigoAsbia, setCodigoAsbia] = useState('');
  const [composicao, setComposicao] = useState<ComposicaoComponente[]>([]);
  const [observacao, setObservacao] = useState('');
  const draftSeq = useRef(1);

  // Edição da raça (abre a tela de cadastro num modal, com todos os campos)
  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editCodigoAsbia, setEditCodigoAsbia] = useState('');
  const [editComposicao, setEditComposicao] = useState<ComposicaoComponente[]>([]);
  const [editObservacao, setEditObservacao] = useState('');
  const [editAtivo, setEditAtivo] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  // Edição da composição racial (modal — vale para qualquer raça, inclusive padrão do sistema)
  const [composicaoEditId, setComposicaoEditId] = useState<string | null>(null);
  const [composicaoEditValue, setComposicaoEditValue] = useState<ComposicaoComponente[]>([]);
  const [savingComposicao, setSavingComposicao] = useState(false);

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

  // ── Lançamento inline ───────────────────────────────────────────────────────

  const addDraft = useCallback(() => {
    const clean = nome.trim();
    if (!clean) {
      onToast?.('Informe o nome da raça', 'error');
      return;
    }
    const lower = clean.toLowerCase();
    const dupDraft = drafts.some((d) => d.nome.trim().toLowerCase() === lower);
    const dupSaved = breeds.some((b) => b.nome.trim().toLowerCase() === lower);
    if (dupDraft || dupSaved) {
      onToast?.('Essa raça já foi adicionada', 'warning');
      return;
    }

    // Composição racial é obrigatória: ≥1 raça, soma 100% e exatamente uma principal.
    if (composicao.length === 0) {
      onToast?.('Informe a composição racial da raça', 'error');
      return;
    }
    if (somaComposicao(composicao) !== 100) {
      onToast?.('A soma dos percentuais da composição deve ser 100%', 'error');
      return;
    }
    if (composicao.filter((c) => c.principal).length !== 1) {
      onToast?.('Marque exatamente uma raça principal na composição', 'error');
      return;
    }

    setDrafts((prev) => [
      ...prev,
      {
        localId: draftSeq.current++,
        nome: clean,
        codigoAsbia: codigoAsbia.trim().toUpperCase(),
        composicao,
        observacao: observacao.trim(),
      },
    ]);
    setNome(''); // reset: limpa nome/código/composição/observação
    setCodigoAsbia('');
    setComposicao([]);
    setObservacao('');
  }, [nome, codigoAsbia, composicao, observacao, drafts, breeds, onToast]);

  const removeDraft = useCallback((localId: number) => {
    setDrafts((prev) => prev.filter((d) => d.localId !== localId));
  }, []);

  const cancelLancamento = useCallback(() => {
    setDrafts([]);
    setNome('');
    setCodigoAsbia('');
    setComposicao([]);
    setObservacao('');
  }, []);

  const salvarLote = useCallback(async () => {
    if (!drafts.length) return;
    setSaving(true);
    try {
      for (const d of drafts) {
        await createAnimalBreed({
          nome: d.nome.trim(),
          codigoAsbia: d.codigoAsbia || null,
          composicaoRacial: d.composicao,
          observacao: d.observacao || null,
          ativo: true,
          organizationId,
        });
      }
      const n = drafts.length;
      onToast?.(`${n} ${n === 1 ? 'raça salva' : 'raças salvas'} com sucesso`, 'success');
      setDrafts([]);
      setNome('');
      setCodigoAsbia('');
      setComposicao([]);
      setObservacao('');
      await loadBreeds();
      setAba('registros');
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar raças', 'error');
      await loadBreeds();
    } finally {
      setSaving(false);
    }
  }, [drafts, organizationId, onToast, loadBreeds]);

  // ── Edição da raça (tela de cadastro em modal) ──────────────────────────────

  const startEdit = useCallback((breed: AnimalBreed) => {
    setEditId(breed.id);
    setEditNome(breed.nome);
    setEditCodigoAsbia(breed.codigoAsbia ?? '');
    setEditComposicao(breed.composicaoRacial ?? []);
    setEditObservacao(breed.observacao ?? '');
    setEditAtivo(breed.ativo);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditId(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editId) return;
    const clean = editNome.trim();
    if (!clean) {
      onToast?.('Informe o nome da raça', 'error');
      return;
    }
    if (!composicaoValida(editComposicao)) {
      onToast?.('Composição inválida: a soma deve ser 100% e ter exatamente uma raça principal', 'error');
      return;
    }
    setSavingEdit(true);
    try {
      await updateAnimalBreed(editId, {
        nome: clean,
        codigoAsbia: editCodigoAsbia.trim().toUpperCase() || null,
        composicaoRacial: editComposicao,
        observacao: editObservacao.trim() || null,
        ativo: editAtivo,
      });
      onToast?.('Raça atualizada com sucesso', 'success');
      setEditId(null);
      await loadBreeds();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar raça', 'error');
    } finally {
      setSavingEdit(false);
    }
  }, [editId, editNome, editCodigoAsbia, editComposicao, editObservacao, editAtivo, onToast, loadBreeds]);

  // Toggle direto de situação (usado nas raças padrão do sistema).
  const toggleAtivoDirect = useCallback(
    async (breed: AnimalBreed) => {
      const novo = !breed.ativo;
      setBreeds((prev) => prev.map((b) => (b.id === breed.id ? { ...b, ativo: novo } : b)));
      try {
        await updateAnimalBreed(breed.id, { ativo: novo });
      } catch (err: any) {
        onToast?.(err.message || 'Erro ao alterar situação', 'error');
        await loadBreeds();
      }
    },
    [onToast, loadBreeds],
  );

  // ── Edição da composição racial (modal) ─────────────────────────────────────

  const openComposicaoEdit = useCallback((breed: AnimalBreed) => {
    setComposicaoEditId(breed.id);
    setComposicaoEditValue(breed.composicaoRacial ?? []);
  }, []);

  const saveComposicaoEdit = useCallback(async () => {
    if (!composicaoEditId) return;
    if (!composicaoValida(composicaoEditValue)) {
      onToast?.('Composição inválida: a soma deve ser 100% e ter exatamente uma raça principal', 'error');
      return;
    }
    setSavingComposicao(true);
    try {
      await updateAnimalBreed(composicaoEditId, { composicaoRacial: composicaoEditValue });
      onToast?.('Composição racial atualizada', 'success');
      setComposicaoEditId(null);
      await loadBreeds();
    } catch (err: any) {
      onToast?.(err.message || 'Erro ao salvar composição racial', 'error');
    } finally {
      setSavingComposicao(false);
    }
  }, [composicaoEditId, composicaoEditValue, onToast, loadBreeds]);

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

  // ── Régua de lançamento: colunas ────────────────────────────────────────────

  const draftColumns: Column<DraftBreed>[] = [
    { key: 'nome', header: 'Raça', render: (d) => <span className="font-semibold text-gray-800">{d.nome}</span> },
    {
      key: 'codigoAsbia',
      header: 'Código',
      render: (d) => <CodigoCell codigo={d.codigoAsbia || null} />,
    },
    {
      key: 'composicao',
      header: 'Composição',
      render: (d) => <ComposicaoCell comp={d.composicao} />,
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
        Selecione uma organização para gerenciar raças.
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
            title="Raças"
            right={
              <TabSwitch
                tabs={[
                  { id: 'lancar', label: 'Lançamentos', icon: <Plus size={16} /> },
                  { id: 'registros', label: 'Registros', icon: <List size={16} />, badge: breeds.length },
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
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
                Nome da Raça <span className="text-[#DC2626]">*</span>
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addDraft();
                }}
                placeholder="Ex: Nelore, Angus, Brangus..."
                className={inputCls}
              />
            </div>
            <div className="w-[150px]">
              <label className="mb-1 flex items-center gap-1 text-[12.5px] font-semibold text-gray-700">
                Código
                <Info size={13} className="text-gray-400" aria-hidden />
                <span className="sr-only">ASBIA/INTERBULL</span>
              </label>
              <input
                type="text"
                value={codigoAsbia}
                maxLength={2}
                title="ASBIA/INTERBULL"
                onChange={(e) => setCodigoAsbia(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addDraft();
                }}
                placeholder="Ex: NE"
                className={`${inputCls} text-center font-mono uppercase tracking-widest`}
              />
            </div>
          </div>

          {/* Composição Racial — entre o nome da raça e a observação */}
          <ComposicaoRacialEditor
            breeds={breeds}
            value={composicao}
            onChange={setComposicao}
            onToast={onToast}
          />

          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">Observação</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Observação livre sobre a raça (opcional)"
              rows={2}
              className={textareaCls}
            />
          </div>

          <button
            type="button"
            onClick={addDraft}
            className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg border border-[#16a34a] px-4 text-[13px] font-bold text-[#16a34a] transition-colors hover:bg-[#E7F6EC]"
          >
            <Plus size={16} /> Adicionar raça à lista
          </button>

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
                  <Check size={14} /> {drafts.length} {drafts.length === 1 ? 'raça a salvar' : 'raças a salvar'}
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
        ) : breeds.length === 0 ? (
          <div className="text-center py-16 border border-dashed rounded-2xl p-12 shadow-md text-gray-400 border-gray-200 bg-white">
            <Dna size={48} className="mx-auto mb-4 opacity-30 text-[#16A34A]" />
            <p className="text-sm font-semibold text-[#0F172A]">Nenhuma raça cadastrada.</p>
            <p className="text-xs mt-1 opacity-70">Use a aba "Lançamentos" para começar.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#E5E7EB] bg-white overflow-hidden shadow-[0_1px_3px_rgba(16,24,40,0.08)]">
            <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280] text-[11px] uppercase tracking-wider font-bold">
                  <th className="w-10" />
                  <th className="px-4 py-3.5 text-left">Raça</th>
                  <th className="px-4 py-3.5 text-left" title="ASBIA/INTERBULL">
                    <span className="inline-flex cursor-help items-center gap-1">
                      Código <Info size={12} className="text-gray-400" />
                    </span>
                  </th>
                  <th className="px-4 py-3.5 text-left">Composição</th>
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
                        onStartEdit={startEdit}
                        onDelete={(id) => setDeleteConfirmId(id)}
                        onToggleAtivoDirect={toggleAtivoDirect}
                        onEditComposicao={openComposicaoEdit}
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
                            <CodigoCell codigo={activeDragBreed.codigoAsbia} />
                          </td>
                          <td className="px-4 py-3">
                            <ComposicaoCell comp={activeDragBreed.composicaoRacial} />
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
            </table>
            </div>
            <div className="border-t border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3 text-xs font-semibold leading-relaxed text-[#6B7280]">
              Total: {breeds.length} {breeds.length === 1 ? 'raça cadastrada' : 'raças cadastradas'}
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

      {/* ── Composição Racial Dialog (qualquer raça, inclusive padrão do sistema) ── */}
      {composicaoEditId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-2xl transition-all duration-300">
            <div className="mb-4 flex items-center gap-2">
              <Dna size={18} className="text-[#16A34A]" />
              <h3 className="text-lg font-black tracking-tight text-[#0F172A]">
                Composição Racial
                <span className="ml-2 text-sm font-semibold text-[#6B7280]">
                  {breeds.find((b) => b.id === composicaoEditId)?.nome}
                </span>
              </h3>
            </div>

            <ComposicaoRacialEditor
              breeds={breeds}
              value={composicaoEditValue}
              onChange={setComposicaoEditValue}
              onToast={onToast}
            />

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setComposicaoEditId(null)}
                className="rounded-xl border border-[#E5E7EB] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#6B7280] transition-all duration-300 hover:bg-[#F9FAFB]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveComposicaoEdit}
                disabled={!composicaoValida(composicaoEditValue) || savingComposicao}
                className="inline-flex items-center gap-2 rounded-xl bg-[#16A34A] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-all duration-300 hover:bg-[#15803D] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingComposicao && <Loader2 size={14} className="animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Editar Raça (tela de cadastro completa em modal) ──────────────────── */}
      {editId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-2xl transition-all duration-300">
            <div className="mb-4 flex items-center gap-2">
              <Edit2 size={18} className="text-[#16A34A]" />
              <h3 className="text-lg font-black tracking-tight text-[#0F172A]">Editar Raça</h3>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[220px] flex-1">
                  <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">
                    Nome da Raça <span className="text-[#DC2626]">*</span>
                  </label>
                  <input
                    type="text"
                    value={editNome}
                    onChange={(e) => setEditNome(e.target.value)}
                    placeholder="Ex: Nelore, Angus, Brangus..."
                    className={inputCls}
                  />
                </div>
                <div className="w-[150px]">
                  <label className="mb-1 flex items-center gap-1 text-[12.5px] font-semibold text-gray-700">
                    Código
                    <Info size={13} className="text-gray-400" aria-hidden />
                    <span className="sr-only">ASBIA/INTERBULL</span>
                  </label>
                  <input
                    type="text"
                    value={editCodigoAsbia}
                    maxLength={2}
                    title="ASBIA/INTERBULL"
                    onChange={(e) => setEditCodigoAsbia(e.target.value.toUpperCase())}
                    placeholder="Ex: NE"
                    className={`${inputCls} text-center font-mono uppercase tracking-widest`}
                  />
                </div>
              </div>

              <ComposicaoRacialEditor
                breeds={breeds}
                value={editComposicao}
                onChange={setEditComposicao}
                onToast={onToast}
              />

              <div>
                <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">Observação</label>
                <textarea
                  value={editObservacao}
                  onChange={(e) => setEditObservacao(e.target.value)}
                  placeholder="Observação livre sobre a raça (opcional)"
                  rows={2}
                  className={textareaCls}
                />
              </div>

              <div>
                <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">Situação</label>
                <SituacaoSwitch checked={editAtivo} onClick={() => setEditAtivo((v) => !v)} />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-xl border border-[#E5E7EB] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#6B7280] transition-all duration-300 hover:bg-[#F9FAFB]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={!editNome.trim() || !composicaoValida(editComposicao) || savingEdit}
                className="inline-flex items-center gap-2 rounded-xl bg-[#16A34A] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-all duration-300 hover:bg-[#15803D] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingEdit && <Loader2 size={14} className="animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnimalBreedsManagement;
