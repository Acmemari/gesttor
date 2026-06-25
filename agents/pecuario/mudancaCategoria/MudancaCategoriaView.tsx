import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { List, Tags, Info, ArrowLeftRight, Plus } from 'lucide-react';
import { useHierarchy } from '../../../contexts/HierarchyContext';
import PessoaSelector from '../../../components/PessoaSelector';
import { listAnimalCategories, type AnimalCategory } from '../../../lib/api/animalCategoriesClient';
import { listMovimentos as listNascimentos, type NascimentoMovimentoRow } from '../../../lib/api/nascimentosClient';
import { listFichasAnimal, fichaToFormValues, type FichaAnimalRow } from '../../../lib/api/fichasAnimalClient';
import { listMovimentos as listMortes, type MorteMovimentoRow } from '../../../lib/api/mortesClient';
import { listMotivosMorte, type MotivoMorte } from '../../../lib/api/motivosMorteClient';
import {
  listMovimentos as listMudancas,
  changeCategoryAnimal,
  declareCategoryChange,
  type MudancaCategoriaMovimentoRow,
} from '../../../lib/api/mudancaCategoriaClient';
import CategoriaGrid from '../nascimento/CategoriaGrid';
import BrincoBovinoIcon from '../nascimento/BrincoBovinoIcon';
import LoteAnimaisIcon from '../nascimento/LoteAnimaisIcon';
import IconCardButton from '../../../components/IconCardButton';
import {
  FICHA_SRC_KEY,
  FICHA_ID_KEY,
  normId,
  fichasFromNascimento,
  buildTodasFichas,
  buildMorteIndex,
  applySituacao,
} from '../fichaAnimal/animalRegistry';
import { useRetiros } from '../fichas/useRetiros';
import RetiroField from '../fichas/RetiroField';
import { formatDateBR, safraDaData, todayISO } from '../morte/util';
import type { ConsolidatedRow, MudancaEdit, MudancaRow, LookupItem } from './types';

const PANEL_MAX_W = '100%';

interface MudancaCategoriaViewProps {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const MudancaCategoriaView: React.FC<MudancaCategoriaViewProps> = ({ onToast }) => {
  const { selectedOrganization, farms } = useHierarchy();
  const organizationId = selectedOrganization?.id ?? '';

  // ── Dados carregados ────────────────────────────────────────────────────
  const [categories, setCategories] = useState<AnimalCategory[]>([]);
  const [nascimentos, setNascimentos] = useState<NascimentoMovimentoRow[]>([]);
  const [persistedRows, setPersistedRows] = useState<FichaAnimalRow[]>([]);
  const [mortes, setMortes] = useState<MorteMovimentoRow[]>([]);
  const [motivos, setMotivos] = useState<MotivoMorte[]>([]);
  const [movs, setMovs] = useState<MudancaCategoriaMovimentoRow[]>([]);

  // ── Cabeçalho ───────────────────────────────────────────────────────────
  const today = todayISO();
  const [data, setData] = useState(today);
  const safra = safraDaData(data);
  const [proprietario, setProprietario] = useState<string | null>(null);
  const [fazenda, setFazenda] = useState('');
  const [retiro, setRetiro] = useState('');
  const [local, setLocal] = useState('');

  // ── Categorias da mudança: Saída (origem) → Entrada (destino) ─────────────
  const [saida, setSaida] = useState('');
  const [entrada, setEntrada] = useState('');

  // ── Lançamento coletivo (por quantidade) ──────────────────────────────────
  const [qtdColetiva, setQtdColetiva] = useState('');
  const [pesoColetivo, setPesoColetivo] = useState('');
  const [valorColetivo, setValorColetivo] = useState('');
  const [obsColetiva, setObsColetiva] = useState('');

  // ── Modo / edição por linha ─────────────────────────────────────────────
  // Layout da tela (Padrão = ícones · Padrão 2 = seletor com rótulos) e
  // modo de controle por indivíduo (fromDetail = detalhamento por animal).
  const [layoutMudanca, setLayoutMudanca] = useState<'padrao' | 'guiado'>('padrao');
  const [fromDetail, setFromDetail] = useState(false);
  const [rowState, setRowState] = useState<Record<string, MudancaEdit>>({});
  const [aba, setAba] = useState<'lancar' | 'historico'>('lancar');

  // ── Carregamentos ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!organizationId) {
      setCategories([]);
      setNascimentos([]);
      setPersistedRows([]);
      setMortes([]);
      setMotivos([]);
      setMovs([]);
      return;
    }
    let cancelled = false;
    listAnimalCategories(organizationId)
      .then((rows) => { if (!cancelled) setCategories(rows); })
      .catch((err: any) => onToast?.(err?.message || 'Erro ao carregar categorias', 'error'));
    listNascimentos(organizationId)
      .then((rows) => { if (!cancelled) setNascimentos(rows); })
      .catch(() => { if (!cancelled) setNascimentos([]); });
    listFichasAnimal(organizationId)
      .then((rows) => { if (!cancelled) setPersistedRows(rows); })
      .catch(() => { if (!cancelled) setPersistedRows([]); });
    listMortes(organizationId)
      .then((rows) => { if (!cancelled) setMortes(rows); })
      .catch(() => { if (!cancelled) setMortes([]); });
    listMotivosMorte(organizationId)
      .then((rows) => { if (!cancelled) setMotivos(rows); })
      .catch(() => { if (!cancelled) setMotivos([]); });
    listMudancas(organizationId)
      .then((rows) => { if (!cancelled) setMovs(rows); })
      .catch((err: any) => onToast?.(err?.message || 'Erro ao carregar mudanças de categoria', 'error'));
    return () => { cancelled = true; };
  }, [organizationId, onToast]);

  useEffect(() => {
    if (!fazenda && farms.length > 0) setFazenda(farms[0].id);
  }, [farms, fazenda]);

  const fazendaNome = farms.find((f) => f.id === fazenda)?.name;
  const { farmLocais, retiros, retiroAtivo, defaultRetiroName } = useRetiros(fazenda, fazendaNome);

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

  // ── Helpers de categoria ──────────────────────────────────────────────────
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const catName = useCallback((id: string) => catById.get(id)?.nome || '—', [catById]);
  const lookupCategories = useMemo<LookupItem[]>(
    () => categories.map((c) => ({ id: c.id, nome: c.nome, sexo: c.sexo })),
    [categories],
  );
  const categoriasAtivas = useMemo(() => categories.filter((c) => c.ativo), [categories]);

  const farmName = useCallback((id: string | null) => farms.find((f) => f.id === id)?.name || '', [farms]);
  const motivoNome = useCallback((id: string | null) => motivos.find((m) => m.id === id)?.nome || '', [motivos]);

  // ── Registro efetivo de animais (compartilhado com a Ficha Animal) ─────────
  const nascFichas = useMemo(
    () => fichasFromNascimento(nascimentos, lookupCategories, farmName),
    [nascimentos, lookupCategories, farmName],
  );
  const persisted = useMemo(
    () => persistedRows.map((row) => {
      const v = fichaToFormValues(row);
      if (row.farmId) v.__farmId = row.farmId;
      return v;
    }),
    [persistedRows],
  );
  const todas = useMemo(() => buildTodasFichas(persisted, nascFichas), [persisted, nascFichas]);
  const morteIndex = useMemo(() => buildMorteIndex(mortes, motivoNome), [mortes, motivoNome]);
  const comSituacao = useMemo(() => applySituacao(todas, morteIndex), [todas, morteIndex]);

  // ── Rebanho vivo por categoria (respeita fazenda/retiro selecionados) ──────
  const rebanhoByCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of comSituacao) {
      if ((f.situacao || 'ativo') !== 'ativo') continue;
      if (fazenda && f.__farmId && f.__farmId !== fazenda) continue;
      if (retiro && f.__retiro && f.__retiro !== retiro) continue;
      const cat = f.categoria || '';
      if (!cat) continue;
      map.set(cat, (map.get(cat) ?? 0) + 1);
    }
    return map;
  }, [comSituacao, fazenda, retiro]);
  const rebanhoSaida = saida ? (rebanhoByCat.get(saida) ?? 0) : 0;

  // ── Movimento da sessão (mesma data+fazenda+retiro+proprietário) ───────────
  const currentMov = useMemo(
    () => movs.find((m) =>
      m.data === data &&
      (m.farmId || '') === (fazenda || '') &&
      (m.retiro || '') === (retiro || '') &&
      (m.proprietarioId || '') === (proprietario || ''),
    ) || null,
    [movs, data, fazenda, retiro, proprietario],
  );

  // Animais já movidos nesta sessão — caem da lista na hora.
  const movedApelidos = useMemo(
    () => new Set((currentMov?.fichas || []).filter((f) => f.apelido).map((f) => normId(f.apelido || ''))),
    [currentMov],
  );

  // ── Lista de animais da categoria de saída disponíveis ─────────────────────
  const saidaRows = useMemo<MudancaRow[]>(() => {
    if (!saida) return [];
    return comSituacao
      .filter((f) => (f.situacao || 'ativo') === 'ativo')
      .filter((f) => (f.categoria || '') === saida)
      .filter((f) => { const af = f.__farmId; return !fazenda || !af || af === fazenda; })
      .filter((f) => { const ar = f.__retiro; return !retiro || !ar || ar === retiro; })
      .filter((f) => !movedApelidos.has(normId(f.apelido || '')))
      .map((f) => ({
        apelido: f.apelido || '',
        rfid: f.rfid || '',
        categoriaAtualId: f.categoria || '',
        src: f[FICHA_SRC_KEY] || '',
        fichaId: f[FICHA_ID_KEY] || '',
      }))
      .filter((r) => r.apelido)
      .sort((a, b) => a.apelido.localeCompare(b.apelido, 'pt-BR', { numeric: true }));
  }, [comSituacao, saida, fazenda, retiro, movedApelidos]);

  // ── Distribuição (tally por categoria de destino do movimento da sessão) ───
  const consolidated = useMemo<ConsolidatedRow[]>(
    () => (currentMov?.catDecl || []).map((d) => ({
      catId: d.catId,
      catNome: catName(d.catId),
      declarado: 0,
      detalhado: d.qtd,
      total: d.qtd,
    })),
    [currentMov, catName],
  );
  const totalMovidos = currentMov?.qtd || 0;

  // ── Edição por linha ───────────────────────────────────────────────────────
  const getRow = useCallback(
    (apelido: string): MudancaEdit => rowState[apelido] || { destino: entrada, peso: '', valor: '' },
    [rowState, entrada],
  );
  const patchRow = useCallback((apelido: string, patch: Partial<MudancaEdit>) => {
    setRowState((prev) => {
      const base = prev[apelido] || { destino: entrada, peso: '', valor: '' };
      return { ...prev, [apelido]: { ...base, ...patch } };
    });
  }, [entrada]);

  // ── Mudar categoria de um animal (salvar na hora) ──────────────────────────
  const mudar = useCallback(async (row: MudancaRow) => {
    if (!organizationId) { onToast?.('Selecione uma organização antes de lançar', 'error'); return; }
    const st = getRow(row.apelido);
    const destino = st.destino || entrada;
    if (!destino) { onToast?.('Selecione a categoria de entrada (destino)', 'error'); return; }
    if (destino === row.categoriaAtualId) { onToast?.('A categoria de destino deve ser diferente da atual', 'error'); return; }
    const destinoCat = catById.get(destino);
    try {
      const mov = await changeCategoryAnimal({
        organizationId,
        data,
        farmId: fazenda || null,
        localId: local || null,
        retiro: retiro || null,
        proprietarioId: proprietario || null,
        safra: safra || null,
        apelido: row.apelido,
        rfid: row.rfid || null,
        categoriaOrigemId: row.categoriaAtualId || null,
        categoriaDestinoId: destino,
        peso: st.peso || null,
        valor: st.valor || null,
        sexo: destinoCat?.sexo || null,
        nascimentoFichaId: row.src === 'nascimento' ? row.fichaId : null,
      });
      setMovs((prev) => {
        const idx = prev.findIndex((m) => m.id === mov.id);
        if (idx >= 0) { const next = prev.slice(); next[idx] = mov; return next; }
        return [mov, ...prev];
      });
      setRowState((prev) => { const next = { ...prev }; delete next[row.apelido]; return next; });
      onToast?.(`Categoria alterada · ${row.apelido} → ${destinoCat?.nome || ''}`, 'success');
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao mudar categoria', 'error');
    }
  }, [organizationId, getRow, entrada, catById, data, fazenda, local, retiro, proprietario, safra, onToast]);

  // ── Lançar mudança coletiva (por quantidade) ───────────────────────────────
  const declararColetivo = useCallback(async () => {
    if (!organizationId) { onToast?.('Selecione uma organização antes de lançar', 'error'); return; }
    if (!saida) { onToast?.('Selecione a categoria de saída (origem)', 'error'); return; }
    if (!entrada) { onToast?.('Selecione a categoria de entrada (destino)', 'error'); return; }
    if (saida === entrada) { onToast?.('Saída e entrada devem ser categorias diferentes', 'error'); return; }
    const qtdNum = Math.trunc(Number((qtdColetiva || '').replace(',', '.')));
    if (!qtdNum || qtdNum <= 0) { onToast?.('Informe a quantidade de cabeças', 'error'); return; }
    try {
      const mov = await declareCategoryChange({
        organizationId,
        data,
        farmId: fazenda || null,
        localId: local || null,
        retiro: retiro || null,
        proprietarioId: proprietario || null,
        safra: safra || null,
        categoriaOrigemId: saida || null,
        categoriaDestinoId: entrada,
        qtd: qtdNum,
        peso: pesoColetivo || null,
        valor: valorColetivo || null,
        obs: obsColetiva || null,
      });
      setMovs((prev) => {
        const idx = prev.findIndex((m) => m.id === mov.id);
        if (idx >= 0) { const next = prev.slice(); next[idx] = mov; return next; }
        return [mov, ...prev];
      });
      setQtdColetiva(''); setPesoColetivo(''); setValorColetivo(''); setObsColetiva('');
      onToast?.(`Mudança lançada · ${qtdNum} cab. ${catName(saida)} → ${catName(entrada)}`, 'success');
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao lançar mudança de categoria', 'error');
    }
  }, [organizationId, saida, entrada, qtdColetiva, pesoColetivo, valorColetivo, obsColetiva, data, fazenda, local, retiro, proprietario, safra, catName, onToast]);

  // ── Estilos ────────────────────────────────────────────────────────────────
  const inputCls =
    'w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-[#16a34a] focus:ring-[3px] focus:ring-[#16a34a]/15';
  const labelCls = 'text-[12.5px] font-semibold text-gray-700';

  return (
    <div className="min-h-full bg-[#f9fafb] p-6 md:p-8">
      {/* Cabeçalho + abas */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <ArrowLeftRight size={22} className="text-[#16a34a]" />
            <h1 className="text-lg font-black tracking-tight text-[#0F172A] md:text-xl">Mudança de Categoria</h1>
          </div>

          {/* Tab de layout da tela: Padrão (ícones) × Padrão 2 (seletor com rótulos) */}
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setLayoutMudanca('padrao')}
              className={`rounded-md px-3 py-1 text-[12.5px] font-semibold transition-colors ${
                layoutMudanca === 'padrao' ? 'bg-[#16a34a] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Padrão
            </button>
            <button
              type="button"
              onClick={() => setLayoutMudanca('guiado')}
              className={`rounded-md px-3 py-1 text-[12.5px] font-semibold transition-colors ${
                layoutMudanca === 'guiado' ? 'bg-[#16a34a] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Padrão 2
            </button>
          </div>
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
            {movs.length ? (
              <span
                className={`ml-0.5 rounded-full px-1.5 text-[11px] font-bold ${
                  aba === 'historico' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {movs.length}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {aba === 'lancar' ? (
        <>
          <div className="@container" style={{ maxWidth: PANEL_MAX_W }}>
            <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-gray-200 bg-white @min-[1180px]:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
              {/* ── PAINEL ESQUERDO ─────────────────────────────────────────── */}
              <div className="p-5">
                {/* Cabeçalho — Data, Proprietário, Fazenda, Retiro, Local */}
                <div className="flex flex-wrap items-start gap-3.5">
                  <div className="min-w-0" style={{ flex: '0 0 130px' }}>
                    <label className={labelCls}>Data</label>
                    <input type="date" className={`${inputCls} mt-1.5`} value={data} onChange={(e) => setData(e.target.value)} />
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
                    <select className={`${inputCls} mt-1.5`} value={fazenda} onChange={(e) => { setFazenda(e.target.value); setRetiro(''); setLocal(''); }}>
                      <option value="">—</option>
                      {farms.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex min-w-0 items-start gap-3.5" style={{ flex: '1 1 240px' }}>
                    <div className="min-w-0 flex-1">
                      <RetiroField
                        value={retiro}
                        onChange={(v) => { setRetiro(v); setLocal(''); }}
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
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Categorias — Saída (origem) → Entrada (destino) */}
                <div className="mt-5 rounded-xl border border-gray-200 bg-[#fcfcfd] p-4">
                  <div className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-gray-500">
                    <Tags size={14} className="text-[#16a34a]" /> Categorias
                  </div>
                  <div className="flex flex-wrap items-end gap-3.5">
                    <div className="min-w-0" style={{ flex: '1 1 220px' }}>
                      <label className={labelCls}>Saída (categoria de origem)</label>
                      <select className={`${inputCls} mt-1.5`} value={saida} onChange={(e) => setSaida(e.target.value)}>
                        <option value="">Selecione…</option>
                        {categoriasAtivas.map((c) => (
                          <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0" style={{ flex: '0 0 auto' }}>
                      <label className={labelCls}>Rebanho</label>
                      <div className="mt-1.5 inline-flex h-10 items-center rounded-lg border border-[#b7e0c4] bg-[#e7f6ec] px-3 text-sm font-bold tabular-nums text-[#16a34a]">
                        {rebanhoSaida} cab.
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center pb-2 text-gray-300">
                      <ArrowLeftRight size={18} />
                    </div>
                    <div className="min-w-0" style={{ flex: '1 1 220px' }}>
                      <label className={labelCls}>Entrada (categoria de destino)</label>
                      <select className={`${inputCls} mt-1.5`} value={entrada} onChange={(e) => setEntrada(e.target.value)}>
                        <option value="">Selecione…</option>
                        {categoriasAtivas.map((c) => (
                          <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Modo de controle por animal: Lote (coletivo) × Detalhamento individual */}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {layoutMudanca === 'padrao' ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <IconCardButton
                          active={fromDetail}
                          onClick={() => setFromDetail(true)}
                          title="Detalhamento individual (por animal)"
                          icon={<BrincoBovinoIcon size={22} />}
                        />
                        <IconCardButton
                          active={!fromDetail}
                          onClick={() => setFromDetail(false)}
                          title="Lote de animais (visão coletiva)"
                          icon={<LoteAnimaisIcon size={28} />}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setFromDetail(true)}
                          aria-pressed={fromDetail}
                          title="Detalhamento individual (por animal)"
                          className={`inline-flex h-11 items-center gap-2.5 rounded-xl border px-4 text-sm font-semibold transition-colors ${
                            fromDetail
                              ? 'border-[#16a34a] bg-[#e7f6ec] text-[#16a34a]'
                              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <BrincoBovinoIcon size={22} /> Detalhamento individual
                        </button>
                        <button
                          type="button"
                          onClick={() => setFromDetail(false)}
                          aria-pressed={!fromDetail}
                          title="Lote de animais (visão coletiva)"
                          className={`inline-flex h-11 items-center gap-2.5 rounded-xl border px-4 text-sm font-semibold transition-colors ${
                            !fromDetail
                              ? 'border-[#16a34a] bg-[#e7f6ec] text-[#16a34a]'
                              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <LoteAnimaisIcon size={26} /> Lote de animais
                        </button>
                      </div>
                    )}
                    <span className="text-[12.5px] text-gray-500">
                      {fromDetail
                        ? (saida
                            ? `${saidaRows.length} animal(is) em ${catName(saida)} disponível(is) para mudança`
                            : 'Selecione a categoria de saída para listar os animais')
                        : 'Lançamento coletivo — informe a quantidade de cabeças'}
                    </span>
                  </div>

                  {/* Lançamento coletivo (por quantidade) — modo Lote */}
                  {!fromDetail ? (
                  <div className="mt-4 flex flex-wrap items-end gap-3.5">
                    <div className="min-w-0" style={{ flex: '0 0 110px' }}>
                      <label className={labelCls}>Quantidade</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={`${inputCls} mt-1.5`}
                        placeholder="Cab."
                        value={qtdColetiva}
                        onChange={(e) => setQtdColetiva(e.target.value)}
                      />
                    </div>
                    <div className="min-w-0" style={{ flex: '0 0 130px' }}>
                      <label className={labelCls}>Peso/cabeça (kg)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        className={`${inputCls} mt-1.5`}
                        placeholder="Ex.: 220"
                        value={pesoColetivo}
                        onChange={(e) => setPesoColetivo(e.target.value)}
                      />
                    </div>
                    <div className="min-w-0" style={{ flex: '0 0 140px' }}>
                      <label className={labelCls}>Valor/cabeça (R$)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        className={`${inputCls} mt-1.5`}
                        placeholder="Ex.: 2500"
                        value={valorColetivo}
                        onChange={(e) => setValorColetivo(e.target.value)}
                      />
                    </div>
                    <div className="min-w-0" style={{ flex: '1 1 200px' }}>
                      <label className={labelCls}>Observação</label>
                      <input
                        type="text"
                        className={`${inputCls} mt-1.5`}
                        placeholder="Opcional"
                        value={obsColetiva}
                        onChange={(e) => setObsColetiva(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={declararColetivo}
                      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#16a34a] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#15803d]"
                    >
                      <Plus size={16} /> Lançar mudança
                    </button>
                  </div>
                  ) : null}
                </div>
              </div>

              {/* ── PAINEL DIREITO: distribuição por categoria (destino) ──────── */}
              <div className="flex flex-col border-t border-gray-200 p-5 @min-[1180px]:border-l @min-[1180px]:border-t-0">
                <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-gray-700">
                  <Tags size={15} className="text-[#16a34a]" /> Distribuição por categoria (entrada)
                </h3>
                <CategoriaGrid rows={consolidated} onEdit={() => {}} onRemove={() => {}} />
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3 text-[12px] text-gray-500">
                  <span className="font-semibold uppercase tracking-wide">Total movido</span>
                  <span className="text-[17px] font-bold tabular-nums text-[#16a34a]">{totalMovidos} cab.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Lista de animais da categoria de saída */}
          {fromDetail ? (
            <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5" style={{ maxWidth: PANEL_MAX_W }}>
              <h3 className="mb-1 flex items-center gap-2 text-[13px] font-bold text-gray-700">
                <BrincoBovinoIcon size={18} className="text-[#16a34a]" /> Animais da categoria de saída
              </h3>
              <p className="mb-3 text-[11.5px] text-gray-400">
                Escolha a nova categoria, informe peso/valor (opcional) e clique em “Mudar” — a categoria do animal muda na hora.
              </p>

              {!saida ? (
                <p className="py-6 text-center text-[12.5px] text-gray-400">
                  Selecione a categoria de saída (origem) para listar os animais.
                </p>
              ) : saidaRows.length ? (
                <div className="overflow-auto rounded-xl border border-gray-200" style={{ maxHeight: 460 }}>
                  <table className="w-full border-collapse text-[13px]">
                    <thead className="sticky top-0 z-10 bg-[#fcfcfd]">
                      <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                        <th className="border-b border-gray-200 px-3 py-2.5">ID Manejo</th>
                        <th className="border-b border-gray-200 px-3 py-2.5">Categoria atual</th>
                        <th className="border-b border-gray-200 px-3 py-2.5" style={{ width: 220 }}>Nova categoria</th>
                        <th className="border-b border-gray-200 px-3 py-2.5" style={{ width: 120 }}>Peso (kg)</th>
                        <th className="border-b border-gray-200 px-3 py-2.5" style={{ width: 130 }}>Valor (R$)</th>
                        <th className="border-b border-gray-200 px-3 py-2.5 text-center" style={{ width: 120 }}>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {saidaRows.map((row) => {
                        const st = getRow(row.apelido);
                        return (
                          <tr key={row.apelido} className="hover:bg-[#fafbfc]">
                            <td className="border-b border-[#f1f2f4] px-3 py-2 font-semibold text-gray-800">
                              {row.apelido}
                              {row.rfid ? <div className="font-mono text-[10.5px] font-normal text-gray-400">{row.rfid}</div> : null}
                            </td>
                            <td className="border-b border-[#f1f2f4] px-3 py-2 text-gray-600">{catName(row.categoriaAtualId)}</td>
                            <td className="border-b border-[#f1f2f4] px-3 py-2">
                              <select
                                className={inputCls}
                                value={st.destino}
                                onChange={(e) => patchRow(row.apelido, { destino: e.target.value })}
                              >
                                <option value="">Selecione…</option>
                                {categoriasAtivas
                                  .filter((c) => c.id !== row.categoriaAtualId)
                                  .map((c) => (
                                    <option key={c.id} value={c.id}>{c.nome}</option>
                                  ))}
                              </select>
                            </td>
                            <td className="border-b border-[#f1f2f4] px-3 py-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                className={inputCls}
                                placeholder="Ex.: 220"
                                value={st.peso}
                                onChange={(e) => patchRow(row.apelido, { peso: e.target.value })}
                              />
                            </td>
                            <td className="border-b border-[#f1f2f4] px-3 py-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                className={inputCls}
                                placeholder="Ex.: 2500"
                                value={st.valor}
                                onChange={(e) => patchRow(row.apelido, { valor: e.target.value })}
                              />
                            </td>
                            <td className="border-b border-[#f1f2f4] px-3 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => mudar(row)}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#16a34a] px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-[#15803d]"
                              >
                                <ArrowLeftRight size={15} /> Mudar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-6 text-center text-[12.5px] text-gray-400">
                  Nenhum animal vivo em {catName(saida)}
                  {fazenda ? ' nesta fazenda' : ''}{retiro ? ' / retiro' : ''}.
                </p>
              )}
            </div>
          ) : null}
        </>
      ) : (
        /* Aba Registros */
        <div style={{ maxWidth: PANEL_MAX_W }}>
          <div className="mb-4">
            <h2 className="text-[17px] font-bold text-gray-900">Todos os lançamentos — Mudança de Categoria</h2>
            <p className="mt-0.5 text-[12.5px] text-gray-500">Cada registro agrupa as mudanças de uma sessão (data/fazenda/retiro/proprietário).</p>
          </div>
          {movs.length ? (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[#fcfcfd] text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    <th className="border-b border-gray-200 px-4 py-3">Data</th>
                    <th className="border-b border-gray-200 px-4 py-3">Fazenda</th>
                    <th className="border-b border-gray-200 px-4 py-3">Distribuição (entrada)</th>
                    <th className="border-b border-gray-200 px-4 py-3 text-right">Cabeças</th>
                  </tr>
                </thead>
                <tbody>
                  {movs.map((m) => (
                    <tr key={m.id} className="hover:bg-[#fafbfc]">
                      <td className="border-b border-[#f1f2f4] px-4 py-3 font-semibold text-gray-800">{formatDateBR(m.data)}</td>
                      <td className="border-b border-[#f1f2f4] px-4 py-3 text-gray-600">{farmName(m.farmId) || '—'}</td>
                      <td className="border-b border-[#f1f2f4] px-4 py-3 text-gray-600">
                        {m.catDecl.length ? m.catDecl.map((d) => `${catName(d.catId)} (${d.qtd})`).join(', ') : '—'}
                      </td>
                      <td className="border-b border-[#f1f2f4] px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{m.qtd} cab.</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e7f6ec] text-[#16a34a]">
                <Info size={26} />
              </div>
              <h4 className="text-sm font-bold text-gray-700">Nenhuma mudança de categoria registrada ainda</h4>
              <p className="max-w-sm text-[12.5px] leading-relaxed text-gray-400">
                Vá até a aba “Lançamentos”, escolha as categorias de saída e entrada e lance a mudança.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MudancaCategoriaView;
