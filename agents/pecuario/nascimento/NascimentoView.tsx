import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Save, Check, Info, List, Tags } from 'lucide-react';
import { useHierarchy } from '../../../contexts/HierarchyContext';
import PessoaSelector from '../../../components/PessoaSelector';
import IconCardButton from '../../../components/IconCardButton';
import { listAnimalCategories } from '../../../lib/api/animalCategoriesClient';
import { listAnimalBreeds } from '../../../lib/api/animalBreedsClient';
import {
  listMovimentos,
  createMovimento as apiCreateMovimento,
  updateMovimento as apiUpdateMovimento,
  deleteMovimento as apiDeleteMovimento,
  addFicha as apiAddFicha,
  type NascimentoMovimentoRow,
} from '../../../lib/api/nascimentosClient';
import FieldControl from './FieldControl';
import CategoriaGrid from './CategoriaGrid';
import BrincoBovinoIcon from './BrincoBovinoIcon';
import LoteAnimaisIcon from './LoteAnimaisIcon';
import LancamentoRapido from './LancamentoRapido';
import CamposConfigModal from './CamposConfigModal';
import AtribuirIdPanel from './AtribuirIdPanel';
import LancamentosRecentes from './LancamentosRecentes';
import { LR_REGISTRY, LOTES_ESTATICOS, DEFAULT_ORDER, FIELD_BY_ID, defaultPlaces, defaultValue } from './fieldRegistry';
import { getFieldConfig, saveFieldConfig } from '../../../lib/api/nascimentoFieldConfigClient';
import {
  formatDateBR,
  parseWeight,
  proximoApelido,
  safraDaData,
  somaCategorias,
  statusFrom,
  tallyPorCategoria,
  todayISO,
} from './util';
import type { AtribFicha, ConsolidatedRow, FieldPlace, FieldPlaces, LookupItem, MovimentoNasc, NascCat, NascDetalhe, SanItem } from './types';

// Largura máxima compartilhada dos cards da tela de Nascimento. Alargada para
// aproveitar o espaço lateral e acomodar o layout em duas colunas (entrada à
// esquerda, distribuição por categoria à direita).
// Painéis fluidos: preenchem 100% da área de conteúdo, que por sua vez já
// reage ao recolher do sidebar (md:ml-64 → md:ml-16). Assim o formulário cresce
// proporcionalmente e aproveita a tela toda quando o menu está recolhido.
const PANEL_MAX_W = '100%';

interface NascimentoViewProps {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

interface FarmLocal {
  id: string;
  name: string;
  retiroName?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Erro na requisição');
  return json.data ?? json;
}

/** Valores iniciais do formulário de entrada (modo LIGADO). */
function buildEntryValues(today: string, sharedRaca?: string): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of LR_REGISTRY) {
    if (f.id === 'sanitario') continue;
    v[f.id] = defaultValue(f.id, today, sharedRaca);
  }
  return v;
}

/** Mapeia a linha persistida (banco) para o modelo de exibição da tela. */
function mapRowToMovimento(row: NascimentoMovimentoRow, nextFichaId: () => number): MovimentoNasc {
  return {
    id: row.id,
    data: row.data,
    qtd: row.qtd,
    categoria: null,
    catDecl: Array.isArray(row.catDecl) ? row.catDecl : [],
    fichas: (row.fichas || []).map((f) => ({
      id: nextFichaId(),
      apelido: f.apelido,
      catId: f.categoriaId || '',
      rfid: f.rfid || undefined,
      sisbov: f.sisbov || undefined,
      porte: f.porte || undefined,
      raca: f.raca || undefined,
      peso: f.peso != null ? Number(f.peso) : undefined,
    })),
    naoIdentificados: row.naoIdentificados,
    status: row.status,
    fazenda: row.farmId || undefined,
    retiro: row.retiro || undefined,
    local: row.localId || undefined,
    proprietario: row.proprietarioId || undefined,
    safra: row.safra || undefined,
    sanitario: (row.sanitario as SanItem[]) || [],
  };
}

const NascimentoView: React.FC<NascimentoViewProps> = ({ onToast }) => {
  const { selectedOrganization, farms } = useHierarchy();
  const organizationId = selectedOrganization?.id ?? '';

  // ── Dados carregados ────────────────────────────────────────────────────
  const [categories, setCategories] = useState<LookupItem[]>([]);
  const [racas, setRacas] = useState<string[]>([]);
  const [farmLocais, setFarmLocais] = useState<FarmLocal[]>([]);
  const lotes: LookupItem[] = LOTES_ESTATICOS;

  // Override de opções dinâmicas para campos 'select' do Lançamento Rápido.
  // Só sobrescreve a raça quando há raças cadastradas; senão usa a lista estática.
  const optionsOverride = useMemo(
    () => (racas.length > 0 ? { raca: racas } : undefined),
    [racas],
  );

  // ── Cabeçalho ───────────────────────────────────────────────────────────
  const today = todayISO();
  const [data, setData] = useState(today);
  // Safra derivada automaticamente da data (jul→jun); não é mais editável à mão.
  const safra = safraDaData(data);
  const [proprietario, setProprietario] = useState<string | null>(null);
  const [fazenda, setFazenda] = useState('');
  const [retiro, setRetiro] = useState('');
  const [local, setLocal] = useState('');

  // ── Quantidade / modo ───────────────────────────────────────────────────
  const [totalStr, setTotalStr] = useState('');
  const [fromId, setFromId] = useState(false);

  // ── Modo DESLIGADO: categorias declaradas ────────────────────────────────
  const [cats, setCats] = useState<NascCat[]>([]);
  const [catSel, setCatSel] = useState('');

  // ── Modo LIGADO: detalhamento inline ──────────────────────────────────────
  const [detalhe, setDetalhe] = useState<NascDetalhe[]>([]);
  const [entryValues, setEntryValues] = useState<Record<string, string>>(() => buildEntryValues(today));
  const detSeq = useRef(1);

  // ── Configuração de campos ────────────────────────────────────────────────
  const [places, setPlaces] = useState<FieldPlaces>(() => defaultPlaces());
  // Ordem global de exibição dos campos (lista de field ids).
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER);
  const [autonum, setAutonum] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const sanEnabled = (places.sanitario || 'top') === 'top';

  // ── Sanitário / Dados adicionais ──────────────────────────────────────────
  const [sanOpen, setSanOpen] = useState(false);
  const [sanItems, setSanItems] = useState<SanItem[]>([]);
  const [dadosOpen, setDadosOpen] = useState(false);

  // ── Movimentos salvos (estado local) ──────────────────────────────────────
  const [movimentos, setMovimentos] = useState<MovimentoNasc[]>([]);
  const [atribuirTargetId, setAtribuirTargetId] = useState<string | null>(null);
  // Id do lançamento em edição (modo Editar): Salvar atualiza em vez de criar.
  const [editingId, setEditingId] = useState<string | null>(null);
  // Aba ativa: formulário de lançamento vs. histórico (todos os lançamentos).
  const [aba, setAba] = useState<'lancar' | 'historico'>('lancar');
  const fichaSeq = useRef(1);

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
        // Nascimento de bezerros: só categorias cadastradas como "Bezerros Mamando".
        if (!cancelled) {
          setCategories(
            rows
              .filter((c) => c.grupo === 'bezerros_mamando')
              .map((c) => ({ id: c.id, nome: c.nome })),
          );
        }
      })
      .catch((err: any) => onToast?.(err?.message || 'Erro ao carregar categorias', 'error'));
    listAnimalBreeds(organizationId)
      .then((rows) => {
        if (!cancelled) setRacas(rows.filter((b) => b.ativo).map((b) => b.nome));
      })
      .catch(() => {
        if (!cancelled) setRacas([]);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, onToast]);

  // Carrega a configuração de campos salva (destino + ordem + Nº auto) por organização.
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    getFieldConfig(organizationId)
      .then((row) => {
        if (cancelled || !row?.config) return;
        const cfg = row.config;
        // places: parte do default e sobrepõe só os ids conhecidos salvos.
        if (cfg.places && typeof cfg.places === 'object') {
          setPlaces(() => {
            const merged = defaultPlaces();
            for (const id of Object.keys(merged)) {
              const saved = cfg.places[id];
              if (saved === 'top' || saved === 'bottom' || saved === 'dados' || saved === 'off') merged[id] = saved;
            }
            return merged;
          });
        }
        // order: ids salvos ainda existentes, seguidos dos novos campos do registry.
        if (Array.isArray(cfg.order)) {
          const known = cfg.order.filter((id) => FIELD_BY_ID[id]);
          const missing = DEFAULT_ORDER.filter((id) => !known.includes(id));
          setOrder([...known, ...missing]);
        }
        if (typeof cfg.autonum === 'boolean') setAutonum(cfg.autonum);
      })
      .catch(() => {
        /* sem config salva ou erro de rede: mantém os defaults */
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  // Quando há raças cadastradas e a raça atual do formulário não está na lista,
  // ajusta para a primeira disponível (mantém o select coerente com o estado).
  useEffect(() => {
    if (racas.length === 0) return;
    setEntryValues((prev) => (racas.includes(prev.raca) ? prev : { ...prev, raca: racas[0] }));
  }, [racas]);

  // Carrega os movimentos de nascimento já persistidos (Neon).
  useEffect(() => {
    if (!organizationId) {
      setMovimentos([]);
      return;
    }
    let cancelled = false;
    listMovimentos(organizationId)
      .then((rows) => {
        if (!cancelled) setMovimentos(rows.map((r) => mapRowToMovimento(r, () => fichaSeq.current++)));
      })
      .catch((err: any) => onToast?.(err?.message || 'Erro ao carregar nascimentos', 'error'));
    return () => {
      cancelled = true;
    };
  }, [organizationId, onToast]);

  useEffect(() => {
    if (!fazenda && farms.length > 0) setFazenda(farms[0].id);
  }, [farms, fazenda]);

  useEffect(() => {
    if (!fazenda) {
      setFarmLocais([]);
      return;
    }
    let cancelled = false;
    fetchJson<FarmLocal[]>(`/api/farm-locations?farmIdLocais=${encodeURIComponent(fazenda)}`)
      .then((rows) => {
        if (!cancelled) setFarmLocais(rows || []);
      })
      .catch(() => {
        if (!cancelled) setFarmLocais([]);
      });
    return () => {
      cancelled = true;
    };
  }, [fazenda]);

  const retiros = useMemo(() => {
    const set = new Set<string>();
    for (const l of farmLocais) if (l.retiroName) set.add(l.retiroName);
    return [...set];
  }, [farmLocais]);

  // Fazenda com um único retiro: já vem selecionado por padrão (não pergunta toda vez).
  useEffect(() => {
    if (retiros.length === 1) {
      setRetiro((prev) => (prev === retiros[0] ? prev : retiros[0]));
    }
  }, [retiros]);

  const locaisDisponiveis = useMemo(
    () => (retiro ? farmLocais.filter((l) => l.retiroName === retiro) : farmLocais),
    [farmLocais, retiro],
  );

  // ── Helpers de nome ───────────────────────────────────────────────────────
  const catName = useCallback((id: string) => categories.find((c) => c.id === id)?.nome || '—', [categories]);

  // ── Entrada inline (modo LIGADO) ──────────────────────────────────────────
  const setEntryValue = useCallback((fieldId: string, value: string) => {
    setEntryValues((prev) => ({ ...prev, [fieldId]: value }));
  }, []);

  const addDetalhe = useCallback(() => {
    const apelido = (entryValues.apelido || '').trim();
    const catId = entryValues.categoria || '';
    if (!apelido) {
      onToast?.('Informe o Apelido/ID', 'error');
      return;
    }
    if (!catId) {
      onToast?.('Selecione a categoria', 'error');
      return;
    }
    const snapshot = { ...entryValues, apelido, categoria: catId };
    setDetalhe((prev) => [...prev, { id: detSeq.current++, values: snapshot }]);
    // próxima entrada: mantém topo (data/raça/lote), reseta o resto
    const next = proximoApelido(apelido);
    setEntryValues((prev) => {
      const reset = buildEntryValues(today, prev.raca);
      // preserva campos da linha superior (top)
      for (const f of LR_REGISTRY) {
        if (places[f.id] === 'top' && f.id !== 'sanitario') reset[f.id] = prev[f.id] ?? reset[f.id];
      }
      reset.apelido = autonum ? next : '';
      return reset;
    });
  }, [entryValues, onToast, today, places, autonum]);

  const removeDetalhe = useCallback((id: number) => {
    setDetalhe((prev) => prev.filter((d) => d.id !== id));
  }, []);

  // ── Categorias declaradas (modo DESLIGADO) ────────────────────────────────
  const addCat = useCallback(() => {
    const qtd = total;
    if (!catSel) {
      onToast?.('Selecione a categoria', 'error');
      return;
    }
    if (qtd < 1) {
      onToast?.('Informe a quantidade desta categoria', 'error');
      return;
    }
    setCats((prev) => {
      const existing = prev.find((c) => c.catId === catSel);
      if (existing) return prev.map((c) => (c.catId === catSel ? { ...c, qtd: c.qtd + qtd } : c));
      return [...prev, { catId: catSel, catNome: catName(catSel), qtd }];
    });
    setCatSel('');
    setTotalStr('');
    onToast?.(`Categoria adicionada · ${catName(catSel)} · ${qtd} cab.`, 'success');
  }, [catSel, total, catName, onToast]);

  const editCat = useCallback(
    (catId: string) => {
      const c = cats.find((x) => x.catId === catId);
      if (!c) return;
      setCatSel(c.catId);
      setTotalStr(String(c.qtd));
      setCats((prev) => prev.filter((x) => x.catId !== catId));
    },
    [cats],
  );

  const removeCat = useCallback((catId: string) => setCats((prev) => prev.filter((x) => x.catId !== catId)), []);

  // ── Toggle brinco (abre/fecha o painel de detalhamento) ───────────────────
  // Não apaga dados: declarado (cats) e detalhado (detalhe) coexistem e somam.
  const toggleFromId = useCallback(() => {
    setFromId((prev) => !prev);
    setSanOpen(false);
    setDadosOpen(false);
  }, []);

  // Visão coletiva (lote): recolhe o detalhamento individual e foca no
  // lançamento por categoria/quantidade.
  const verColetivo = useCallback(() => {
    setFromId(false);
    setSanOpen(false);
    setDadosOpen(false);
  }, []);

  // ── Configuração de campos ────────────────────────────────────────────────
  const setPlace = useCallback((id: string, val: FieldPlace) => {
    setPlaces((prev) => {
      const field = LR_REGISTRY.find((f) => f.id === id);
      let target = val;
      if (field?.locked) target = val === 'off' ? 'off' : 'bottom'; // Apelido/ID: só Tabela ou Desativar
      if (field?.enableOnly) target = val === 'top' || val === 'off' ? val : 'top'; // Sanitário: só Superior/Desativar
      return { ...prev, [id]: target };
    });
  }, []);

  const resetPlaces = useCallback(() => {
    setPlaces(defaultPlaces());
    setOrder(DEFAULT_ORDER);
    setAutonum(false);
  }, []);

  // Fecha o modal de configuração e persiste destino + ordem + Nº auto (por organização).
  const closeConfig = useCallback(() => {
    setConfigOpen(false);
    if (organizationId) {
      saveFieldConfig(organizationId, { places, order, autonum }).catch((err: any) =>
        onToast?.(err?.message || 'Erro ao salvar configuração de campos', 'error'),
      );
    }
  }, [organizationId, places, order, autonum, onToast]);

  // ── Salvar ────────────────────────────────────────────────────────────────
  // Habilitado quando há algo a salvar: declarado (cats) e/ou detalhado (detalhe).
  const salvarHabilitado = somaCategorias(cats) > 0 || detalhe.length > 0 || (!!catSel && total > 0);

  const novo = useCallback(() => {
    setTotalStr('');
    setCats([]);
    setCatSel('');
    setDetalhe([]);
    setSanItems([]);
    setSanOpen(false);
    setDadosOpen(false);
    setFromId(false);
    setEntryValues(buildEntryValues(today));
    setEditingId(null);
  }, [today]);

  const salvar = useCallback(async () => {
    if (!organizationId) {
      onToast?.('Selecione uma organização antes de salvar', 'error');
      return;
    }

    // Declarado sem detalhe (cats[]) com fallback p/ seleção não adicionada via "+ mais".
    let declaradas = cats;
    if (!declaradas.length && catSel && total > 0) {
      declaradas = [{ catId: catSel, catNome: catName(catSel), qtd: total }];
    }
    const naoIdent = somaCategorias(declaradas); // só o declarado sem detalhe é pendente
    const qtdTotal = naoIdent + detalhe.length;
    if (qtdTotal < 1) {
      onToast?.('Informe ao menos uma categoria (sem detalhe) ou detalhe um animal', 'error');
      return;
    }

    // Fichas individuais a partir dos detalhados.
    const fichas = detalhe.map((d) => ({
      apelido: d.values.apelido,
      catId: d.values.categoria,
      rfid: d.values.rfid || null,
      sisbov: d.values.sisbov || null,
      porte: d.values.porte || null,
      raca: d.values.raca || null,
      peso: parseWeight(d.values.peso) || null,
    }));

    // catDecl consolidado: detalhado (tally) + declarado (cats), somados por catId.
    const tally: Record<string, number> = { ...tallyPorCategoria(detalhe) };
    for (const c of declaradas) tally[c.catId] = (tally[c.catId] || 0) + c.qtd;
    const catDecl = Object.keys(tally).map((catId) => ({ catId, qtd: tally[catId] }));

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
      sanitario: sanItems.slice(),
      fichas,
    };

    try {
      if (editingId) {
        const row = await apiUpdateMovimento(editingId, payload);
        setMovimentos((prev) => prev.map((m) => (m.id === editingId ? mapRowToMovimento(row, () => fichaSeq.current++) : m)));
        onToast?.(
          naoIdent > 0
            ? `Lançamento atualizado · ${detalhe.length} identificados + ${naoIdent} a detalhar · total ${qtdTotal} cab.`
            : `Lançamento atualizado e conciliado · ${qtdTotal} cab. identificadas`,
          naoIdent > 0 ? 'warning' : 'success',
        );
      } else {
        const row = await apiCreateMovimento({ organizationId, ...payload });
        setMovimentos((prev) => [mapRowToMovimento(row, () => fichaSeq.current++), ...prev]);
        onToast?.(
          naoIdent > 0
            ? `Nascimento salvo · ${detalhe.length} identificados + ${naoIdent} a detalhar · total ${qtdTotal} cab.`
            : `Nascimento salvo e conciliado · ${qtdTotal} cab. identificadas`,
          naoIdent > 0 ? 'warning' : 'success',
        );
      }
      setCats([]);
      setCatSel('');
      setDetalhe([]);
      setSanItems([]);
      setEntryValues(buildEntryValues(today));
      setTotalStr('');
      setFromId(false);
      setEditingId(null);
    } catch (err: any) {
      onToast?.(err?.message || (editingId ? 'Erro ao atualizar nascimento' : 'Erro ao salvar nascimento'), 'error');
    }
  }, [total, detalhe, cats, catSel, catName, data, sanItems, today, fazenda, retiro, local, proprietario, safra, organizationId, editingId, onToast]);

  // ── Atribuição de ID ──────────────────────────────────────────────────────
  const addFicha = useCallback(
    async (movId: string, ficha: Omit<AtribFicha, 'id'>) => {
      try {
        const row = await apiAddFicha({
          movimentoId: movId,
          apelido: ficha.apelido,
          categoriaId: ficha.catId || null,
          rfid: ficha.rfid || null,
          sisbov: ficha.sisbov || null,
          porte: ficha.porte || null,
          raca: ficha.raca || null,
          peso: ficha.peso ?? null,
        });
        setMovimentos((prev) => prev.map((m) => (m.id === movId ? mapRowToMovimento(row, () => fichaSeq.current++) : m)));
        onToast?.(`Bezerro identificado · ${ficha.apelido}`, 'success');
      } catch (err: any) {
        onToast?.(err?.message || 'Erro ao identificar bezerro', 'error');
      }
    },
    [onToast],
  );

  // Abre a Atribuição de ID e leva o usuário para a aba de lançamento (onde o painel aparece).
  const abrirAtribuicao = useCallback((movId: string) => {
    setAtribuirTargetId(movId);
    setAba('lancar');
  }, []);

  // Reabre um lançamento no formulário superior para edição (Salvar = atualizar).
  const editarMovimento = useCallback(
    (movId: string) => {
      const m = movimentos.find((x) => x.id === movId);
      if (!m) return;
      // Cabeçalho
      setData(m.data);
      setFazenda(m.fazenda || '');
      setRetiro(m.retiro || '');
      setLocal(m.local || '');
      setProprietario(m.proprietario || null);
      // Reconstrói detalhado (fichas) e declarado sem detalhe (cats[]) por categoria.
      // catDecl é consolidado (declarado + detalhado); subtrai-se o detalhado.
      const fichaTally: Record<string, number> = {};
      for (const f of m.fichas) fichaTally[f.catId] = (fichaTally[f.catId] || 0) + 1;
      const novoDetalhe: NascDetalhe[] = m.fichas.map((f) => ({
        id: detSeq.current++,
        values: {
          apelido: f.apelido,
          categoria: f.catId,
          rfid: f.rfid || '',
          sisbov: f.sisbov || '',
          porte: f.porte || 'M',
          raca: f.raca || '',
          peso: f.peso != null ? String(f.peso) : '',
          data: m.data,
        },
      }));
      const novasCats: NascCat[] = m.catDecl
        .map((d) => ({ catId: d.catId, catNome: catName(d.catId), qtd: d.qtd - (fichaTally[d.catId] || 0) }))
        .filter((c) => c.qtd > 0);
      setDetalhe(novoDetalhe);
      setCats(novasCats);
      setCatSel('');
      setTotalStr('');
      setSanItems(m.sanitario || []);
      setSanOpen(false);
      setDadosOpen(false);
      setFromId(novoDetalhe.length > 0);
      setAtribuirTargetId(null);
      setEditingId(movId);
      setAba('lancar');
      onToast?.(`Editando lançamento de ${formatDateBR(m.data)} — altere e clique em Salvar`, 'info');
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [movimentos, catName, onToast],
  );

  // Exclui um lançamento (com confirmação) e o remove da relação.
  const excluirMovimento = useCallback(
    async (movId: string) => {
      const m = movimentos.find((x) => x.id === movId);
      if (!m) return;
      const ok =
        typeof window === 'undefined' ||
        window.confirm(`Excluir o lançamento de ${formatDateBR(m.data)} (${m.qtd} cab.)? Esta ação não pode ser desfeita.`);
      if (!ok) return;
      try {
        await apiDeleteMovimento(movId);
        setMovimentos((prev) => prev.filter((x) => x.id !== movId));
        if (atribuirTargetId === movId) setAtribuirTargetId(null);
        if (editingId === movId) novo();
        onToast?.('Lançamento excluído', 'success');
      } catch (err: any) {
        onToast?.(err?.message || 'Erro ao excluir lançamento', 'error');
      }
    },
    [movimentos, atribuirTargetId, editingId, novo, onToast],
  );

  const atribuirTarget = movimentos.find((m) => m.id === atribuirTargetId) || null;

  // ── Derivações de exibição ────────────────────────────────────────────────
  const derivedTally = useMemo(() => tallyPorCategoria(detalhe), [detalhe]);
  const totalDeclarado = somaCategorias(cats);
  const totalDetalhado = detalhe.length;
  const totalGeral = totalDeclarado + totalDetalhado;

  // Linhas consolidadas por categoria: declarado (cats) + detalhado (tally).
  const consolidated = useMemo<ConsolidatedRow[]>(() => {
    const ids = new Set<string>([...cats.map((c) => c.catId), ...Object.keys(derivedTally)]);
    return [...ids].map((catId) => {
      const declarado = cats.find((c) => c.catId === catId)?.qtd ?? 0;
      const detalhado = derivedTally[catId] ?? 0;
      const catNome = cats.find((c) => c.catId === catId)?.catNome || catName(catId);
      return { catId, catNome, declarado, detalhado, total: declarado + detalhado };
    });
  }, [cats, derivedTally, catName]);

  const resumo = useMemo(() => {
    if (!totalGeral) return null;
    const text =
      totalDeclarado > 0
        ? `Total ${totalGeral} cab. · ${totalDetalhado} identificados · ${totalDeclarado} a detalhar`
        : `Total ${totalGeral} cab. · ${totalDetalhado} identificados`;
    return { kind: totalDeclarado > 0 ? ('muted' as const) : ('ok' as const), text };
  }, [totalGeral, totalDeclarado, totalDetalhado]);

  // ── Render ────────────────────────────────────────────────────────────────
  const inputCls =
    'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
  const labelCls = 'text-[12.5px] font-semibold text-gray-700';

  return (
    <div className="min-h-full bg-[#f9fafb] p-6 md:p-8">
      {/* Abas: Lançar (formulário) vs. Lançamentos (histórico completo) */}
      <div className="mb-5 inline-flex rounded-xl border border-gray-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setAba('lancar')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            aba === 'lancar' ? 'bg-[#16a34a] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Plus size={16} /> Lançar
        </button>
        <button
          type="button"
          onClick={() => setAba('historico')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
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

      {aba === 'lancar' ? (
      <>
      <div className="@container" style={{ maxWidth: PANEL_MAX_W }}>
        {/* Um único cartão (= um lançamento) dividido em dois painéis por uma régua
            interna: dados básicos 65% (esquerda) e a área dedicada à distribuição por
            categoria 35% (direita). Sem gap nem bordas separadas → lê como uma tela só;
            os painéis esticam para a mesma altura (stretch). Container query: só divide
            com largura suficiente, senão empilha (a régua vira horizontal). */}
        <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-gray-200 bg-white @min-[1180px]:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
          {/* ── PAINEL ESQUERDO: dados básicos ────────────────────────────── */}
          <div className="p-5">
            {editingId ? (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#fcd9b6] bg-[#fff7ed] px-3 py-2 text-[13px] font-semibold text-[#ea580c]">
                <Info size={15} /> Editando um lançamento existente — altere os dados e clique em “Salvar alterações”.
              </div>
            ) : null}

            {/* Cabeçalho — Data (com safra automática), Proprietário, Fazenda, Retiro e Local */}
            <div className="flex flex-wrap items-start gap-3.5">
              <div className="min-w-0" style={{ flex: '0 0 130px' }}>
                <label className={labelCls}>Data</label>
                <input type="date" className={`${inputCls} mt-1.5`} value={data} onChange={(e) => setData(e.target.value)} />
                {/* Safra preenchida automaticamente a partir da data (jul→jun) */}
                <div className="mt-1.5 text-[12px] text-gray-500">
                  Safra <span className="font-semibold text-[#16a34a]">{safra}</span>
                </div>
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
              {/* Retiro e Local sempre na mesma linha (grupo que quebra junto) */}
              <div className="flex min-w-0 items-start gap-3.5" style={{ flex: '1 1 240px' }}>
                <div className="min-w-0 flex-1">
                  <label className={labelCls}>Retiro</label>
                  <select
                    className={`${inputCls} mt-1.5`}
                    value={retiro}
                    onChange={(e) => {
                      setRetiro(e.target.value);
                      setLocal('');
                    }}
                  >
                    <option value="">—</option>
                    {retiros.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
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

            {/* toggle brinco/lote + Quantidade (âncora) + categoria/+mais */}
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="flex shrink-0 items-center gap-2">
                <IconCardButton
                  active={fromId}
                  onClick={toggleFromId}
                  title="Detalhamento individual (vem do ID)"
                  icon={<BrincoBovinoIcon size={22} />}
                />
                <IconCardButton
                  active={!fromId}
                  onClick={verColetivo}
                  title="Lote de animais (visão coletiva)"
                  icon={<LoteAnimaisIcon size={28} />}
                />
              </div>
              {/* Entrada coletiva: invisível no modo individual (continua ocupando espaço,
                  para a altura do card não mudar ao alternar de modo). */}
              <div
                className={fromId ? 'invisible' : ''}
                aria-hidden={fromId}
                style={{ flex: '0 0 150px', maxWidth: 150 }}
              >
                <label className={labelCls}>
                  Quantidade <span className="text-red-500">*</span> <span className="font-medium text-gray-400">(cab.)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  className={`${inputCls} mt-1.5`}
                  placeholder="Ex.: 18"
                  value={totalStr}
                  onChange={(e) => setTotalStr(e.target.value)}
                />
              </div>
              <div className={`min-w-[180px] flex-1 ${fromId ? 'invisible' : ''}`} aria-hidden={fromId}>
                <label className={labelCls}>Categoria <span className="font-medium text-gray-400">(sem detalhe)</span></label>
                <select
                  className={`${inputCls} mt-1.5`}
                  value={catSel}
                  onChange={(e) => setCatSel(e.target.value)}
                >
                  <option value="">Selecione a categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={addCat}
                aria-hidden={fromId}
                className={`inline-flex h-10 items-center gap-2 rounded-lg border border-[#16a34a] bg-white px-3.5 text-sm font-semibold text-[#16a34a] hover:bg-[#e7f6ec] ${fromId ? 'invisible' : ''}`}
              >
                <Plus size={16} /> mais
              </button>
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
              <button
                type="button"
                onClick={novo}
                className="inline-flex items-center gap-2 rounded-lg border border-[#16a34a] bg-white px-4 py-2 text-sm font-semibold text-[#16a34a] hover:bg-[#e7f6ec]"
              >
                <Plus size={16} /> {editingId ? 'Cancelar' : 'Novo'}
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
              <div className="flex-1" />
              {totalGeral > 0 ? (
                <span className="text-[13px] text-gray-500">
                  {totalDeclarado > 0 ? (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#ea580c]">
                      <Info size={14} /> {totalDetalhado} identificados · {totalDeclarado} a detalhar · total {totalGeral} cab.
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#16a34a]">
                      <Check size={14} /> {totalDetalhado} identificados · total {totalGeral} cab.
                    </span>
                  )}
                </span>
              ) : null}
            </div>
          </div>

          {/* ── PAINEL DIREITO: área 100% dedicada à distribuição por categoria ── */}
          <div className="flex flex-col border-t border-gray-200 p-5 @min-[1180px]:border-l @min-[1180px]:border-t-0">
            <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-gray-700">
              <Tags size={15} className="text-[#16a34a]" /> Distribuição por categoria
            </h3>
            <CategoriaGrid rows={consolidated} onEdit={editCat} onRemove={removeCat} />
            {/* Resumo do total fixado na base do painel (mt-auto): ocupa o espaço
                dedicado e fecha a área de categorias. */}
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3 text-[12px] text-gray-500">
              <span className="font-semibold uppercase tracking-wide">Total</span>
              <span className="flex items-baseline gap-3">
                <span>Sem ID <strong className="tabular-nums text-gray-700">{totalDeclarado}</strong></span>
                <span>Com ID <strong className="tabular-nums text-[#2563eb]">{totalDetalhado}</strong></span>
                <span className="text-[17px] font-bold tabular-nums text-[#16a34a]">{totalGeral} cab.</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Lançamento Rápido (modo individual) — card separado, com o topo alinhado ao da lista de lançamentos */}
      {fromId ? (
        <div className="mt-6" style={{ maxWidth: PANEL_MAX_W }}>
          <LancamentoRapido
            places={places}
            order={order}
            categories={categories}
            lotes={lotes}
            optionsOverride={optionsOverride}
            values={entryValues}
            onValueChange={setEntryValue}
            detalhe={detalhe}
            onAdd={addDetalhe}
            onRemoveDetalhe={removeDetalhe}
            onOpenConfig={() => setConfigOpen(true)}
            sanEnabled={sanEnabled}
            sanOpen={sanOpen}
            onToggleSan={() => setSanOpen((p) => !p)}
            sanItems={sanItems}
            onSanItemsChange={setSanItems}
            dadosOpen={dadosOpen}
            onToggleDados={() => setDadosOpen((p) => !p)}
            onToast={onToast}
            onClose={verColetivo}
          />
        </div>
      ) : null}

      {/* Atribuição de ID (somente na aba de lançamento) */}
      {atribuirTarget ? (
        <div className="mt-6" style={{ maxWidth: PANEL_MAX_W }}>
          <AtribuirIdPanel
            movimento={atribuirTarget}
            categories={categories}
            onAdd={addFicha}
            onClose={() => setAtribuirTargetId(null)}
            onToast={onToast}
          />
        </div>
      ) : null}
      </>
      ) : (
        /* Aba Lançamentos: histórico completo (master-detail) */
        <div style={{ maxWidth: PANEL_MAX_W }}>
          <div className="mb-4">
            <h2 className="text-[17px] font-bold text-gray-900">Todos os lançamentos — Nascimento</h2>
            <p className="mt-0.5 text-[12.5px] text-gray-500">
              Clique em um lançamento para abri-lo; use ••• para ver, editar, atribuir ID ou excluir.
            </p>
          </div>
          <LancamentosRecentes
            movimentos={movimentos}
            catName={catName}
            categories={categories}
            places={places}
            order={order}
            lotes={lotes}
            optionsOverride={optionsOverride}
            autonum={autonum}
            onAddFicha={addFicha}
            onAtribuir={abrirAtribuicao}
            onEditar={editarMovimento}
            onExcluir={excluirMovimento}
            onToast={onToast}
          />
        </div>
      )}

      {configOpen ? (
        <CamposConfigModal
          places={places}
          autonum={autonum}
          order={order}
          onSetPlace={setPlace}
          onToggleAutonum={setAutonum}
          onReorder={setOrder}
          onReset={resetPlaces}
          onClose={closeConfig}
        />
      ) : null}
    </div>
  );
};

export default NascimentoView;
