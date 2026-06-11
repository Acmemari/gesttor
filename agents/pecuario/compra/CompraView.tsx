import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Save, Info, List, Tags, Receipt, DollarSign, Tag, Cpu, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useHierarchy } from '../../../contexts/HierarchyContext';
import PessoaSelector from '../../../components/PessoaSelector';
import IconCardButton from '../../../components/IconCardButton';
import BrincoBovinoIcon from '../nascimento/BrincoBovinoIcon';
import LoteAnimaisIcon from '../nascimento/LoteAnimaisIcon';
import { listAnimalCategories } from '../../../lib/api/animalCategoriesClient';
import { listPessoas } from '../../../lib/api/pessoasClient';
import {
  listMovimentos,
  createMovimento as apiCreateMovimento,
  updateMovimento as apiUpdateMovimento,
  deleteMovimento as apiDeleteMovimento,
  type CompraMovimentoRow,
} from '../../../lib/api/comprasClient';
import CompraCategoriaGrid from './CompraCategoriaGrid';
import CompraLancamentosRecentes from './CompraLancamentosRecentes';
import { todayISO, formatDateBR, safraDaData, parseBRL, computeCompra, fmtNum, fmtBRL, numToInput } from './util';
import type { LookupItem, MovimentoCompra, CompraCat, CompraFicha } from './types';

const PANEL_MAX_W = '100%';

interface CompraViewProps {
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

let compraCatSeq = 1;
const nextCatId = () => compraCatSeq++;
let compraFichaSeq = 1;
const nextFichaId = () => compraFichaSeq++;

function mapRowToMovimento(row: CompraMovimentoRow): MovimentoCompra {
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

function parsePesoVivo(s: string): number | null {
  if (!s.trim()) return null;
  const n = parseBRL(s);
  return n != null && n > 0 ? n : null;
}

const CompraView: React.FC<CompraViewProps> = ({ onToast }) => {
  const { selectedOrganization, farms } = useHierarchy();
  const organizationId = selectedOrganization?.id ?? '';

  const [categories, setCategories] = useState<LookupItem[]>([]);
  const [farmLocais, setFarmLocais] = useState<FarmLocal[]>([]);
  const [pessoaMap, setPessoaMap] = useState<Map<string, string>>(new Map());

  const today = todayISO();
  const [data, setData] = useState(today);
  const safra = safraDaData(data);
  const [tipoVenda, setTipoVenda] = useState<string>('pe');
  const [tipoPeso, setTipoPeso] = useState<string>('kg');
  const [proprietario, setProprietario] = useState<string | null>(null);
  const [cliente, setCliente] = useState<string | null>(null);
  const [fazenda, setFazenda] = useState('');
  const [retiro, setRetiro] = useState('');
  const [obs, setObs] = useState('');
  const [descontoStr, setDescontoStr] = useState('');

  const [modoIndividual, setModoIndividual] = useState(false);

  const [catSel, setCatSel] = useState('');
  const [qtdStr, setQtdStr] = useState('');
  const [pesoVivoStr, setPesoVivoStr] = useState('');
  const [valorArrobaStr, setValorArrobaStr] = useState('');
  const [itens, setItens] = useState<CompraCat[]>([]);

  const [detalhe, setDetalhe] = useState<CompraFicha[]>([]);
  const [entIdManejo, setEntIdManejo] = useState('');
  const [entIdEletronico, setEntIdEletronico] = useState('');
  const [entCategoria, setEntCategoria] = useState('');
  const [entPesoVivoStr, setEntPesoVivoStr] = useState('');
  const [entValorArrobaStr, setEntValorArrobaStr] = useState('');

  const [valoresAberto, setValoresAberto] = useState(false);
  const [obsAberto, setObsAberto] = useState(false);

  const [movimentos, setMovimentos] = useState<MovimentoCompra[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [aba, setAba] = useState<'lancar' | 'historico'>('lancar');

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
      .catch((err: unknown) => onToast?.((err as Error)?.message || 'Erro ao carregar categorias', 'error'));
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
      .catch((err: unknown) => onToast?.((err as Error)?.message || 'Erro ao carregar compras', 'error'));
    return () => {
      cancelled = true;
    };
  }, [organizationId, onToast]);

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

  const retiros = React.useMemo(() => {
    const set = new Set<string>();
    for (const l of farmLocais) if (l.retiroName) set.add(l.retiroName);
    return [...set];
  }, [farmLocais]);

  useEffect(() => {
    if (retiros.length === 1) setRetiro((prev) => (prev === retiros[0] ? prev : retiros[0]));
  }, [retiros]);

  const catName = useCallback((id: string) => categories.find((c) => c.id === id)?.nome || '—', [categories]);
  const pessoaName = useCallback((id?: string) => (id ? pessoaMap.get(id) || '—' : '—'), [pessoaMap]);

  const calculatedPesoVivoTotal = React.useMemo(() => {
    const qty = parseInt(qtdStr, 10) || 0;
    const pesoVivo = parsePesoVivo(pesoVivoStr) || 0;
    return qty * pesoVivo;
  }, [qtdStr, pesoVivoStr]);

  const addCat = useCallback(() => {
    const qtd = parseInt(qtdStr, 10) || 0;
    const valorArroba = parseBRL(valorArrobaStr) ?? 0;
    const pesoVivo = parsePesoVivo(pesoVivoStr) ?? 0;
    const pesoMorto = qtd * pesoVivo;
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
      onToast?.('Informe o valor por quilo (R$) desta categoria', 'error');
      return;
    }
    if (pesoMorto <= 0) {
      onToast?.('Informe o peso vivo/cab desta categoria para calcular o total', 'error');
      return;
    }

    setItens((prev) => [
      ...prev,
      {
        id: nextCatId(),
        catId: catSel,
        catNome: catName(catSel),
        qtd,
        pesoVivoKg: pesoVivo,
        valorArroba,
        pesoMortoTotal: pesoMorto,
        desconto,
      },
    ]);
    setCatSel('');
    setQtdStr('');
    setPesoVivoStr('');
    setValorArrobaStr('');
    setDescontoStr('');
    onToast?.(`Categoria adicionada · ${catName(catSel)} · ${qtd} cab.`, 'success');
  }, [catSel, qtdStr, pesoVivoStr, valorArrobaStr, descontoStr, catName, onToast]);

  const editCat = useCallback(
    (id: number) => {
      const it = itens.find((x) => x.id === id);
      if (!it) return;
      setCatSel(it.catId);
      setQtdStr(String(it.qtd));
      setPesoVivoStr(numToInput(it.pesoVivoKg));
      setValorArrobaStr(numToInput(it.valorArroba));
      setDescontoStr(numToInput(it.desconto));
      setItens((prev) => prev.filter((x) => x.id !== id));
    },
    [itens],
  );

  const removeCat = useCallback((id: number) => setItens((prev) => prev.filter((x) => x.id !== id)), []);

  const addDetalhe = useCallback(() => {
    const idManejo = entIdManejo.trim();
    const idEletronico = entIdEletronico.trim();
    if (!entCategoria) {
      onToast?.('Selecione a categoria do animal', 'error');
      return;
    }
    if (!idManejo && !idEletronico) {
      onToast?.('Informe o ID de Manejo ou o ID Eletrônico', 'error');
      return;
    }
    setDetalhe((prev) => [
      ...prev,
      {
        id: nextFichaId(),
        idManejo,
        idEletronico,
        catId: entCategoria,
        pesoVivoKg: parsePesoVivo(entPesoVivoStr),
        pesoMortoKg: null,
        valorArroba: parseBRL(entValorArrobaStr) ?? parseBRL(valorArrobaStr),
      },
    ]);
    setEntIdManejo('');
    setEntIdEletronico('');
    setEntPesoVivoStr('');
    setEntValorArrobaStr('');
    onToast?.(`Animal adicionado · ${idManejo || idEletronico}`, 'success');
  }, [entCategoria, entIdManejo, entIdEletronico, entPesoVivoStr, entValorArrobaStr, valorArrobaStr, onToast]);

  const removeDetalhe = useCallback((id: number) => setDetalhe((prev) => prev.filter((d) => d.id !== id)), []);

  const totalComId = detalhe.length;
  const totalGeral = itens.reduce((a, it) => a + (it.qtd || 0), 0) + totalComId;

  const inlineQtd = parseInt(qtdStr, 10) || 0;
  const inlineValorArroba = parseBRL(valorArrobaStr) ?? 0;
  const inlinePesoVivo = parsePesoVivo(pesoVivoStr) ?? 0;
  const inlinePesoMorto = inlineQtd * inlinePesoVivo;
  const inlineValido = !!catSel && inlineQtd > 0 && inlineValorArroba > 0 && inlinePesoVivo > 0;
  const temItens = itens.length > 0 || inlineValido;
  const salvarHabilitado = (temItens || detalhe.length > 0) && !!cliente;

  const calc = computeCompra(itens, parseBRL(descontoStr));

  const novo = useCallback(() => {
    setItens([]);
    setCatSel('');
    setQtdStr('');
    setPesoVivoStr('');
    setValorArrobaStr('');
    setDescontoStr('');
    setDetalhe([]);
    setEntIdManejo('');
    setEntIdEletronico('');
    setEntCategoria('');
    setEntPesoVivoStr('');
    setEntValorArrobaStr('');
    setModoIndividual(false);
    setObs('');
    setCliente(null);
    setEditingId(null);
  }, []);

  const salvar = useCallback(async () => {
    if (!organizationId) {
      onToast?.('Selecione uma organização antes de salvar', 'error');
      return;
    }
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
          pesoMortoTotal: calculatedPesoVivoTotal,
          desconto: parseBRL(descontoStr),
        },
      ];
    }
    if (!linhas.length && !detalhe.length) {
      onToast?.('Adicione ao menos uma categoria (lote) ou detalhe um animal por ID', 'error');
      return;
    }
    if (!cliente) {
      onToast?.('Selecione o cliente da compra', 'error');
      return;
    }
    if (linhas.some((it) => (it.valorArroba ?? 0) <= 0)) {
      onToast?.('Informe o valor por quilo (R$) de cada categoria', 'error');
      return;
    }
    if (linhas.some((it) => (it.pesoMortoTotal ?? 0) <= 0)) {
      onToast?.('Informe o peso vivo de cada categoria', 'error');
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
      desconto: parseBRL(descontoStr),
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
        categoriaId: d.catId || null,
        idManejo: d.idManejo || null,
        idEletronico: d.idEletronico || null,
        pesoVivoKg: d.pesoVivoKg,
        pesoMortoKg: null,
        valorArroba: d.valorArroba,
      })),
    };

    try {
      if (editingId) {
        const row = await apiUpdateMovimento(editingId, payload);
        setMovimentos((prev) => prev.map((m) => (m.id === editingId ? mapRowToMovimento(row) : m)));
        onToast?.(`Compra atualizada · ${totalGeral} cab.`, 'success');
      } else {
        const row = await apiCreateMovimento({ organizationId, ...payload });
        setMovimentos((prev) => [mapRowToMovimento(row), ...prev]);
        onToast?.(`Compra registrada · ${totalGeral} cab.`, 'success');
      }
      novo();
    } catch (err: unknown) {
      onToast?.((err as Error)?.message || (editingId ? 'Erro ao atualizar compra' : 'Erro ao registrar compra'), 'error');
    }
  }, [
    organizationId, modoIndividual, itens, detalhe, catSel, qtdStr, pesoVivoStr, valorArrobaStr, calculatedPesoVivoTotal, catName, cliente,
    fazenda, proprietario, data, safra, retiro, tipoVenda, tipoPeso, obs, editingId, totalGeral, onToast, novo, descontoStr,
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
      setDescontoStr(numToInput(m.desconto));
      setItens(m.itens.map((it) => ({ ...it, id: nextCatId(), catNome: catName(it.catId) })));
      setDetalhe(m.fichas.map((f) => ({ ...f, id: nextFichaId() })));
      setCatSel('');
      setQtdStr('');
      setPesoVivoStr('');
      setValorArrobaStr('');
      setEntIdManejo('');
      setEntIdEletronico('');
      setEntCategoria('');
      setEntPesoVivoStr('');
      setEntValorArrobaStr('');
      setModoIndividual(m.fichas.length > 0);
      setEditingId(movId);
      setAba('lancar');
      onToast?.(`Editando compra de ${formatDateBR(m.data)} — altere e clique em Salvar`, 'info');
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
        window.confirm(`Excluir a compra de ${formatDateBR(m.data)} (${m.qtd} cab.)? Esta ação não pode ser desfeita.`);
      if (!ok) return;
      try {
        await apiDeleteMovimento(movId);
        setMovimentos((prev) => prev.filter((x) => x.id !== movId));
        if (editingId === movId) novo();
        onToast?.('Compra excluída', 'success');
      } catch (err: unknown) {
        onToast?.((err as Error)?.message || 'Erro ao excluir compra', 'error');
      }
    },
    [movimentos, editingId, novo, onToast],
  );

  const inputCls =
    'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
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

  return (
    <div className="min-h-full bg-[#f9fafb] p-6 md:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Receipt size={22} className="text-[#16a34a]" />
          <h1 className="text-lg font-black tracking-tight text-[#0F172A] md:text-xl">Compras</h1>
        </div>

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
            onClick={() => setAba('historico')}
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
      </div>

      {aba === 'lancar' ? (
        <div className="@container" style={{ maxWidth: PANEL_MAX_W }}>
          <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-gray-200 bg-white @min-[1180px]:grid-cols-[minmax(0,1fr)_400px]">
            <div className="p-5">
              {editingId ? (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#fcd9b6] bg-[#fff7ed] px-3 py-2 text-[13px] font-semibold text-[#ea580c]">
                  <Info size={15} /> Editando uma compra existente — altere os dados e clique em “Salvar alterações”.
                </div>
              ) : null}

              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0" style={{ flex: '0 0 120px' }}>
                  <label className={labelCls}>Data</label>
                  <input type="date" className={`${inputCls} mt-1.5`} value={data} onChange={(e) => setData(e.target.value)} />
                  <div className="mt-1.5 text-[12px] text-gray-500">
                    Safra <span className="font-semibold text-[#16a34a]">{safra}</span>
                  </div>
                </div>
                <div className="min-w-0" style={{ flex: '0 0 122px' }}>
                  <label className={labelCls}>Tipo de compra</label>
                  <select
                    className={`${inputCompactCls} mt-1.5`}
                    value={tipoVenda}
                    onChange={(e) => {
                      const newTv = e.target.value;
                      setTipoVenda(newTv);
                      if (newTv === 'pe') {
                        setTipoPeso('kg');
                      }
                    }}
                  >
                    <option value="pe">Compra em Pé</option>
                    <option value="abate">Compra Abate</option>
                  </select>
                </div>
                <div className="min-w-0" style={{ flex: '0 0 114px' }}>
                  <label className={labelCls}>Tipo de peso</label>
                  <select
                    className={`${inputCompactCls} mt-1.5`}
                    value={tipoPeso}
                    disabled={tipoVenda === 'pe'}
                    onChange={(e) => setTipoPeso(e.target.value)}
                  >
                    <option value="kg">Quilo (kg)</option>
                    <option value="arroba" disabled={tipoVenda === 'pe'}>Arroba (@)</option>
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
                  <label className={labelCls}>Retiro</label>
                  <select
                    className={`${inputCls} mt-1.5`}
                    value={retiro}
                    onChange={(e) => setRetiro(e.target.value)}
                  >
                    <option value="">—</option>
                    {retiros.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-5">
                <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold text-gray-700">
                  <Tags size={15} className="text-[#16a34a]" /> Animais por categoria
                </h3>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex shrink-0 items-center gap-2">
                    <IconCardButton
                      active={modoIndividual}
                      onClick={() => setModoIndividual(true)}
                      title="Detalhamento individual (por ID)"
                      icon={<BrincoBovinoIcon size={22} />}
                    />
                    <IconCardButton
                      active={!modoIndividual}
                      onClick={() => setModoIndividual(false)}
                      title="Lote de animais (visão coletiva)"
                      icon={<LoteAnimaisIcon size={28} />}
                    />
                  </div>

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
                      Peso vivo total <span className="text-[10px] font-medium text-gray-400">(kg)</span> <span className="text-red-500">*</span>
                    </label>
                    <div className="flex h-10 items-center justify-end rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-700 tabular-nums mt-1.5">
                      {fmtNum(calculatedPesoVivoTotal, 0)}
                    </div>
                  </div>
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
                  <DollarSign size={15} className="text-[#16a34a]" /> Valores da compra
                </button>

                {valoresAberto ? (
                  <>
                    <p className="mb-3 mt-2 text-[11.5px] text-gray-400">
                      Valor/kg e peso vivo total são informados por categoria; os totais abaixo consolidam todas as categorias.
                    </p>

                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:grid-cols-4">
                      <Preview label="Peso vivo total (com desconto)" value={calc.totalPesoMorto > 0 ? `${fmtNum(calc.totalPesoMorto, 0)} kg` : '—'} />
                      <Preview label="Valor/kg médio" value={fmtBRL(calc.valorArroba)} />
                      <Preview label="Valor/cabeça" value={fmtBRL(calc.valorCab)} />
                      <Preview label="Valor total" value={fmtBRL(calc.valorTotal)} strong />
                    </div>
                  </>
                ) : null}
              </div>

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
                    placeholder="Detalhes da compra..."
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                  />
                ) : null}
              </div>

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

            <div className="flex flex-col border-t border-gray-200 p-5 @min-[1180px]:border-l @min-[1180px]:border-t-0">
              <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-gray-700">
                <Tags size={15} className="text-[#16a34a]" /> Categorias do lote
              </h3>
              <CompraCategoriaGrid rows={itens} onEdit={editCat} onRemove={removeCat} />
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3 text-[12px] text-gray-500">
                <span className="font-semibold uppercase tracking-wide">Total</span>
                <span className="flex items-baseline gap-3">
                  <span>Sem ID <strong className="tabular-nums text-gray-700">{itens.reduce((a, it) => a + (it.qtd || 0), 0)}</strong></span>
                  <span>Com ID <strong className="tabular-nums text-[#2563eb]">{totalComId}</strong></span>
                  <span className="text-[17px] font-bold tabular-nums text-[#16a34a]">{totalGeral} cab.</span>
                </span>
              </div>
            </div>
          </div>

          {modoIndividual ? (
            <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
              <h3 className="mb-1 flex items-center gap-2 text-[13px] font-bold text-gray-700">
                <BrincoBovinoIcon size={18} className="text-[#16a34a]" /> Compra individual por ID
              </h3>
              <p className="mb-3 text-[11.5px] text-gray-400">
                O Valor/kg de cada animal já vem preenchido com o valor do lote (acima) — edite se necessário.
              </p>

              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0" style={{ flex: '1 1 130px' }}>
                  <label className={`${labelCls} inline-flex items-center gap-1`}>
                    <Tag size={13} className="text-[#16a34a]" /> ID Manejo
                  </label>
                  <input
                    type="text"
                    className={`${inputCls} mt-1.5`}
                    placeholder="504A"
                    value={entIdManejo}
                    onChange={(e) => setEntIdManejo(e.target.value)}
                  />
                </div>
                <div className="min-w-0" style={{ flex: '1 1 150px' }}>
                  <label className={`${labelCls} inline-flex items-center gap-1`}>
                    <Cpu size={13} className="text-[#16a34a]" /> ID Eletrônico
                  </label>
                  <input
                    type="text"
                    className={`${inputCls} mt-1.5`}
                    placeholder="982000123456789"
                    value={entIdEletronico}
                    onChange={(e) => setEntIdEletronico(e.target.value)}
                  />
                </div>
                <div className="min-w-0" style={{ flex: '0 0 190px' }}>
                  <label className={labelCls}>Categoria <span className="text-red-500">*</span></label>
                  <select className={`${inputCls} mt-1.5`} value={entCategoria} onChange={(e) => setEntCategoria(e.target.value)}>
                    <option value="">Selecione a categoria</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: '0 0 100px' }}>
                  <label className={`${labelCls} whitespace-nowrap`}>Peso vivo <span className="text-[10px] font-medium text-gray-400">(kg)</span></label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={`${inputCls} mt-1.5`}
                    placeholder="480"
                    value={entPesoVivoStr}
                    onChange={(e) => setEntPesoVivoStr(e.target.value)}
                  />
                </div>
                <div style={{ flex: '0 0 110px' }}>
                  <label className={`${labelCls} whitespace-nowrap`}>Valor/kg <span className="text-[10px] font-medium text-gray-400">(R$)</span></label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={`${inputCls} mt-1.5`}
                    placeholder={valorArrobaStr || 'Ex.: 12,00'}
                    value={entValorArrobaStr || valorArrobaStr}
                    onChange={(e) => setEntValorArrobaStr(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={addDetalhe}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#16a34a] px-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#15803d]"
                >
                  <Plus size={16} /> add
                </button>
              </div>

              <div className="mt-3 overflow-auto" style={{ maxHeight: 240 }}>
                {detalhe.length ? (
                  detalhe.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-2 border-t border-gray-100 py-2 text-[13px] first:border-t-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-gray-800">{d.idManejo || d.idEletronico || '—'}</div>
                        <div className="truncate text-[11px] text-gray-500">
                          {catName(d.catId)}
                          {d.idManejo && d.idEletronico ? ` · ${d.idEletronico}` : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5">
                        <span className="tabular-nums text-[11px] text-gray-500">
                          {d.pesoVivoKg != null ? `${fmtNum(d.pesoVivoKg, 0)} kg` : '—'}
                        </span>
                        <span className="tabular-nums text-[11px] text-[#16a34a] font-semibold">
                          {d.valorArroba != null ? fmtBRL(d.valorArroba) : '—'}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeDetalhe(d.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="Remover"
                          aria-label="Remover"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-3 text-center text-[12.5px] text-gray-400">
                    Nenhum animal detalhado — informe o ID e os pesos e clique em “add”.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ maxWidth: PANEL_MAX_W }}>
          <div className="mb-4">
            <h2 className="text-[17px] font-bold text-gray-900">Todos os lançamentos — Compras</h2>
            <p className="mt-0.5 text-[12.5px] text-gray-500">
              Clique em um lançamento para abri-lo; use ••• para editar ou excluir.
            </p>
          </div>
          <CompraLancamentosRecentes
            movimentos={movimentos}
            catName={catName}
            pessoaName={pessoaName}
            onEditar={editarMovimento}
            onExcluir={excluirMovimento}
          />
        </div>
      )}
    </div>
  );
};

export default CompraView;
