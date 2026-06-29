import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Save, Check, Info, List, Tags, Beef } from 'lucide-react';
import { useHierarchy } from '../../../contexts/HierarchyContext';
import PessoaSelector from '../../../components/PessoaSelector';
import { listAnimalCategories } from '../../../lib/api/animalCategoriesClient';
import {
  listMovimentos,
  createMovimento as apiCreateMovimento,
  updateMovimento as apiUpdateMovimento,
  deleteMovimento as apiDeleteMovimento,
  addFicha as apiAddFicha,
  type ConsumoMovimentoRow,
} from '../../../lib/api/consumoClient';
import { listMovimentos as listNascimentos, type NascimentoMovimentoRow } from '../../../lib/api/nascimentosClient';
import { getFieldConfig, saveFieldConfig } from '../../../lib/api/movimentoFieldConfigClient';
import CategoriaGrid from '../nascimento/CategoriaGrid';
import BrincoBovinoIcon from '../nascimento/BrincoBovinoIcon';
import LoteAnimaisIcon from '../nascimento/LoteAnimaisIcon';
import ConsumoLancamentosRecentes from './ConsumoLancamentosRecentes';
import DefinaCamposPanel from '../fichas/DefinaCamposPanel';
import CamposConfigModal from '../fichas/CamposConfigModal';
import FullscreenLancamento from '../fichas/FullscreenLancamento';
import { useFieldConfig } from '../fichas/useFieldConfig';
import { useCamposPersonalizados, extractExtras } from '../fichas/useCamposPersonalizados';
import { useRetiros } from '../fichas/useRetiros';
import RetiroField from '../fichas/RetiroField';
import { buildEntryValues } from '../fichas/fieldConfig';
import { proximoApelido } from '../fichas/util';
import { CONSUMO_FIELDS } from './fields';
import { formatDateBR, safraDaData, somaCategorias, statusFrom, todayISO } from './util';
import { CONSUMO_TIPOS, type ConsolidatedRow, type ConsumoCat, type LookupItem, type MovimentoConsumo } from './types';
import type { FichaDetalhe } from '../fichas/types';

// Painéis fluidos: preenchem 100% da área de conteúdo (espelha a tela de Mortes).
const PANEL_MAX_W = '100%';

interface ConsumoViewProps {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}


let fichaLocalSeq = 1;

/** numeric do pg volta como string; converte para number|null. */
function toNumOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Mapeia a linha persistida (banco) para o modelo de exibição da tela. */
function mapRowToMovimento(row: ConsumoMovimentoRow): MovimentoConsumo {
  return {
    id: row.id,
    data: row.data,
    qtd: row.qtd,
    catDecl: Array.isArray(row.catDecl) ? row.catDecl : [],
    fichas: (row.fichas || []).map((f) => ({
      id: fichaLocalSeq++,
      idManejo: f.apelido || '',
      idEletronico: f.rfid || '',
      catId: f.categoriaId || '',
      tipo: f.tipo || '',
      pesoVivo: toNumOrNull(f.pesoVivo),
      pesoMorto: toNumOrNull(f.pesoMorto),
      valor: toNumOrNull(f.valor),
      obs: f.obs || '',
      extras: f.extras || {},
    })),
    naoIdentificados: row.naoIdentificados,
    status: row.status,
    fazenda: row.farmId || undefined,
    retiro: row.retiro || undefined,
    local: row.localId || undefined,
    proprietario: row.proprietarioId || undefined,
    safra: row.safra || undefined,
    obs: row.obs || undefined,
  };
}

/**
 * Resolve um animal a partir de um de seus identificadores (Manejo ou
 * Eletrônico). Permite o comportamento "preenche um, carrega o outro".
 * Fonte: as fichas dos nascimentos persistidos (mesmo cadastro da Ficha Animal).
 */
interface AnimalLookup {
  idManejo?: string;
  idEletronico?: string;
  categoria?: string;
}

const normId = (s: string) => s.trim().toLowerCase();

function buildAnimalIndex(movimentos: NascimentoMovimentoRow[]): {
  byManejo: Map<string, AnimalLookup>;
  byEletronico: Map<string, AnimalLookup>;
} {
  const byManejo = new Map<string, AnimalLookup>();
  const byEletronico = new Map<string, AnimalLookup>();
  for (const m of movimentos) {
    for (const f of m.fichas) {
      const animal: AnimalLookup = {
        idManejo: f.apelido || undefined,
        idEletronico: f.rfid || undefined,
        categoria: f.categoriaId || undefined,
      };
      if (f.apelido) byManejo.set(normId(f.apelido), animal);
      if (f.rfid) byEletronico.set(normId(f.rfid), animal);
    }
  }
  return { byManejo, byEletronico };
}

const ConsumoView: React.FC<ConsumoViewProps> = ({ onToast }) => {
  const { selectedOrganization, farms } = useHierarchy();
  const organizationId = selectedOrganization?.id ?? '';

  // ── Dados carregados ────────────────────────────────────────────────────
  const [categories, setCategories] = useState<LookupItem[]>([]);
  // Nascimentos persistidos: fonte do cadastro de animais p/ resolver categoria por ID.
  const [nascimentos, setNascimentos] = useState<NascimentoMovimentoRow[]>([]);

  // ── Cabeçalho ───────────────────────────────────────────────────────────
  const today = todayISO();
  const [data, setData] = useState(today);
  const safra = safraDaData(data);
  const [proprietario, setProprietario] = useState<string | null>(null);
  const [fazenda, setFazenda] = useState('');
  const [retiro, setRetiro] = useState('');
  const [local, setLocal] = useState('');
  const [obs, setObs] = useState('');

  // ── Quantidade / modo ───────────────────────────────────────────────────
  const [totalStr, setTotalStr] = useState('');
  const [fromId, setFromId] = useState(false);

  // ── Modo coletivo: categorias declaradas ─────────────────────────────────
  const [cats, setCats] = useState<ConsumoCat[]>([]);
  const [catSel, setCatSel] = useState('');
  const [catTipoSel, setCatTipoSel] = useState('');
  const [catPVStr, setCatPVStr] = useState('');
  const [catPMStr, setCatPMStr] = useState('');
  const [catValStr, setCatValStr] = useState('');

  // ── Modo individual: detalhamento por animal (painel "Defina seus campos") ──
  const [detalhe, setDetalhe] = useState<FichaDetalhe[]>([]);
  const [entryValues, setEntryValues] = useState<Record<string, string>>(() => buildEntryValues(CONSUMO_FIELDS, today));
  const [dadosOpen, setDadosOpen] = useState(false);
  const [lrExpanded, setLrExpanded] = useState(false);
  const detSeq = useRef(1);

  // ── Movimentos salvos ─────────────────────────────────────────────────────
  const [movimentos, setMovimentos] = useState<MovimentoConsumo[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [aba, setAba] = useState<'lancar' | 'historico'>('lancar');

  // Campos personalizados (cadastro) que aparecem no Consumo, mesclados ao registry.
  const cpFields = useCamposPersonalizados(organizationId, 'consumo');
  const registry = useMemo(() => [...CONSUMO_FIELDS, ...cpFields], [cpFields]);

  // Configuração de campos do painel (persistida por organização, tipo 'consumo').
  const fieldCfg = useFieldConfig({
    registry,
    organizationId,
    load: (id) => getFieldConfig(id, 'consumo'),
    save: (id, cfg) => saveFieldConfig(id, 'consumo', cfg),
    onError: (m) => onToast?.(m, 'error'),
  });
  // Lista fixa de tipos para o campo 'tipo' (type 'lookup') do painel.
  const consumoLookups = useMemo<Record<string, LookupItem[]>>(
    () => ({ tipo: CONSUMO_TIPOS.map((t) => ({ id: t.id, nome: t.nome })) }),
    [],
  );

  const total = parseInt(totalStr, 10) || 0;

  // ── Carregamento de dados reais ───────────────────────────────────────────
  useEffect(() => {
    if (!organizationId) {
      setCategories([]);
      return;
    }
    let cancelled = false;
    listAnimalCategories(organizationId)
      .then((rows) => {
        if (!cancelled) setCategories(rows.map((c) => ({ id: c.id, nome: c.nome, sexo: c.sexo })));
      })
      .catch((err: any) => onToast?.(err?.message || 'Erro ao carregar categorias', 'error'));
    return () => {
      cancelled = true;
    };
  }, [organizationId, onToast]);

  // Carrega os movimentos de consumo/doação já persistidos (Neon).
  useEffect(() => {
    if (!organizationId) {
      setMovimentos([]);
      return;
    }
    let cancelled = false;
    listMovimentos(organizationId)
      .then((rows) => {
        if (!cancelled) setMovimentos(rows.map(mapRowToMovimento));
      })
      .catch((err: any) => onToast?.(err?.message || 'Erro ao carregar consumo/doação', 'error'));
    return () => {
      cancelled = true;
    };
  }, [organizationId, onToast]);

  // Carrega os nascimentos (cadastro de animais) para resolver categoria por ID.
  useEffect(() => {
    if (!organizationId) {
      setNascimentos([]);
      return;
    }
    let cancelled = false;
    listNascimentos(organizationId)
      .then((rows) => {
        if (!cancelled) setNascimentos(rows);
      })
      .catch(() => {
        if (!cancelled) setNascimentos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useEffect(() => {
    if (!fazenda && farms.length > 0) setFazenda(farms[0].id);
  }, [farms, fazenda]);

  const farmName = farms.find((f) => f.id === fazenda)?.name;
  const { farmLocais, retiros, retiroAtivo, defaultRetiroName } = useRetiros(fazenda, farmName);

  // Nível Retiro desativado ⇒ fixa o retiro padrão do sistema (campo desabilitado);
  // ativo com um único retiro ⇒ já vem selecionado.
  useEffect(() => {
    if (!retiroAtivo) {
      setRetiro((prev) => (prev === defaultRetiroName ? prev : defaultRetiroName));
    } else if (retiros.length === 1) {
      setRetiro((prev) => (prev === retiros[0] ? prev : retiros[0]));
    }
  }, [retiroAtivo, defaultRetiroName, retiros]);

  // Com o nível Retiro desativado o filtro por retiro não se aplica — mostra todos
  // os locais da fazenda.
  const locaisDisponiveis = useMemo(
    () => (retiroAtivo && retiro ? farmLocais.filter((l) => l.retiroName === retiro) : farmLocais),
    [farmLocais, retiro, retiroAtivo],
  );

  // ── Helpers de nome ───────────────────────────────────────────────────────
  const catName = useCallback((id: string) => categories.find((c) => c.id === id)?.nome || '—', [categories]);

  // Índice de animais por identificador, derivado dos nascimentos persistidos.
  const animalIndex = useMemo(() => buildAnimalIndex(nascimentos), [nascimentos]);

  // ── Entrada individual (painel "Defina seus campos") ──────────────────────
  const setEntryValue = useCallback(
    (fieldId: string, value: string) => {
      setEntryValues((prev) => {
        const next = { ...prev, [fieldId]: value };
        const v = value.trim();
        if (fieldId === 'idManejo' && v) {
          const found = animalIndex.byManejo.get(normId(v));
          if (found) {
            if (found.idEletronico && !(next.idEletronico || '').trim()) next.idEletronico = found.idEletronico;
            if (found.categoria && !next.categoria) next.categoria = found.categoria;
          }
        } else if (fieldId === 'idEletronico' && v) {
          const found = animalIndex.byEletronico.get(normId(v));
          if (found) {
            if (found.idManejo && !(next.idManejo || '').trim()) next.idManejo = found.idManejo;
            if (found.categoria && !next.categoria) next.categoria = found.categoria;
          }
        }
        return next;
      });
    },
    [animalIndex],
  );

  const addDetalhe = useCallback(() => {
    const idManejo = (entryValues.idManejo || '').trim();
    const idEletronico = (entryValues.idEletronico || '').trim();
    if (!idManejo && !idEletronico) {
      onToast?.('Informe o ID de Manejo ou o ID Eletrônico', 'error');
      return;
    }
    if (!entryValues.categoria) {
      onToast?.('Selecione a categoria', 'error');
      return;
    }
    if (!entryValues.tipo) {
      onToast?.('Selecione o tipo (consumo ou doação)', 'error');
      return;
    }
    const snapshot = { ...entryValues, idManejo, idEletronico };
    setDetalhe((prev) => [...prev, { id: detSeq.current++, values: snapshot }]);
    // Próxima entrada: preserva top (data) + categoria/tipo (costumam se repetir
    // no mesmo lote); limpa os IDs, pesos, valor e a observação.
    setEntryValues((prev) => {
      const reset = buildEntryValues(registry, today);
      for (const f of registry) {
        if (fieldCfg.places[f.id] === 'top') reset[f.id] = prev[f.id] ?? reset[f.id];
      }
      reset.categoria = prev.categoria ?? '';
      reset.tipo = prev.tipo ?? '';
      reset.idManejo = fieldCfg.autonum ? proximoApelido(idManejo) : '';
      return reset;
    });
  }, [entryValues, fieldCfg.places, fieldCfg.autonum, registry, today, onToast]);

  const removeDetalhe = useCallback((id: number) => {
    setDetalhe((prev) => prev.filter((d) => d.id !== id));
  }, []);

  // Importação em massa: linhas conformes da planilha viram animais detalhados.
  const importDetalhe = useCallback(
    (rows: Record<string, string>[]) => {
      if (!rows.length) return;
      setDetalhe((prev) => [...prev, ...rows.map((values) => ({ id: detSeq.current++, values }))]);
      onToast?.(`${rows.length} ${rows.length === 1 ? 'animal importado' : 'animais importados'} da planilha`, 'success');
    },
    [onToast],
  );

  // ── Categorias declaradas (modo coletivo) ─────────────────────────────────
  const addCat = useCallback(() => {
    const qtd = total;
    if (!catSel) {
      onToast?.('Selecione a categoria', 'error');
      return;
    }
    if (!catTipoSel) {
      onToast?.('Selecione o tipo (consumo ou doação)', 'error');
      return;
    }
    if (qtd < 1) {
      onToast?.('Informe a quantidade desta categoria', 'error');
      return;
    }
    const pesoVivo = toNumOrNull(catPVStr);
    const pesoMorto = toNumOrNull(catPMStr);
    const valor = toNumOrNull(catValStr);
    setCats((prev) => {
      const existing = prev.find((c) => c.catId === catSel && c.tipo === catTipoSel);
      if (existing) return prev.map((c) => (c === existing ? { ...c, qtd: c.qtd + qtd, pesoVivo, pesoMorto, valor } : c));
      return [...prev, { catId: catSel, catNome: catName(catSel), qtd, tipo: catTipoSel, pesoVivo, pesoMorto, valor }];
    });
    setCatSel('');
    setCatTipoSel('');
    setCatPVStr('');
    setCatPMStr('');
    setCatValStr('');
    setTotalStr('');
    onToast?.(`Baixa adicionada · ${catName(catSel)} · ${qtd} cab.`, 'success');
  }, [catSel, catTipoSel, catPVStr, catPMStr, catValStr, total, catName, onToast]);

  const editCat = useCallback(
    (catId: string) => {
      const c = cats.find((x) => x.catId === catId);
      if (!c) return;
      setCatSel(c.catId);
      setCatTipoSel(c.tipo);
      setCatPVStr(c.pesoVivo != null ? String(c.pesoVivo) : '');
      setCatPMStr(c.pesoMorto != null ? String(c.pesoMorto) : '');
      setCatValStr(c.valor != null ? String(c.valor) : '');
      setTotalStr(String(c.qtd));
      setCats((prev) => prev.filter((x) => x.catId !== catId));
    },
    [cats],
  );

  const removeCat = useCallback((catId: string) => setCats((prev) => prev.filter((x) => x.catId !== catId)), []);

  // ── Toggle individual/coletivo ────────────────────────────────────────────
  const toggleFromId = useCallback(() => setFromId((prev) => !prev), []);
  const verColetivo = useCallback(() => {
    setFromId(false);
    setLrExpanded(false);
  }, []);

  // ── Salvar ────────────────────────────────────────────────────────────────
  const salvarHabilitado = somaCategorias(cats) > 0 || detalhe.length > 0 || (!!catSel && !!catTipoSel && total > 0);

  const novo = useCallback(() => {
    setTotalStr('');
    setCats([]);
    setCatSel('');
    setCatTipoSel('');
    setCatPVStr('');
    setCatPMStr('');
    setCatValStr('');
    setDetalhe([]);
    setEntryValues(buildEntryValues(CONSUMO_FIELDS, today));
    setDadosOpen(false);
    setLrExpanded(false);
    setObs('');
    setFromId(false);
    setEditingId(null);
  }, [today]);

  const salvar = useCallback(async () => {
    if (!organizationId) {
      onToast?.('Selecione uma organização antes de salvar', 'error');
      return;
    }

    // Coletivo sem detalhe, com fallback para a seleção não adicionada via "+ mais".
    let declaradas = cats;
    if (!declaradas.length && catSel && catTipoSel && total > 0) {
      declaradas = [{
        catId: catSel,
        catNome: catName(catSel),
        qtd: total,
        tipo: catTipoSel,
        pesoVivo: toNumOrNull(catPVStr),
        pesoMorto: toNumOrNull(catPMStr),
        valor: toNumOrNull(catValStr),
      }];
    }
    const naoIdent = somaCategorias(declaradas);
    const qtdTotal = naoIdent + detalhe.length;
    if (qtdTotal < 1) {
      onToast?.('Informe ao menos uma baixa coletiva ou detalhe um animal por ID', 'error');
      return;
    }

    const fichas = detalhe.map((d) => ({
      apelido: d.values.idManejo || null,
      rfid: d.values.idEletronico || null,
      catId: d.values.categoria || null,
      tipo: d.values.tipo || null,
      pesoVivo: toNumOrNull(d.values.pesoVivo),
      pesoMorto: toNumOrNull(d.values.pesoMorto),
      valor: toNumOrNull(d.values.valor),
      obs: d.values.obs || null,
      extras: extractExtras(d.values),
    }));

    const catDecl = declaradas.map((c) => ({
      catId: c.catId,
      qtd: c.qtd,
      tipo: c.tipo || null,
      pesoVivo: c.pesoVivo,
      pesoMorto: c.pesoMorto,
      valor: c.valor,
    }));

    const payload = {
      farmId: fazenda || null,
      localId: local || null,
      proprietarioId: proprietario || null,
      data,
      safra: safra || null,
      retiro: retiro || null,
      qtd: qtdTotal,
      naoIdentificados: naoIdent,
      status: statusFrom(naoIdent),
      catDecl,
      obs: obs || null,
      fichas,
    };

    try {
      if (editingId) {
        const row = await apiUpdateMovimento(editingId, payload);
        setMovimentos((prev) => prev.map((m) => (m.id === editingId ? mapRowToMovimento(row) : m)));
        onToast?.(
          naoIdent > 0
            ? `Baixa atualizada · ${detalhe.length} identificados + ${naoIdent} coletivos · total ${qtdTotal} cab.`
            : `Baixa atualizada · ${qtdTotal} cab. identificadas`,
          naoIdent > 0 ? 'warning' : 'success',
        );
      } else {
        const row = await apiCreateMovimento({ organizationId, ...payload });
        setMovimentos((prev) => [mapRowToMovimento(row), ...prev]);
        onToast?.(
          naoIdent > 0
            ? `Consumo/doação registrado · ${detalhe.length} identificados + ${naoIdent} coletivos · total ${qtdTotal} cab.`
            : `Consumo/doação registrado · ${qtdTotal} cab. identificadas`,
          naoIdent > 0 ? 'warning' : 'success',
        );
      }
      novo();
    } catch (err: any) {
      onToast?.(err?.message || (editingId ? 'Erro ao atualizar baixa' : 'Erro ao registrar consumo/doação'), 'error');
    }
  }, [total, detalhe, cats, catSel, catTipoSel, catPVStr, catPMStr, catValStr, catName, data, today, fazenda, retiro, local, proprietario, safra, obs, organizationId, editingId, onToast, novo]);

  // Reabre um lançamento no formulário superior para edição.
  const editarMovimento = useCallback(
    (movId: string) => {
      const m = movimentos.find((x) => x.id === movId);
      if (!m) return;
      setData(m.data);
      setFazenda(m.fazenda || '');
      setRetiro(m.retiro || '');
      setLocal(m.local || '');
      setProprietario(m.proprietario || null);
      setObs(m.obs || '');
      const novoDetalhe: FichaDetalhe[] = m.fichas.map((f) => ({
        id: detSeq.current++,
        values: {
          idManejo: f.idManejo || '',
          idEletronico: f.idEletronico || '',
          categoria: f.catId || '',
          tipo: f.tipo || '',
          pesoVivo: f.pesoVivo != null ? String(f.pesoVivo) : '',
          pesoMorto: f.pesoMorto != null ? String(f.pesoMorto) : '',
          valor: f.valor != null ? String(f.valor) : '',
          obs: f.obs || '',
          data: m.data,
          ...(f.extras || {}),
        },
      }));
      const novasCats: ConsumoCat[] = m.catDecl
        .filter((d) => d.qtd > 0)
        .map((d) => ({
          catId: d.catId,
          catNome: catName(d.catId),
          qtd: d.qtd,
          tipo: d.tipo || '',
          pesoVivo: d.pesoVivo ?? null,
          pesoMorto: d.pesoMorto ?? null,
          valor: d.valor ?? null,
        }));
      setDetalhe(novoDetalhe);
      setCats(novasCats);
      setCatSel('');
      setCatTipoSel('');
      setCatPVStr('');
      setCatPMStr('');
      setCatValStr('');
      setTotalStr('');
      setEntryValues(buildEntryValues(CONSUMO_FIELDS, m.data));
      setDadosOpen(false);
      setLrExpanded(false);
      setFromId(novoDetalhe.length > 0);
      setEditingId(movId);
      setAba('lancar');
      onToast?.(`Editando baixa de ${formatDateBR(m.data)} — altere e clique em Salvar`, 'info');
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [movimentos, catName, onToast],
  );

  const excluirMovimento = useCallback(
    async (movId: string) => {
      const m = movimentos.find((x) => x.id === movId);
      if (!m) return;
      const ok =
        typeof window === 'undefined' ||
        window.confirm(`Excluir a baixa de ${formatDateBR(m.data)} (${m.qtd} cab.)? Esta ação não pode ser desfeita.`);
      if (!ok) return;
      try {
        await apiDeleteMovimento(movId);
        setMovimentos((prev) => prev.filter((x) => x.id !== movId));
        if (editingId === movId) novo();
        onToast?.('Baixa excluída', 'success');
      } catch (err: any) {
        onToast?.(err?.message || 'Erro ao excluir baixa', 'error');
      }
    },
    [movimentos, editingId, novo, onToast],
  );

  // ── Atribuição de ID (individualiza uma baixa coletiva pendente) ──────────
  const onAddFicha = useCallback(
    async (
      movId: string,
      ficha: { idManejo: string; idEletronico: string; catId: string; tipo: string; pesoVivo: number | null; pesoMorto: number | null; valor: number | null; obs: string },
    ) => {
      try {
        const row = await apiAddFicha({
          movimentoId: movId,
          apelido: ficha.idManejo || null,
          rfid: ficha.idEletronico || null,
          categoriaId: ficha.catId || null,
          tipo: ficha.tipo || null,
          pesoVivo: ficha.pesoVivo,
          pesoMorto: ficha.pesoMorto,
          valor: ficha.valor,
          obs: ficha.obs || null,
        });
        setMovimentos((prev) => prev.map((m) => (m.id === movId ? mapRowToMovimento(row) : m)));
        onToast?.(`Animal identificado · ${ficha.idManejo || ficha.idEletronico}`, 'success');
      } catch (err: any) {
        onToast?.(err?.message || 'Erro ao atribuir ID', 'error');
      }
    },
    [onToast],
  );

  // ── Derivações de exibição ────────────────────────────────────────────────
  const derivedTally = useMemo(() => {
    const t: Record<string, number> = {};
    for (const d of detalhe) {
      const catId = d.values.categoria;
      if (catId) t[catId] = (t[catId] || 0) + 1;
    }
    return t;
  }, [detalhe]);
  const totalDeclarado = somaCategorias(cats);
  const totalDetalhado = detalhe.length;
  const totalGeral = totalDeclarado + totalDetalhado;

  const consolidated = useMemo<ConsolidatedRow[]>(() => {
    const ids = new Set<string>([...cats.map((c) => c.catId), ...Object.keys(derivedTally)]);
    return [...ids].map((catId) => {
      const declarado = cats.filter((c) => c.catId === catId).reduce((a, c) => a + c.qtd, 0);
      const detalhado = derivedTally[catId] ?? 0;
      const catNome = cats.find((c) => c.catId === catId)?.catNome || catName(catId);
      return { catId, catNome, declarado, detalhado, total: declarado + detalhado };
    });
  }, [cats, derivedTally, catName]);

  const resumo = useMemo(() => {
    if (!totalGeral) return null;
    const text =
      totalDeclarado > 0
        ? `Total ${totalGeral} cab. · ${totalDetalhado} identificados · ${totalDeclarado} coletivos`
        : `Total ${totalGeral} cab. · ${totalDetalhado} identificados`;
    return { kind: totalDeclarado > 0 ? ('muted' as const) : ('ok' as const), text };
  }, [totalGeral, totalDeclarado, totalDetalhado]);

  // ── Render ────────────────────────────────────────────────────────────────
  const inputCls =
    'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
  const labelCls = 'text-[12.5px] font-semibold text-gray-700';
  // Modo individual: os campos do lote (coletivo) seguem visíveis, porém
  // bloqueados (cinza, sem entrada) — padrão da tela de Vendas.
  const disabledCls = 'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400';

  // Abas (Lançamentos / Registros): reusado no cabeçalho normal e no da tela cheia.
  const abasToggle = (
    <div className="grid grid-cols-2 rounded-xl border border-gray-200 bg-white p-1">
      <button
        type="button"
        onClick={() => setAba('lancar')}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
          aba === 'lancar' ? 'bg-[#16a34a] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
        }`}
      >
        <Plus size={16} /> Lançamentos
      </button>
      <button
        type="button"
        onClick={() => {
          setLrExpanded(false);
          setAba('historico');
        }}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
          aba === 'historico' ? 'bg-[#16a34a] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
        }`}
      >
        <List size={16} /> Registros
        {movimentos.length ? (
          <span
            className={`ml-0.5 rounded-full px-1.5 text-[11px] font-bold ${
              aba === 'historico' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {movimentos.length}
          </span>
        ) : null}
      </button>
    </div>
  );

  // Linha compacta de dados básicos (cabeçalho da tela cheia).
  const compactHeader = (
    <>
      <div className="min-w-0" style={{ flex: '0 0 150px' }}>
        <label className={labelCls}>Data</label>
        <input type="date" className={`${inputCls} mt-1`} value={data} onChange={(e) => setData(e.target.value)} />
      </div>
      <div className="min-w-0" style={{ flex: '1 1 200px' }}>
        <label className={labelCls}>Proprietário</label>
        <PessoaSelector
          organizationId={organizationId}
          value={proprietario}
          onChange={setProprietario}
          filterTipo="proprietario"
          placeholder="Selecionar proprietário..."
          className="mt-1 h-10 w-full"
        />
      </div>
      <div className="min-w-0" style={{ flex: '1 1 160px' }}>
        <label className={labelCls}>Fazenda</label>
        <select className={`${inputCls} mt-1`} value={fazenda} onChange={(e) => setFazenda(e.target.value)}>
          <option value="">—</option>
          {farms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0" style={{ flex: '1 1 160px' }}>
        <RetiroField
          value={retiro}
          onChange={(v) => {
            setRetiro(v);
            setLocal('');
          }}
          retiros={retiros}
          retiroAtivo={retiroAtivo}
          defaultRetiroName={defaultRetiroName}
          inputCls={inputCls}
          labelCls={labelCls}
          inputMargin="mt-1"
        />
      </div>
    </>
  );

  // Painel "Defina seus campos" (detalhamento por animal).
  const painelEl = fromId ? (
    <DefinaCamposPanel
      fieldById={fieldCfg.fieldById}
      order={fieldCfg.order}
      places={fieldCfg.places}
      categories={categories}
      lotes={[]}
      lookups={consumoLookups}
      values={entryValues}
      onValueChange={setEntryValue}
      detalhe={detalhe}
      onAdd={addDetalhe}
      onRemoveDetalhe={removeDetalhe}
      onOpenConfig={() => fieldCfg.setConfigOpen(true)}
      onToast={onToast}
      onImport={importDetalhe}
      onClose={verColetivo}
      expanded={lrExpanded}
      onToggleExpand={() => setLrExpanded((p) => !p)}
      filenamePrefix="modelo-consumo"
      dadosOpen={dadosOpen}
      onToggleDados={() => setDadosOpen((p) => !p)}
    />
  ) : null;

  return (
    <div className="min-h-full bg-[#f9fafb] p-6 md:p-8">
      {/* Cabeçalho + abas */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Beef size={22} className="text-[#16a34a]" />
          <h1 className="text-lg font-black tracking-tight text-[#0F172A] md:text-xl">Consumo / Doação</h1>
        </div>

        {abasToggle}
      </div>

      {aba === 'lancar' ? (
      <>
      {!lrExpanded ? (
      <>
      <div className="@container" style={{ maxWidth: PANEL_MAX_W }}>
        <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-gray-200 bg-white @min-[1180px]:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
          {/* ── PAINEL ESQUERDO ─────────────────────────────────────────────── */}
          <div className="p-5">
            {editingId ? (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#fcd9b6] bg-[#fff7ed] px-3 py-2 text-[13px] font-semibold text-[#ea580c]">
                <Info size={15} /> Editando uma baixa existente — altere os dados e clique em “Salvar alterações”.
              </div>
            ) : null}

            {/* Cabeçalho — Data (safra automática), Proprietário, Fazenda, Retiro, Local */}
            <div className="flex flex-wrap items-start gap-3.5">
              <div className="min-w-0" style={{ flex: '0 0 130px' }}>
                <label className={labelCls}>Data</label>
                <input type="date" className={`${inputCls} mt-1.5`} value={data} onChange={(e) => setData(e.target.value)} />
                <div className="mt-1.5 text-[12px] text-gray-500">
                  Safra <span className="font-semibold text-[#16a34a]">{safra}</span>
                </div>
              </div>
              <div className="min-w-0" style={{ flex: '1 1 150px' }}>
                <label className={labelCls}>Tipo</label>
                <select disabled={fromId} className={`${inputCls} ${disabledCls} mt-1.5`} value={catTipoSel} onChange={(e) => setCatTipoSel(e.target.value)}>
                  <option value="">Selecione o tipo</option>
                  {CONSUMO_TIPOS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0" style={{ flex: '1 1 150px' }}>
                <label className={labelCls}>Proprietário</label>
                <PessoaSelector
                  organizationId={organizationId}
                  value={proprietario}
                  onChange={setProprietario}
                  filterTipo="proprietario"
                  placeholder="Selecionar proprietário..."
                  className="mt-1.5 h-10 w-full"
                />
              </div>
              <div className="min-w-0" style={{ flex: '1 1 120px' }}>
                <label className={labelCls}>Fazenda</label>
                <select className={`${inputCls} mt-1.5`} value={fazenda} onChange={(e) => setFazenda(e.target.value)}>
                  <option value="">—</option>
                  {farms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex min-w-0 items-start gap-3.5" style={{ flex: '1 1 240px' }}>
                <div className="min-w-0 flex-1">
                  <RetiroField
                    value={retiro}
                    onChange={(v) => {
                      setRetiro(v);
                      setLocal('');
                    }}
                    retiros={retiros}
                    retiroAtivo={retiroAtivo}
                    defaultRetiroName={defaultRetiroName}
                    inputCls={inputCls}
                    labelCls={labelCls}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <label className={labelCls}>Local</label>
                  <select className={`${inputCls} mt-1.5`} value={local} onChange={(e) => setLocal(e.target.value)}>
                    <option value="">—</option>
                    {locaisDisponiveis.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* toggle individual/coletivo + Quantidade + categoria + tipo + mais */}
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={toggleFromId}
                  aria-pressed={fromId}
                  title="Detalhamento individual (por ID)"
                  className={`inline-flex h-11 items-center gap-2.5 rounded-xl border px-4 text-sm font-semibold transition-colors ${
                    fromId
                      ? 'border-[#16a34a] bg-[#e7f6ec] text-[#16a34a]'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <BrincoBovinoIcon size={22} /> Detalhamento individual
                </button>
                <button
                  type="button"
                  onClick={verColetivo}
                  aria-pressed={!fromId}
                  title="Baixa coletiva (visão de lote)"
                  className={`inline-flex h-11 items-center gap-2.5 rounded-xl border px-4 text-sm font-semibold transition-colors ${
                    !fromId
                      ? 'border-[#16a34a] bg-[#e7f6ec] text-[#16a34a]'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <LoteAnimaisIcon size={26} /> Lote de animais
                </button>
              </div>
              <div
                style={{ flex: '0 0 110px', maxWidth: 110 }}
              >
                <label className={labelCls}>
                  Quantidade <span className="text-red-500">*</span> <span className="font-medium text-gray-400">(cab.)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  disabled={fromId}
                  className={`${inputCls} ${disabledCls} mt-1.5`}
                  placeholder="Ex.: 3"
                  value={totalStr}
                  onChange={(e) => setTotalStr(e.target.value)}
                />
              </div>
              <div className="min-w-[140px] flex-1">
                <label className={labelCls}>Categoria <span className="font-medium text-gray-400">(coletivo)</span></label>
                <select disabled={fromId} className={`${inputCls} ${disabledCls} mt-1.5`} value={catSel} onChange={(e) => setCatSel(e.target.value)}>
                  <option value="">Selecione a categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Peso Vivo/Cabeça, Peso Morto/Cabeça, Valor Cabeça (coletivo) */}
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div style={{ flex: '0 0 150px' }}>
                <label className={labelCls}>Peso Vivo/Cabeça <span className="font-medium text-gray-400">(kg)</span></label>
                <input type="text" inputMode="decimal" disabled={fromId} className={`${inputCls} ${disabledCls} mt-1.5`} placeholder="Ex.: 480" value={catPVStr} onChange={(e) => setCatPVStr(e.target.value)} />
              </div>
              <div style={{ flex: '0 0 150px' }}>
                <label className={labelCls}>Peso Morto/Cabeça <span className="font-medium text-gray-400">(kg)</span></label>
                <input type="text" inputMode="decimal" disabled={fromId} className={`${inputCls} ${disabledCls} mt-1.5`} placeholder="Ex.: 240" value={catPMStr} onChange={(e) => setCatPMStr(e.target.value)} />
              </div>
              <div style={{ flex: '0 0 150px' }}>
                <label className={labelCls}>Valor Cabeça <span className="font-medium text-gray-400">(R$)</span></label>
                <input type="text" inputMode="decimal" disabled={fromId} className={`${inputCls} ${disabledCls} mt-1.5`} placeholder="Ex.: 0,00" value={catValStr} onChange={(e) => setCatValStr(e.target.value)} />
              </div>
              <button
                type="button"
                onClick={addCat}
                disabled={fromId}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#16a34a] bg-white px-3.5 text-sm font-semibold text-[#16a34a] hover:bg-[#e7f6ec] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
              >
                <Plus size={16} /> mais
              </button>
            </div>

            {/* Observação do movimento */}
            <div className="mt-4">
              <label className={labelCls}>Observação <span className="font-medium text-gray-400">(opcional)</span></label>
              <textarea
                className={`mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-[#16a34a] focus:outline-none focus:ring-[3px] focus:ring-[#16a34a]/15`}
                rows={2}
                placeholder="Detalhes da ocorrência..."
                value={obs}
                onChange={(e) => setObs(e.target.value)}
              />
            </div>

            {/* Resumo ao vivo */}
            {resumo ? (
              <div className="mt-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                    resumo.kind === 'ok' ? 'bg-[#e7f6ec] text-[#16a34a]' : 'bg-[#eef0f2] text-gray-500'
                  }`}
                >
                  {resumo.kind === 'ok' ? <Check size={13} /> : <Info size={13} />}
                  {resumo.text}
                </span>
              </div>
            ) : null}

            {/* Ações */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="flex-1" />
              <button
                type="button"
                onClick={novo}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvar}
                disabled={!salvarHabilitado}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm ${
                  salvarHabilitado ? 'bg-[#16a34a] hover:bg-[#15803d]' : 'cursor-not-allowed bg-[#86cfa4]'
                }`}
              >
                <Save size={16} /> {editingId ? 'Salvar alterações' : 'Salvar'}
              </button>
            </div>
          </div>

          {/* ── PAINEL DIREITO: distribuição por categoria ─────────────────── */}
          <div className="flex flex-col border-t border-gray-200 p-5 @min-[1180px]:border-l @min-[1180px]:border-t-0">
            <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-gray-700">
              <Tags size={15} className="text-[#16a34a]" /> Distribuição por categoria
            </h3>
            <CategoriaGrid rows={consolidated} onEdit={editCat} onRemove={removeCat} />
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3 text-[12px] text-gray-500">
              <span className="font-semibold uppercase tracking-wide">Total</span>
              <span className="flex items-baseline gap-3">
                <span>Coletivo <strong className="tabular-nums text-gray-700">{totalDeclarado}</strong></span>
                <span>Com ID <strong className="tabular-nums text-[#2563eb]">{totalDetalhado}</strong></span>
                <span className="text-[17px] font-bold tabular-nums text-[#16a34a]">{totalGeral} cab.</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Painel "Defina seus campos" (detalhamento por animal) */}
      {fromId ? (
        <div className="mt-6" style={{ maxWidth: PANEL_MAX_W }}>
          {painelEl}
        </div>
      ) : null}
      </>
      ) : null}

      {/* Tela cheia do painel "Defina seus campos" (detalhamento por animal) */}
      {fromId && lrExpanded ? (
        <FullscreenLancamento
          icon={<Beef size={22} className="text-[#16a34a]" />}
          title="Consumo / Doação"
          headerRight={abasToggle}
          compactHeader={compactHeader}
          onClose={() => setLrExpanded(false)}
        >
          {painelEl}
        </FullscreenLancamento>
      ) : null}
      </>
      ) : (
        /* Aba Registros: histórico completo */
        <div style={{ maxWidth: PANEL_MAX_W }}>
          <div className="mb-4">
            <h2 className="text-[17px] font-bold text-gray-900">Todos os lançamentos — Consumo / Doação</h2>
            <p className="mt-0.5 text-[12.5px] text-gray-500">
              Clique em um lançamento para abri-lo; use ••• para editar ou excluir.
            </p>
          </div>
          <ConsumoLancamentosRecentes
            movimentos={movimentos}
            categories={categories}
            catName={catName}
            onAddFicha={onAddFicha}
            onEditar={editarMovimento}
            onExcluir={excluirMovimento}
            onToast={onToast}
          />
        </div>
      )}

      {fieldCfg.configOpen ? (
        <CamposConfigModal
          fieldById={fieldCfg.fieldById}
          places={fieldCfg.places}
          autonum={fieldCfg.autonum}
          order={fieldCfg.order}
          onSetPlace={fieldCfg.setPlace}
          onToggleAutonum={fieldCfg.setAutonum}
          onReorder={fieldCfg.setOrder}
          onReset={fieldCfg.reset}
          onClose={fieldCfg.closeConfig}
        />
      ) : null}
    </div>
  );
};

export default ConsumoView;
