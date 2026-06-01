import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Save, IdCard, Tag, Check, Info, Baby } from 'lucide-react';
import { useHierarchy } from '../../../contexts/HierarchyContext';
import PessoaSelector from '../../../components/PessoaSelector';
import { listAnimalCategories } from '../../../lib/api/animalCategoriesClient';
import { listAnimalBreeds } from '../../../lib/api/animalBreedsClient';
import FieldControl from './FieldControl';
import CategoriaGrid from './CategoriaGrid';
import LancamentoRapido from './LancamentoRapido';
import CamposConfigModal from './CamposConfigModal';
import AtribuirIdPanel from './AtribuirIdPanel';
import { LR_REGISTRY, LOTES_ESTATICOS, defaultPlaces, defaultValue } from './fieldRegistry';
import {
  formatDateBR,
  parseWeight,
  proximoApelido,
  safraAtual,
  somaCategorias,
  statusFrom,
  tallyPorCategoria,
  todayISO,
} from './util';
import type { AtribFicha, ConsolidatedRow, FieldPlace, FieldPlaces, LookupItem, MovimentoNasc, NascCat, NascDetalhe, SanItem } from './types';

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
  const [safra, setSafra] = useState(safraAtual());
  const [data, setData] = useState(today);
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
        if (!cancelled) setCategories(rows.map((c) => ({ id: c.id, nome: c.nome })));
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

  // Quando há raças cadastradas e a raça atual do formulário não está na lista,
  // ajusta para a primeira disponível (mantém o select coerente com o estado).
  useEffect(() => {
    if (racas.length === 0) return;
    setEntryValues((prev) => (racas.includes(prev.raca) ? prev : { ...prev, raca: racas[0] }));
  }, [racas]);

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
    setAutonum(false);
  }, []);

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
  }, [today]);

  const salvar = useCallback(() => {
    const header = {
      fazenda: farms.find((f) => f.id === fazenda)?.name,
      retiro: retiro || undefined,
      local: farmLocais.find((l) => l.id === local)?.name,
      proprietario: proprietario || undefined,
      safra,
    };

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
    const fichas: AtribFicha[] = detalhe.map((d) => ({
      id: fichaSeq.current++,
      apelido: d.values.apelido,
      catId: d.values.categoria,
      rfid: d.values.rfid || undefined,
      sisbov: d.values.sisbov || undefined,
      porte: d.values.porte || undefined,
      raca: d.values.raca || undefined,
      peso: parseWeight(d.values.peso) || undefined,
    }));

    // catDecl consolidado: detalhado (tally) + declarado (cats), somados por catId.
    const tally: Record<string, number> = { ...tallyPorCategoria(detalhe) };
    for (const c of declaradas) tally[c.catId] = (tally[c.catId] || 0) + c.qtd;
    const catDecl = Object.keys(tally).map((catId) => ({ catId, qtd: tally[catId] }));

    const mov: MovimentoNasc = {
      id: `mv-${Date.now()}`,
      data,
      qtd: qtdTotal,
      categoria: null,
      catDecl,
      fichas,
      naoIdentificados: naoIdent,
      status: statusFrom(naoIdent),
      sanitario: sanItems.slice(),
      ...header,
    };
    setMovimentos((prev) => [mov, ...prev]);
    setCats([]);
    setCatSel('');
    setDetalhe([]);
    setSanItems([]);
    setEntryValues(buildEntryValues(today));
    setTotalStr('');
    if (naoIdent > 0) {
      onToast?.(`Nascimento salvo · ${detalhe.length} identificados + ${naoIdent} a detalhar · total ${qtdTotal} cab.`, 'warning');
    } else {
      onToast?.(`Nascimento salvo e conciliado · ${qtdTotal} cab. identificadas`, 'success');
    }
  }, [total, detalhe, cats, catSel, catName, data, sanItems, today, farms, fazenda, retiro, local, farmLocais, proprietario, safra, onToast]);

  // ── Atribuição de ID ──────────────────────────────────────────────────────
  const abrirAtribuicao = useCallback(() => {
    if (!movimentos.length) {
      onToast?.('Nenhum nascimento lançado — salve um lançamento antes de atribuir IDs', 'warning');
      return;
    }
    const alvo = movimentos.find((m) => m.naoIdentificados > 0) || movimentos[0];
    setAtribuirTargetId(alvo.id);
  }, [movimentos, onToast]);

  const addFicha = useCallback(
    (movId: string, ficha: Omit<AtribFicha, 'id'>) => {
      setMovimentos((prev) =>
        prev.map((m) => {
          if (m.id !== movId) return m;
          const fichas = [...m.fichas, { ...ficha, id: fichaSeq.current++ }];
          const naoIdentificados = Math.max(0, m.naoIdentificados - 1);
          return { ...m, fichas, naoIdentificados, status: statusFrom(naoIdentificados) };
        }),
      );
      onToast?.(`Bezerro identificado · ${ficha.apelido}`, 'success');
    },
    [onToast],
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
    'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#2563eb] focus:ring-[3px] focus:ring-[#2563eb]/15';
  const labelCls = 'text-[12.5px] font-semibold text-gray-700';

  return (
    <div className="min-h-full bg-[#f9fafb] p-6 md:p-8">
      <h1 className="mb-5 text-2xl font-bold tracking-tight text-gray-900">Lançar Nascimento</h1>

      <div
        className="rounded-2xl border border-gray-200 bg-white p-5"
        style={{ maxWidth: fromId ? '100%' : 760 }}
      >
        {/* Cabeçalho */}
        <div className="flex flex-wrap gap-4">
          <div className="min-w-0 flex-1" style={{ maxWidth: 200 }}>
            <label className={labelCls}>Safra</label>
            <input className={`${inputCls} mt-1.5`} value={safra} onChange={(e) => setSafra(e.target.value)} />
          </div>
          <div className="min-w-0 flex-1" style={{ maxWidth: 200 }}>
            <label className={labelCls}>Data</label>
            <input type="date" className={`${inputCls} mt-1.5`} value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="min-w-0 flex-1" style={{ minWidth: 220 }}>
            <label className={labelCls}>Proprietário</label>
            <PessoaSelector
              organizationId={organizationId}
              value={proprietario}
              onChange={setProprietario}
              placeholder="Selecionar proprietário..."
              className="mt-1.5 h-10 w-full"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4">
          <div className="min-w-0 flex-1">
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

        {/* Quantidade (âncora) + toggle brinco + categoria/+mais */}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div style={{ flex: '0 0 150px', maxWidth: 150 }}>
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
          <button
            type="button"
            onClick={toggleFromId}
            title="Distribuição vem do ID"
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border ${
              fromId ? 'border-[#cfe0fb] bg-[#eaf1fb] text-[#2563eb]' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Tag size={22} />
          </button>
          <div className="min-w-[180px] flex-1">
            <label className={labelCls}>Categoria <span className="font-medium text-gray-400">(sem detalhe)</span></label>
            <select className={`${inputCls} mt-1.5`} value={catSel} onChange={(e) => setCatSel(e.target.value)}>
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
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#2563eb] bg-white px-3.5 text-sm font-semibold text-[#2563eb] hover:bg-[#eaf1fb]"
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

        {/* Grid consolidado de categorias: declarado + detalhado por categoria */}
        <CategoriaGrid rows={consolidated} onEdit={editCat} onRemove={removeCat} />

        {/* Lançamento Rápido (modo LIGADO) */}
        {fromId ? (
          <LancamentoRapido
            places={places}
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
          />
        ) : null}

        {/* Ações */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={novo}
            className="inline-flex items-center gap-2 rounded-lg border border-[#2563eb] bg-white px-4 py-2 text-sm font-semibold text-[#2563eb] hover:bg-[#eaf1fb]"
          >
            <Plus size={16} /> Novo
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={!salvarHabilitado}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm ${
              salvarHabilitado ? 'bg-[#2563eb] hover:bg-[#1d4fd7]' : 'cursor-not-allowed bg-[#9db8f0]'
            }`}
          >
            <Save size={16} /> Salvar
          </button>
          <button
            type="button"
            onClick={abrirAtribuicao}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <IdCard size={16} /> Atribuir ID
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

      {/* Atribuição de ID */}
      {atribuirTarget ? (
        <div className="mt-6" style={{ maxWidth: fromId ? '100%' : 760 }}>
          <AtribuirIdPanel
            movimento={atribuirTarget}
            categories={categories}
            onAdd={addFicha}
            onClose={() => setAtribuirTargetId(null)}
            onToast={onToast}
          />
        </div>
      ) : (
        /* Lançamentos recentes */
        <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-5 py-3.5">
            <h3 className="text-[15px] font-bold text-gray-900">Lançamentos recentes — Nascimento</h3>
          </div>
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="bg-[#fcfcfd] text-[11px] uppercase tracking-wide text-gray-500">
                <th className="p-3 font-bold">Data</th>
                <th className="p-3 font-bold">Categoria</th>
                <th className="p-3 text-right font-bold">Qtd</th>
                <th className="p-3 font-bold">Identificação</th>
                <th className="p-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {movimentos.length ? (
                movimentos.map((m) => {
                  // catDecl já consolida declarado + detalhado; pendência vem de naoIdentificados.
                  const catCell = m.catDecl.length
                    ? m.catDecl.map((d) => `${catName(d.catId)} (${d.qtd})`).join(', ')
                    : 'A detalhar';
                  return (
                    <tr key={m.id} className="border-t border-gray-100">
                      <td className="p-3 text-gray-700">{formatDateBR(m.data)}</td>
                      <td className="p-3 font-semibold text-gray-800">{catCell}</td>
                      <td className="p-3 text-right tabular-nums text-gray-700">+{m.qtd}</td>
                      <td className="p-3">
                        {m.naoIdentificados > 0 ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fdeee3] px-2.5 py-1 text-[11.5px] font-semibold text-[#ea580c]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#ea580c]" />
                            {m.naoIdentificados} a detalhar
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e7f6ec] px-2.5 py-1 text-[11.5px] font-semibold text-[#16a34a]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
                            {m.fichas.length} detalhados
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {m.status === 'conciliado' ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e7f6ec] px-2.5 py-1 text-[11.5px] font-semibold text-[#16a34a]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" /> Conciliado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fdeee3] px-2.5 py-1 text-[11.5px] font-semibold text-[#ea580c]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#ea580c]" /> Pendente
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400">
                    <Baby size={30} className="mx-auto mb-2 text-gray-300" />
                    Nenhum lançamento ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {configOpen ? (
        <CamposConfigModal
          places={places}
          autonum={autonum}
          onSetPlace={setPlace}
          onToggleAutonum={setAutonum}
          onReset={resetPlaces}
          onClose={() => setConfigOpen(false)}
        />
      ) : null}
    </div>
  );
};

export default NascimentoView;
