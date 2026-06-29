import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Save, Info, List, Tags, Receipt, DollarSign, ChevronDown, ChevronRight } from 'lucide-react';
import { useHierarchy } from '../../../contexts/HierarchyContext';
import PessoaSelector from '../../../components/PessoaSelector';
import BrincoBovinoIcon from '../nascimento/BrincoBovinoIcon';
import LoteAnimaisIcon from '../nascimento/LoteAnimaisIcon';
import { listAnimalCategories } from '../../../lib/api/animalCategoriesClient';
import { listPessoas } from '../../../lib/api/pessoasClient';
import {
  listMovimentos,
  createMovimento as apiCreateMovimento,
  updateMovimento as apiUpdateMovimento,
  deleteMovimento as apiDeleteMovimento,
  type VendaMovimentoRow,
} from '../../../lib/api/vendasClient';
import { getFieldConfig, saveFieldConfig } from '../../../lib/api/movimentoFieldConfigClient';
import VendaCategoriaGrid from './VendaCategoriaGrid';
import VendaLancamentosRecentes from './VendaLancamentosRecentes';
import DefinaCamposPanel from '../fichas/DefinaCamposPanel';
import CamposConfigModal from '../fichas/CamposConfigModal';
import FullscreenLancamento from '../fichas/FullscreenLancamento';
import { useFieldConfig } from '../fichas/useFieldConfig';
import { useCamposPersonalizados, extractExtras } from '../fichas/useCamposPersonalizados';
import { useRetiros } from '../fichas/useRetiros';
import RetiroField from '../fichas/RetiroField';
import { buildEntryValues } from '../fichas/fieldConfig';
import { proximoApelido } from '../fichas/util';
import { vendaFields } from './fields';
import { todayISO, formatDateBR, safraDaData, parseBRL, computeVendaAbate, fmtNum, fmtPct, fmtBRL, numToInput } from './util';
import type { LookupItem, MovimentoVenda, TipoPeso, TipoVenda, VendaCat, VendaFicha } from './types';
import type { FichaDetalhe } from '../fichas/types';

const PANEL_MAX_W = '100%';

interface VendaViewProps {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

// Sequência local para a chave das linhas de categoria (mapeadas + adicionadas).
let vendaCatSeq = 1;
const nextCatId = () => vendaCatSeq++;
// Sequência local para a chave das fichas (animais detalhados por ID).
let vendaFichaSeq = 1;
const nextFichaId = () => vendaFichaSeq++;

/** Mapeia a linha persistida (banco) para o modelo de exibição. Numéricos coeridos com Number(). */
function mapRowToMovimento(row: VendaMovimentoRow): MovimentoVenda {
  const num = (v: string | null) => (v === null || v === '' ? null : Number(v));
  return {
    id: row.id,
    data: row.data,
    tipoVenda: row.tipoVenda,
    tipoPeso: row.tipoPeso,
    qtd: row.qtd,
    itens: (row.itens || []).map((it) => ({
      id: nextCatId(),
      catId: it.categoriaId || '',
      catNome: '',
      qtd: it.qtd,
      pesoVivoKg: it.pesoVivoKg == null || it.pesoVivoKg === '' ? null : Number(it.pesoVivoKg),
      valorArroba: it.valorArroba == null || it.valorArroba === '' ? null : Number(it.valorArroba),
      pesoMortoTotal: it.pesoMortoTotal == null || it.pesoMortoTotal === '' ? null : Number(it.pesoMortoTotal),
      desconto: it.desconto == null || it.desconto === '' ? null : Number(it.desconto),
    })),
    fichas: (row.fichas || []).map((f) => ({
      id: nextFichaId(),
      idManejo: f.apelido || '',
      idEletronico: f.rfid || '',
      catId: f.categoriaId || '',
      pesoVivoKg: num(f.pesoVivoKg),
      pesoMortoKg: num(f.pesoMortoKg),
      valorArroba: num(f.valorArroba),
      extras: f.extras || {},
    })),
    valorArroba: num(row.valorArroba),
    pesoMortoTotal: num(row.pesoMortoTotal),
    valorTotal: num(row.valorTotal),
    pesoMortoArroba: num(row.pesoMortoArroba),
    rendimento: num(row.rendimento),
    status: row.status,
    desconto: row.desconto == null || row.desconto === '' ? null : Number(row.desconto),
    fazenda: row.farmId || undefined,
    retiro: row.retiro || undefined,
    local: row.localId || undefined,
    proprietario: row.proprietarioId || undefined,
    cliente: row.clienteId || undefined,
    safra: row.safra || undefined,
    obs: row.obs || undefined,
  };
}

/** Peso (kg) a partir do input pt-BR; null se vazio. Reaproveita o parser pt-BR. */
function parsePesoVivo(s: string): number | null {
  if (!s.trim()) return null;
  const n = parseBRL(s);
  return n != null && n > 0 ? n : null;
}

const VendaView: React.FC<VendaViewProps> = ({ onToast }) => {
  const { selectedOrganization, farms } = useHierarchy();
  const organizationId = selectedOrganization?.id ?? '';

  // ── Dados carregados ────────────────────────────────────────────────────
  const [categories, setCategories] = useState<LookupItem[]>([]);
  const [pessoaMap, setPessoaMap] = useState<Map<string, string>>(new Map());

  // ── Cabeçalho ───────────────────────────────────────────────────────────
  const today = todayISO();
  const [data, setData] = useState(today);
  const safra = safraDaData(data);
  const [tipoVenda, setTipoVenda] = useState<TipoVenda>('abate');
  const [tipoPeso, setTipoPeso] = useState<TipoPeso>('arroba');
  const [proprietario, setProprietario] = useState<string | null>(null);
  const [cliente, setCliente] = useState<string | null>(null);
  const [fazenda, setFazenda] = useState('');
  const [retiro, setRetiro] = useState('');
  const [obs, setObs] = useState('');
  const [descontoStr, setDescontoStr] = useState('');

  // ── Modo de lançamento ────────────────────────────────────────────────────
  // Coletivo (lote por categoria) ativo. Individual (detalhamento por ID) é
  // scaffolding para a próxima implantação — botão presente, porém desabilitado.
  const [modoIndividual, setModoIndividual] = useState(false);

  // ── Sub-form de categoria (lote) ──────────────────────────────────────────
  // Valor/@ e peso morto total agora são informados por categoria (junto com
  // quantidade e peso vivo); os resultados continuam consolidados.
  const [catSel, setCatSel] = useState('');
  const [qtdStr, setQtdStr] = useState('');
  const [pesoVivoStr, setPesoVivoStr] = useState('');
  const [valorArrobaStr, setValorArrobaStr] = useState('');
  const [pesoMortoStr, setPesoMortoStr] = useState('');
  const [itens, setItens] = useState<VendaCat[]>([]);

  // ── Detalhamento por animal (painel "Defina seus campos") ─────────────────
  const [detalhe, setDetalhe] = useState<FichaDetalhe[]>([]);
  const [entryValues, setEntryValues] = useState<Record<string, string>>(() => buildEntryValues(vendaFields('arroba'), today));
  const [dadosOpen, setDadosOpen] = useState(false);
  const [lrExpanded, setLrExpanded] = useState(false);

  // ── Seções recolhíveis (padrão fechado) ──────────────────────────────────
  const [valoresAberto, setValoresAberto] = useState(false);
  const [obsAberto, setObsAberto] = useState(false);

  // ── Movimentos salvos ─────────────────────────────────────────────────────
  const [movimentos, setMovimentos] = useState<MovimentoVenda[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [aba, setAba] = useState<'lancar' | 'historico'>('lancar');

  // Registro de campos (rótulo do Valor depende do tipo de peso) + campos
  // personalizados (cadastro) que aparecem na Venda + configuração persistida.
  const cpFields = useCamposPersonalizados(organizationId, 'venda');
  const registry = useMemo(() => [...vendaFields(tipoPeso), ...cpFields], [tipoPeso, cpFields]);
  const fieldCfg = useFieldConfig({
    registry,
    organizationId,
    load: (id) => getFieldConfig(id, 'venda'),
    save: (id, cfg) => saveFieldConfig(id, 'venda', cfg),
    onError: (m) => onToast?.(m, 'error'),
  });

  // ── Carregamento ───────────────────────────────────────────────────────────
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
      .catch((err: any) => onToast?.(err?.message || 'Erro ao carregar vendas', 'error'));
    return () => {
      cancelled = true;
    };
  }, [organizationId, onToast]);

  // Mapa id→nome de pessoas (para exibir Cliente/Proprietário nos Registros).
  useEffect(() => {
    if (!organizationId) {
      setPessoaMap(new Map());
      return;
    }
    let cancelled = false;
    listPessoas({ organizationId, ativo: true })
      .then(({ data: pessoas }) => {
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const p of pessoas) map.set(p.id, p.preferredName || p.fullName);
        setPessoaMap(map);
      })
      .catch(() => {
        if (!cancelled) setPessoaMap(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useEffect(() => {
    if (!fazenda && farms.length > 0) setFazenda(farms[0].id);
  }, [farms, fazenda]);

  const farmName = farms.find((f) => f.id === fazenda)?.name;
  const { retiros, retiroAtivo, defaultRetiroName } = useRetiros(fazenda, farmName);

  // Nível Retiro desativado ⇒ fixa o retiro padrão do sistema (campo desabilitado);
  // ativo com um único retiro ⇒ já vem selecionado.
  useEffect(() => {
    if (!retiroAtivo) {
      setRetiro((prev) => (prev === defaultRetiroName ? prev : defaultRetiroName));
    } else if (retiros.length === 1) {
      setRetiro((prev) => (prev === retiros[0] ? prev : retiros[0]));
    }
  }, [retiroAtivo, defaultRetiroName, retiros]);

  // ── Helpers de nome ───────────────────────────────────────────────────────
  const catName = useCallback((id: string) => categories.find((c) => c.id === id)?.nome || '—', [categories]);
  const pessoaName = useCallback((id?: string) => (id ? pessoaMap.get(id) || '—' : '—'), [pessoaMap]);

  // ── Sub-form: adicionar / editar / remover categoria ──────────────────────
  const addCat = useCallback(() => {
    const qtd = parseInt(qtdStr, 10) || 0;
    const valorArroba = parseBRL(valorArrobaStr) ?? 0;
    const pesoMorto = parseBRL(pesoMortoStr) ?? 0;
    const desconto = parseBRL(descontoStr) ?? null;
    if (!catSel) {
      onToast?.('Selecione a categoria', 'error');
      return;
    }
    if (qtd < 1) {
      onToast?.('Informe a quantidade desta categoria', 'error');
      return;
    }
    if (valorArroba <= 0) {
      onToast?.(tipoPeso === 'kg' ? 'Informe o valor por quilo (R$) desta categoria' : 'Informe o valor por arroba (R$) desta categoria', 'error');
      return;
    }
    if (pesoMorto <= 0) {
      onToast?.(tipoPeso === 'kg' ? 'Informe o peso vivo total (kg) desta categoria' : 'Informe o peso morto total (kg) desta categoria', 'error');
      return;
    }
    setItens((prev) => [
      ...prev,
      {
        id: nextCatId(),
        catId: catSel,
        catNome: catName(catSel),
        qtd,
        pesoVivoKg: parsePesoVivo(pesoVivoStr),
        valorArroba,
        pesoMortoTotal: pesoMorto,
        desconto,
      },
    ]);
    setCatSel('');
    setQtdStr('');
    setPesoVivoStr('');
    setValorArrobaStr('');
    setPesoMortoStr('');
    setDescontoStr('');
    onToast?.(`Categoria adicionada · ${catName(catSel)} · ${qtd} cab.`, 'success');
  }, [catSel, qtdStr, pesoVivoStr, valorArrobaStr, pesoMortoStr, descontoStr, catName, onToast, tipoPeso]);

  const editCat = useCallback(
    (id: number) => {
      const it = itens.find((x) => x.id === id);
      if (!it) return;
      setCatSel(it.catId);
      setQtdStr(String(it.qtd));
      setPesoVivoStr(numToInput(it.pesoVivoKg));
      setValorArrobaStr(numToInput(it.valorArroba));
      setPesoMortoStr(numToInput(it.pesoMortoTotal));
      setDescontoStr(numToInput(it.desconto));
      setItens((prev) => prev.filter((x) => x.id !== id));
    },
    [itens],
  );

  const removeCat = useCallback((id: number) => setItens((prev) => prev.filter((x) => x.id !== id)), []);

  // ── Sub-form individual: adicionar / remover animal por ID ────────────────
  const setEntryValue = useCallback((fieldId: string, value: string) => {
    setEntryValues((prev) => ({ ...prev, [fieldId]: value }));
  }, []);

  const addDetalhe = useCallback(() => {
    const idManejo = (entryValues.idManejo || '').trim();
    const idEletronico = (entryValues.idEletronico || '').trim();
    if (!entryValues.categoria) {
      onToast?.('Selecione a categoria do animal', 'error');
      return;
    }
    if (!idManejo && !idEletronico) {
      onToast?.('Informe o ID de Manejo ou o ID Eletrônico', 'error');
      return;
    }
    const snapshot = { ...entryValues, idManejo, idEletronico };
    setDetalhe((prev) => [...prev, { id: nextFichaId(), values: snapshot }]);
    // Próxima entrada: preserva os campos do bloco "repete em todos" (top), reseta o resto.
    setEntryValues((prev) => {
      const reset = buildEntryValues(registry, today);
      for (const f of registry) {
        if (fieldCfg.places[f.id] === 'top') reset[f.id] = prev[f.id] ?? reset[f.id];
      }
      reset.idManejo = fieldCfg.autonum ? proximoApelido(idManejo) : '';
      return reset;
    });
    onToast?.(`Animal adicionado · ${idManejo || idEletronico}`, 'success');
  }, [entryValues, registry, fieldCfg.places, fieldCfg.autonum, today, onToast]);

  const removeDetalhe = useCallback((id: number) => setDetalhe((prev) => prev.filter((d) => d.id !== id)), []);

  // Importação em massa: linhas conformes da planilha viram animais detalhados.
  const importDetalhe = useCallback(
    (rows: Record<string, string>[]) => {
      if (!rows.length) return;
      setDetalhe((prev) => [...prev, ...rows.map((values) => ({ id: nextFichaId(), values }))]);
      onToast?.(`${rows.length} ${rows.length === 1 ? 'animal importado' : 'animais importados'} da planilha`, 'success');
    },
    [onToast],
  );

  // ── Derivações ao vivo ────────────────────────────────────────────────────
  const calc = computeVendaAbate(itens, tipoVenda, tipoPeso, null);
  const totalComId = detalhe.length;
  const totalGeral = calc.totalCab + totalComId;
  // Linha inline: sub-form preenchido mas ainda não adicionado via "+ mais".
  const inlineQtd = parseInt(qtdStr, 10) || 0;
  const inlineValorArroba = parseBRL(valorArrobaStr) ?? 0;
  const inlinePesoMorto = parseBRL(pesoMortoStr) ?? 0;
  const inlineValido = !!catSel && inlineQtd > 0 && inlineValorArroba > 0 && inlinePesoMorto > 0;
  const temItens = itens.length > 0 || inlineValido;
  const salvarHabilitado = (temItens || detalhe.length > 0) && !!cliente;

  // ── Salvar / novo / editar / excluir ──────────────────────────────────────
  const novo = useCallback(() => {
    setItens([]);
    setCatSel('');
    setQtdStr('');
    setPesoVivoStr('');
    setValorArrobaStr('');
    setPesoMortoStr('');
    setDescontoStr('');
    setDetalhe([]);
    setEntryValues(buildEntryValues(registry, today));
    setDadosOpen(false);
    setLrExpanded(false);
    setModoIndividual(false);
    setObs('');
    setCliente(null);
    setEditingId(null);
  }, [registry, today]);

  const salvar = useCallback(async () => {
    if (!organizationId) {
      onToast?.('Selecione uma organização antes de salvar', 'error');
      return;
    }
    // Fallback: categoria selecionada mas não adicionada via "+ mais" (só no modo coletivo).
    let linhas = itens;
    if (!modoIndividual && !linhas.length && catSel && (parseInt(qtdStr, 10) || 0) > 0) {
      linhas = [
        {
          id: nextCatId(),
          catId: catSel,
          catNome: catName(catSel),
          qtd: parseInt(qtdStr, 10) || 0,
          pesoVivoKg: parsePesoVivo(pesoVivoStr),
          valorArroba: parseBRL(valorArrobaStr),
          pesoMortoTotal: parseBRL(pesoMortoStr),
          desconto: parseBRL(descontoStr),
        },
      ];
    }
    if (!linhas.length && !detalhe.length) {
      onToast?.('Adicione ao menos uma categoria (lote) ou detalhe um animal por ID', 'error');
      return;
    }
    if (!cliente) {
      onToast?.('Selecione o cliente da venda', 'error');
      return;
    }
    if (linhas.some((it) => (it.valorArroba ?? 0) <= 0)) {
      onToast?.(tipoPeso === 'kg' ? 'Informe o valor por quilo (R$) de cada categoria' : 'Informe o valor por arroba (R$) de cada categoria', 'error');
      return;
    }
    if (linhas.some((it) => (it.pesoMortoTotal ?? 0) <= 0)) {
      onToast?.(tipoPeso === 'kg' ? 'Informe o peso vivo total (kg) de cada categoria' : 'Informe o peso morto total (kg) de cada categoria', 'error');
      return;
    }

    const payload = {
      farmId: fazenda || null,
      proprietarioId: proprietario || null,
      clienteId: cliente || null,
      data,
      safra: safra || null,
      retiro: retiro || null,
      tipoVenda,
      tipoPeso,
      desconto: null,
      obs: obs || null,
      itens: linhas.map((it) => ({
        categoriaId: it.catId || null,
        qtd: it.qtd,
        pesoVivoKg: it.pesoVivoKg,
        valorArroba: it.valorArroba,
        pesoMortoTotal: it.pesoMortoTotal,
        desconto: it.desconto,
      })),
      fichas: detalhe.map((d) => ({
        categoriaId: d.values.categoria || null,
        idManejo: d.values.idManejo || null,
        idEletronico: d.values.idEletronico || null,
        pesoVivoKg: parsePesoVivo(d.values.pesoVivo || ''),
        pesoMortoKg: parsePesoVivo(d.values.pesoMorto || ''),
        valorArroba: parseBRL(d.values.valor || '') ?? parseBRL(valorArrobaStr),
        extras: extractExtras(d.values),
      })),
    };

    try {
      if (editingId) {
        const row = await apiUpdateMovimento(editingId, payload);
        setMovimentos((prev) => prev.map((m) => (m.id === editingId ? mapRowToMovimento(row) : m)));
        onToast?.(`Venda atualizada · ${calc.totalCab} cab. · ${fmtBRL(calc.valorTotal)}`, 'success');
      } else {
        const row = await apiCreateMovimento({ organizationId, ...payload });
        setMovimentos((prev) => [mapRowToMovimento(row), ...prev]);
        onToast?.(`Venda registrada · ${calc.totalCab} cab. · ${fmtBRL(calc.valorTotal)}`, 'success');
      }
      novo();
    } catch (err: any) {
      onToast?.(err?.message || (editingId ? 'Erro ao atualizar venda' : 'Erro ao registrar venda'), 'error');
    }
  }, [
    organizationId, modoIndividual, itens, detalhe, catSel, qtdStr, pesoVivoStr, valorArrobaStr, pesoMortoStr, catName, cliente,
    fazenda, proprietario, data, safra, retiro, tipoVenda, tipoPeso, obs, editingId, calc.totalCab, calc.valorTotal, onToast, novo,
    descontoStr,
  ]);

  const editarMovimento = useCallback(
    (movId: string) => {
      const m = movimentos.find((x) => x.id === movId);
      if (!m) return;
      setData(m.data);
      setTipoVenda(m.tipoVenda);
      setTipoPeso(m.tipoPeso);
      setFazenda(m.fazenda || '');
      setRetiro(m.retiro || '');
      setProprietario(m.proprietario || null);
      setCliente(m.cliente || null);
      setObs(m.obs || '');
      setDescontoStr('');
      setItens(m.itens.map((it) => ({ ...it, id: nextCatId(), catNome: catName(it.catId), desconto: it.desconto ?? m.desconto })));
      setDetalhe(
        m.fichas.map((f) => ({
          id: nextFichaId(),
          values: {
            idManejo: f.idManejo || '',
            idEletronico: f.idEletronico || '',
            categoria: f.catId || '',
            pesoVivo: numToInput(f.pesoVivoKg),
            pesoMorto: numToInput(f.pesoMortoKg),
            valor: numToInput(f.valorArroba),
            data: m.data,
            ...(f.extras || {}),
          },
        })),
      );
      setCatSel('');
      setQtdStr('');
      setPesoVivoStr('');
      setValorArrobaStr('');
      setPesoMortoStr('');
      setEntryValues(buildEntryValues(vendaFields(m.tipoPeso), m.data));
      setDadosOpen(false);
      setLrExpanded(false);
      setModoIndividual(m.fichas.length > 0);
      setEditingId(movId);
      setAba('lancar');
      onToast?.(`Editando venda de ${formatDateBR(m.data)} — altere e clique em Salvar`, 'info');
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
        window.confirm(`Excluir a venda de ${formatDateBR(m.data)} (${m.qtd} cab.)? Esta ação não pode ser desfeita.`);
      if (!ok) return;
      try {
        await apiDeleteMovimento(movId);
        setMovimentos((prev) => prev.filter((x) => x.id !== movId));
        if (editingId === movId) novo();
        onToast?.('Venda excluída', 'success');
      } catch (err: any) {
        onToast?.(err?.message || 'Erro ao excluir venda', 'error');
      }
    },
    [movimentos, editingId, novo, onToast],
  );

  // ── Estilos compartilhados ────────────────────────────────────────────────
  const inputCls =
    'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
  // Variante compacta (fonte/padding menores) para os selects de tipo, de modo
  // que o cabeçalho inteiro caiba na mesma linha.
  const inputCompactCls =
    'w-full h-10 px-2 rounded-lg border border-gray-200 bg-white text-[12px] text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
  const labelCls = 'text-[12.5px] font-semibold text-gray-700';

  const Preview: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
    <div className="flex flex-col">
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <span className={`tabular-nums ${strong ? 'text-[15px] font-bold text-[#16a34a]' : 'text-[13px] font-semibold text-gray-800'}`}>
        {value}
      </span>
    </div>
  );

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
      <div className="min-w-0" style={{ flex: '1 1 180px' }}>
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
      <div className="min-w-0" style={{ flex: '1 1 180px' }}>
        <label className={labelCls}>Cliente <span className="text-red-500">*</span></label>
        <PessoaSelector
          organizationId={organizationId}
          value={cliente}
          onChange={setCliente}
          filterTipo="cliente"
          placeholder="Selecionar cliente..."
          className="mt-1 h-10 w-full"
        />
      </div>
      <div className="min-w-0" style={{ flex: '1 1 140px' }}>
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
    </>
  );

  // Painel "Defina seus campos" (detalhamento por animal). Mesmo elemento na
  // visão normal e na tela cheia.
  const painelEl = modoIndividual ? (
    <DefinaCamposPanel
      fieldById={fieldCfg.fieldById}
      order={fieldCfg.order}
      places={fieldCfg.places}
      categories={categories}
      lotes={[]}
      values={entryValues}
      onValueChange={setEntryValue}
      detalhe={detalhe}
      onAdd={addDetalhe}
      onRemoveDetalhe={removeDetalhe}
      onOpenConfig={() => fieldCfg.setConfigOpen(true)}
      onToast={onToast}
      onImport={importDetalhe}
      onClose={() => {
        setModoIndividual(false);
        setLrExpanded(false);
      }}
      expanded={lrExpanded}
      onToggleExpand={() => setLrExpanded((p) => !p)}
      filenamePrefix="modelo-venda"
      dadosOpen={dadosOpen}
      onToggleDados={() => setDadosOpen((p) => !p)}
    />
  ) : null;

  return (
    <div className="min-h-full bg-[#f9fafb] p-6 md:p-8">
      {/* Cabeçalho + abas */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Receipt size={22} className="text-[#16a34a]" />
          <h1 className="text-lg font-black tracking-tight text-[#0F172A] md:text-xl">Vendas</h1>
        </div>

        {abasToggle}
      </div>

      {aba === 'lancar' ? (
        <>
        {!lrExpanded ? (
        <div className="@container" style={{ maxWidth: PANEL_MAX_W }}>
          <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-gray-200 bg-white @min-[1180px]:grid-cols-[minmax(0,1fr)_400px]">
            {/* ── PAINEL ESQUERDO ─────────────────────────────────────────── */}
            <div className="p-5">
              {editingId ? (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#fcd9b6] bg-[#fff7ed] px-3 py-2 text-[13px] font-semibold text-[#ea580c]">
                  <Info size={15} /> Editando uma venda existente — altere os dados e clique em “Salvar alterações”.
                </div>
              ) : null}

              {/* Cabeçalho (linha única) — Data, Tipo de venda, Tipo de peso, Proprietário, Cliente, Fazenda, Retiro */}
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0" style={{ flex: '0 0 120px' }}>
                  <label className={labelCls}>Data</label>
                  <input type="date" className={`${inputCls} mt-1.5`} value={data} onChange={(e) => setData(e.target.value)} />
                  <div className="mt-1.5 text-[12px] text-gray-500">
                    Safra <span className="font-semibold text-[#16a34a]">{safra}</span>
                  </div>
                </div>
                <div className="min-w-0" style={{ flex: '0 0 122px' }}>
                  <label className={labelCls}>Tipo de venda</label>
                  <select
                    className={`${inputCompactCls} mt-1.5`}
                    value={tipoVenda}
                    onChange={(e) => {
                      const newTv = e.target.value as TipoVenda;
                      setTipoVenda(newTv);
                      if (newTv === 'pe') {
                        setTipoPeso('kg');
                      } else {
                        setTipoPeso('arroba');
                      }
                    }}
                  >
                    <option value="abate">Venda Abate</option>
                    <option value="pe">Venda em Pé</option>
                  </select>
                </div>
                <div className="min-w-0" style={{ flex: '0 0 114px' }}>
                  <label className={labelCls}>Tipo de peso</label>
                  <select
                    className={`${inputCompactCls} mt-1.5`}
                    value={tipoPeso}
                    /* Venda em Pé é sempre por kg; na Venda Abate o usuário escolhe @ ou kg. */
                    disabled={tipoVenda === 'pe'}
                    onChange={(e) => setTipoPeso(e.target.value as TipoPeso)}
                  >
                    <option value="arroba" disabled={tipoVenda === 'pe'}>Arroba (@)</option>
                    <option value="kg">Quilo (kg)</option>
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
                <div className="min-w-0" style={{ flex: '1 1 150px' }}>
                  <label className={labelCls}>Cliente <span className="text-red-500">*</span></label>
                  <PessoaSelector
                    organizationId={organizationId}
                    value={cliente}
                    onChange={setCliente}
                    filterTipo="cliente"
                    placeholder="Selecionar cliente..."
                    className="mt-1.5 h-10 w-full"
                  />
                </div>
                <div className="min-w-0" style={{ flex: '1 1 110px' }}>
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
                <div className="min-w-0" style={{ flex: '1 1 110px' }}>
                  <RetiroField
                    value={retiro}
                    onChange={setRetiro}
                    retiros={retiros}
                    retiroAtivo={retiroAtivo}
                    defaultRetiroName={defaultRetiroName}
                    inputCls={inputCls}
                    labelCls={labelCls}
                  />
                </div>
              </div>

              {/* Sub-form: animais por categoria */}
              <div className="mt-5">
                <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold text-gray-700">
                  <Tags size={15} className="text-[#16a34a]" /> Animais por categoria
                </h3>
                <div className="flex flex-wrap items-end gap-3">
                  {/* Modo de lançamento: individual (por ID) · coletivo (lote) */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setModoIndividual(true)}
                      aria-pressed={modoIndividual}
                      title="Detalhamento individual (por ID)"
                      className={`inline-flex h-11 items-center gap-2.5 rounded-xl border px-4 text-sm font-semibold transition-colors ${
                        modoIndividual
                          ? 'border-[#16a34a] bg-[#e7f6ec] text-[#16a34a]'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <BrincoBovinoIcon size={22} /> Detalhamento individual
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoIndividual(false)}
                      aria-pressed={!modoIndividual}
                      title="Lote de animais (visão coletiva)"
                      className={`inline-flex h-11 items-center gap-2.5 rounded-xl border px-4 text-sm font-semibold transition-colors ${
                        !modoIndividual
                          ? 'border-[#16a34a] bg-[#e7f6ec] text-[#16a34a]'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <LoteAnimaisIcon size={26} /> Lote de animais
                    </button>
                  </div>

                  {/* Linha do lote: permanece na tela nos dois modos. No individual os
                      campos ficam bloqueados (cinza) — exceto o Valor/@, que é a base
                      compartilhada dos lançamentos por ID (detalhados no card abaixo). */}
                  <div style={{ flex: '0 0 110px' }}>
                    <label className={labelCls}>
                      Quantidade <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      disabled={modoIndividual}
                      className={`${inputCls} mt-1.5 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400`}
                      placeholder="Ex.: 50"
                      value={modoIndividual ? String(totalComId) : qtdStr}
                      onChange={(e) => setQtdStr(e.target.value)}
                    />
                  </div>
                  <div className="min-w-0" style={{ flex: '0 0 190px' }}>
                    <label className={labelCls}>Categoria <span className="text-red-500">*</span></label>
                    <select
                      disabled={modoIndividual}
                      className={`${inputCls} mt-1.5 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400`}
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
                  <div style={{ flex: '0 0 98px' }}>
                    <label className={`${labelCls} whitespace-nowrap`}>
                      {tipoPeso === 'kg' ? 'Valor/kg' : 'Valor/@'}{' '}
                      <span className="text-[10px] font-medium text-gray-400">(R$)</span> <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className={`${inputCls} mt-1.5`}
                      placeholder={tipoPeso === 'kg' ? 'Ex.: 12,00' : 'Ex.: 320,00'}
                      value={valorArrobaStr}
                      onChange={(e) => setValorArrobaStr(e.target.value)}
                    />
                  </div>
                  <div style={{ flex: '0 0 98px' }}>
                    <label className={`${labelCls} whitespace-nowrap`}>Peso vivo <span className="text-[10px] font-medium text-gray-400">(kg/cab)</span></label>
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={modoIndividual}
                      className={`${inputCls} mt-1.5 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400`}
                      placeholder="Ex.: 480"
                      value={pesoVivoStr}
                      onChange={(e) => setPesoVivoStr(e.target.value)}
                    />
                  </div>
                  <div style={{ flex: '0 0 104px' }}>
                    <label className={`${labelCls} whitespace-nowrap`}>
                      {tipoVenda === 'pe' ? 'Peso vivo total' : 'Peso morto total'}{' '}
                      <span className="text-[10px] font-medium text-gray-400">(kg)</span> <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={modoIndividual}
                      className={`${inputCls} mt-1.5 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400`}
                      placeholder={tipoVenda === 'pe' ? 'Ex.: 24000' : 'Ex.: 7200'}
                      value={pesoMortoStr}
                      onChange={(e) => setPesoMortoStr(e.target.value)}
                    />
                  </div>
                  {tipoVenda === 'pe' && (
                    <>
                      <div style={{ flex: '0 0 85px' }}>
                        <label className={`${labelCls} whitespace-nowrap`}>Desconto %</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          className={`${inputCls} mt-1.5`}
                          placeholder="0"
                          value={descontoStr}
                          onChange={(e) => setDescontoStr(e.target.value)}
                        />
                      </div>
                      <div style={{ flex: '0 0 98px' }}>
                        <label className={`${labelCls} whitespace-nowrap`}>Peso Líquido <span className="text-[10px] font-medium text-gray-400">(kg)</span></label>
                        <div className="flex h-10 items-center justify-end rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-700 tabular-nums mt-1.5">
                          {fmtNum(inlinePesoMorto * (1 - (parseFloat(descontoStr.replace(',', '.')) || 0) / 100), 0)}
                        </div>
                      </div>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={addCat}
                    disabled={modoIndividual}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#16a34a] bg-white px-3.5 text-sm font-semibold text-[#16a34a] hover:bg-[#e7f6ec] disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300 disabled:hover:bg-white"
                  >
                    <Plus size={16} /> mais
                  </button>
                </div>
              </div>

              {/* Resultados consolidados da venda (somatório das categorias) */}
              <div className="mt-5 rounded-xl border border-gray-200 bg-[#fcfcfd] p-4">
                <button
                  type="button"
                  onClick={() => setValoresAberto((v) => !v)}
                  className="flex w-full items-center gap-2 text-[13px] font-bold text-gray-700"
                  aria-expanded={valoresAberto}
                >
                  {valoresAberto ? (
                    <ChevronDown size={16} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-400" />
                  )}
                  <DollarSign size={15} className="text-[#16a34a]" /> Valores da venda
                </button>

                {valoresAberto ? (
                  <>
                    <p className="mb-3 mt-2 text-[11.5px] text-gray-400">
                      {tipoVenda === 'pe'
                        ? 'Valor/kg e peso vivo são informados por categoria; os totais abaixo consolidam todas as categorias.'
                        : `${tipoPeso === 'kg' ? 'Valor/kg' : 'Valor/@'} e peso morto são informados por categoria; os totais abaixo consolidam todas as categorias.`}
                    </p>

                    {/* Derivados ao vivo (consolidado) */}
                    {tipoVenda === 'pe' ? (
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:grid-cols-4">
                        <Preview label="Peso vivo total (com desconto)" value={calc.totalPesoMorto > 0 ? `${fmtNum(calc.totalPesoMorto, 0)} kg` : '—'} />
                        <Preview label="Valor/kg médio" value={fmtBRL(calc.valorArroba)} />
                        <Preview label="Valor/cabeça" value={fmtBRL(calc.valorCab)} />
                        <Preview label="Valor total" value={fmtBRL(calc.valorTotal)} strong />
                      </div>
                    ) : (
                      <div className={`grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 ${tipoPeso === 'kg' ? 'lg:grid-cols-6' : 'lg:grid-cols-7'}`}>
                        <Preview label="Peso morto total" value={calc.totalPesoMorto > 0 ? `${fmtNum(calc.totalPesoMorto, 0)} kg` : '—'} />
                        <Preview label="Peso morto/cab" value={calc.pesoMortoCab != null ? `${fmtNum(calc.pesoMortoCab, 1)} kg` : '—'} />
                        {tipoPeso === 'kg' ? null : (
                          <Preview label="Peso morto @" value={calc.pesoMortoArroba != null ? `${fmtNum(calc.pesoMortoArroba, 2)} @` : '—'} />
                        )}
                        <Preview label="Rendimento" value={fmtPct(calc.rendimento)} />
                        <Preview label={tipoPeso === 'kg' ? 'Valor/kg médio' : 'Valor/@ médio'} value={fmtBRL(calc.valorArroba)} />
                        <Preview label="Valor/cabeça" value={fmtBRL(calc.valorCab)} />
                        <Preview label="Valor total" value={fmtBRL(calc.valorTotal)} strong />
                      </div>
                    )}
                  </>
                ) : null}
              </div>

              {/* Observação */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setObsAberto((v) => !v)}
                  className={`flex items-center gap-2 ${labelCls}`}
                  aria-expanded={obsAberto}
                >
                  {obsAberto ? (
                    <ChevronDown size={16} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-400" />
                  )}
                  Observação <span className="font-medium text-gray-400">(opcional)</span>
                </button>
                {obsAberto ? (
                  <textarea
                    className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-[#16a34a] focus:outline-none focus:ring-[3px] focus:ring-[#16a34a]/15"
                    rows={2}
                    placeholder="Detalhes da venda..."
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                  />
                ) : null}
              </div>

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

            {/* ── PAINEL DIREITO: categorias do lote ─────────────────────────── */}
            <div className="flex flex-col border-t border-gray-200 p-5 @min-[1180px]:border-l @min-[1180px]:border-t-0">
              <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-gray-700">
                <Tags size={15} className="text-[#16a34a]" /> Categorias do lote
              </h3>
              <VendaCategoriaGrid rows={itens} onEdit={editCat} onRemove={removeCat} />
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3 text-[12px] text-gray-500">
                <span className="font-semibold uppercase tracking-wide">Total</span>
                <span className="flex items-baseline gap-3">
                  <span>Sem ID <strong className="tabular-nums text-gray-700">{calc.totalCab}</strong></span>
                  <span>Com ID <strong className="tabular-nums text-[#2563eb]">{totalComId}</strong></span>
                  <span className="text-[17px] font-bold tabular-nums text-[#16a34a]">{totalGeral} cab.</span>
                </span>
              </div>
            </div>
          </div>

          {/* Detalhamento individual por ID — painel "Defina seus campos" */}
          {modoIndividual ? (
            <div className="mt-6" style={{ maxWidth: PANEL_MAX_W }}>
              {painelEl}
            </div>
          ) : null}
        </div>
        ) : null}

        {/* Tela cheia do painel "Defina seus campos" (detalhamento por animal) */}
        {modoIndividual && lrExpanded ? (
          <FullscreenLancamento
            icon={<Receipt size={22} className="text-[#16a34a]" />}
            title="Vendas"
            headerRight={abasToggle}
            compactHeader={compactHeader}
            onClose={() => setLrExpanded(false)}
          >
            {painelEl}
          </FullscreenLancamento>
        ) : null}
        </>
      ) : (
        <div style={{ maxWidth: PANEL_MAX_W }}>
          <div className="mb-4">
            <h2 className="text-[17px] font-bold text-gray-900">Todos os lançamentos — Vendas</h2>
            <p className="mt-0.5 text-[12.5px] text-gray-500">
              Clique em um lançamento para abri-lo; use ••• para editar ou excluir.
            </p>
          </div>
          <VendaLancamentosRecentes
            movimentos={movimentos}
            catName={catName}
            pessoaName={pessoaName}
            onEditar={editarMovimento}
            onExcluir={excluirMovimento}
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

export default VendaView;
