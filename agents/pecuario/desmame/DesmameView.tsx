import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { List, Tags, Info, Plus, Layers } from 'lucide-react';
import { useHierarchy } from '../../../contexts/HierarchyContext';
import PessoaSelector from '../../../components/PessoaSelector';
import { listAnimalCategories, type AnimalCategory } from '../../../lib/api/animalCategoriesClient';
import { listMovimentos as listNascimentos, type NascimentoMovimentoRow } from '../../../lib/api/nascimentosClient';
import { listFichasAnimal, fichaToFormValues, type FichaAnimalRow } from '../../../lib/api/fichasAnimalClient';
import { listMovimentos as listMortes, type MorteMovimentoRow } from '../../../lib/api/mortesClient';
import { listMotivosMorte, type MotivoMorte } from '../../../lib/api/motivosMorteClient';
import {
  listMovimentos as listDesmames,
  weanAnimal,
  type DesmameMovimentoRow,
} from '../../../lib/api/desmamesClient';
import IconCardButton from '../../../components/IconCardButton';
import CategoriaGrid from '../nascimento/CategoriaGrid';
import BrincoBovinoIcon from '../nascimento/BrincoBovinoIcon';
import LoteAnimaisIcon from '../nascimento/LoteAnimaisIcon';
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
import type { ConsolidatedRow, DesmameEdit, DesmameRow, LookupItem } from './types';

const PANEL_MAX_W = '100%';

interface DesmameViewProps {
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const DesmameView: React.FC<DesmameViewProps> = ({ onToast }) => {
  const { selectedOrganization, farms } = useHierarchy();
  const organizationId = selectedOrganization?.id ?? '';

  // ── Dados carregados ────────────────────────────────────────────────────
  const [categories, setCategories] = useState<AnimalCategory[]>([]);
  const [nascimentos, setNascimentos] = useState<NascimentoMovimentoRow[]>([]);
  const [persistedRows, setPersistedRows] = useState<FichaAnimalRow[]>([]);
  const [mortes, setMortes] = useState<MorteMovimentoRow[]>([]);
  const [motivos, setMotivos] = useState<MotivoMorte[]>([]);
  const [desmameMovs, setDesmameMovs] = useState<DesmameMovimentoRow[]>([]);

  // ── Cabeçalho ───────────────────────────────────────────────────────────
  const today = todayISO();
  const [data, setData] = useState(today);
  const safra = safraDaData(data);
  const [proprietario, setProprietario] = useState<string | null>(null);
  const [fazenda, setFazenda] = useState('');
  const [retiro, setRetiro] = useState('');
  const [local, setLocal] = useState('');

  // ── Modo / edição por linha ─────────────────────────────────────────────
  const [fromDetail, setFromDetail] = useState(true);
  const [rowState, setRowState] = useState<Record<string, DesmameEdit>>({});
  const [aba, setAba] = useState<'lancar' | 'historico'>('lancar');
  // Layout da tela: 'padrao' = toggle de ícones (brinco/lote) como na tela de
  // Nascimento; 'padrao2' = layout atual (botões rotulados). Comportamento de
  // desmamar por animal é o mesmo nos dois.
  const [layoutDesmame, setLayoutDesmame] = useState<'padrao' | 'padrao2'>('padrao');

  // ── Carregamentos ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!organizationId) {
      setCategories([]);
      setNascimentos([]);
      setPersistedRows([]);
      setMortes([]);
      setMotivos([]);
      setDesmameMovs([]);
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
    listDesmames(organizationId)
      .then((rows) => { if (!cancelled) setDesmameMovs(rows); })
      .catch((err: any) => onToast?.(err?.message || 'Erro ao carregar desmames', 'error'));
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
  const isMamando = useCallback((id: string) => catById.get(id)?.grupo === 'bezerros_mamando', [catById]);
  const lookupCategories = useMemo<LookupItem[]>(
    () => categories.map((c) => ({ id: c.id, nome: c.nome, sexo: c.sexo })),
    [categories],
  );
  // Destino do desmame: categorias até 12 meses que não sejam bezerros mamando.
  const destinoOptions = useMemo(
    () => categories.filter((c) => c.idadeFaixa === 'ate_12' && c.grupo !== 'bezerros_mamando' && c.ativo),
    [categories],
  );

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

  // ── Movimento da sessão (mesma data+fazenda+retiro+proprietário) ───────────
  const currentMov = useMemo(
    () => desmameMovs.find((m) =>
      m.data === data &&
      (m.farmId || '') === (fazenda || '') &&
      (m.retiro || '') === (retiro || '') &&
      (m.proprietarioId || '') === (proprietario || ''),
    ) || null,
    [desmameMovs, data, fazenda, retiro, proprietario],
  );

  // Animais já desmamados nesta sessão — caem da lista na hora.
  const weanedApelidos = useMemo(
    () => new Set((currentMov?.fichas || []).map((f) => normId(f.apelido || ''))),
    [currentMov],
  );

  // ── Lista de bezerros mamando disponíveis ──────────────────────────────────
  const mamandoRows = useMemo<DesmameRow[]>(() => {
    return comSituacao
      .filter((f) => (f.situacao || 'ativo') === 'ativo')
      .filter((f) => isMamando(f.categoria || ''))
      .filter((f) => { const af = f.__farmId; return !fazenda || !af || af === fazenda; })
      .filter((f) => { const ar = f.__retiro; return !retiro || !ar || ar === retiro; })
      .filter((f) => !weanedApelidos.has(normId(f.apelido || '')))
      .map((f) => ({
        apelido: f.apelido || '',
        rfid: f.rfid || '',
        categoriaAtualId: f.categoria || '',
        src: f[FICHA_SRC_KEY] || '',
        fichaId: f[FICHA_ID_KEY] || '',
      }))
      .filter((r) => r.apelido)
      .sort((a, b) => a.apelido.localeCompare(b.apelido, 'pt-BR', { numeric: true }));
  }, [comSituacao, isMamando, fazenda, retiro, weanedApelidos]);

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
  const totalDesmamados = currentMov?.qtd || 0;

  // ── Edição por linha ───────────────────────────────────────────────────────
  const setDestino = useCallback((apelido: string, destino: string) => {
    setRowState((prev) => ({ ...prev, [apelido]: { destino, peso: prev[apelido]?.peso || '' } }));
  }, []);
  const setPeso = useCallback((apelido: string, peso: string) => {
    setRowState((prev) => ({ ...prev, [apelido]: { destino: prev[apelido]?.destino || '', peso } }));
  }, []);

  // ── Desmamar (salvar na hora) ──────────────────────────────────────────────
  const desmamar = useCallback(async (row: DesmameRow) => {
    if (!organizationId) { onToast?.('Selecione uma organização antes de desmamar', 'error'); return; }
    const st = rowState[row.apelido] || { destino: '', peso: '' };
    if (!st.destino) { onToast?.('Selecione a nova categoria', 'error'); return; }
    const pesoNum = parseFloat((st.peso || '').replace(',', '.'));
    if (!st.peso || !Number.isFinite(pesoNum) || pesoNum <= 0) {
      onToast?.('Informe o peso de desmama', 'error');
      return;
    }
    const destinoCat = catById.get(st.destino);
    try {
      const mov = await weanAnimal({
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
        categoriaDestinoId: st.destino,
        peso: st.peso,
        sexo: destinoCat?.sexo || null,
        nascimentoFichaId: row.src === 'nascimento' ? row.fichaId : null,
      });
      setDesmameMovs((prev) => {
        const idx = prev.findIndex((m) => m.id === mov.id);
        if (idx >= 0) { const next = prev.slice(); next[idx] = mov; return next; }
        return [mov, ...prev];
      });
      setRowState((prev) => { const next = { ...prev }; delete next[row.apelido]; return next; });
      onToast?.(`Desmamado · ${row.apelido} → ${destinoCat?.nome || ''}`, 'success');
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao desmamar', 'error');
    }
  }, [organizationId, rowState, data, fazenda, local, retiro, proprietario, safra, catById, onToast]);

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
            <h1 className="text-lg font-black tracking-tight text-[#0F172A] md:text-xl">Desmame</h1>
          </div>

          {/* Tab de layout da tela: Padrão (toggle de ícones, modelo Nascimento) × Padrão 2 (atual) */}
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setLayoutDesmame('padrao')}
              className={`rounded-md px-3 py-1 text-[12.5px] font-semibold transition-colors ${
                layoutDesmame === 'padrao' ? 'bg-[#16a34a] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Padrão
            </button>
            <button
              type="button"
              onClick={() => setLayoutDesmame('padrao2')}
              className={`rounded-md px-3 py-1 text-[12.5px] font-semibold transition-colors ${
                layoutDesmame === 'padrao2' ? 'bg-[#16a34a] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
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
            {desmameMovs.length ? (
              <span
                className={`ml-0.5 rounded-full px-1.5 text-[11px] font-bold ${
                  aba === 'historico' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {desmameMovs.length}
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

                {/* Seletor de modo: ícones (Padrão, modelo Nascimento) × botões rotulados (Padrão 2) */}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {layoutDesmame === 'padrao' ? (
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
                    <>
                      <button
                        type="button"
                        onClick={() => setFromDetail((v) => !v)}
                        aria-pressed={fromDetail}
                        className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-sm font-semibold transition-colors ${
                          fromDetail
                            ? 'border-[#b7e0c4] bg-[#e7f6ec] text-[#16a34a]'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <BrincoBovinoIcon size={18} /> Detalhamento individual
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                      >
                        <Layers size={18} /> Lote de animais
                      </button>
                    </>
                  )}
                  <span className="text-[12.5px] text-gray-500">
                    {fromDetail
                      ? `${mamandoRows.length} bezerro(s) mamando disponível(is) para desmame`
                      : 'Clique para listar os bezerros mamando e desmamar por animal'}
                  </span>
                </div>
              </div>

              {/* ── PAINEL DIREITO: distribuição por categoria (destino) ──────── */}
              <div className="flex flex-col border-t border-gray-200 p-5 @min-[1180px]:border-l @min-[1180px]:border-t-0">
                <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-gray-700">
                  <Tags size={15} className="text-[#16a34a]" /> Distribuição por categoria
                </h3>
                <CategoriaGrid rows={consolidated} onEdit={() => {}} onRemove={() => {}} />
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3 text-[12px] text-gray-500">
                  <span className="font-semibold uppercase tracking-wide">Total desmamados</span>
                  <span className="text-[17px] font-bold tabular-nums text-[#16a34a]">{totalDesmamados} cab.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Lista de bezerros mamando */}
          {fromDetail ? (
            <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5" style={{ maxWidth: PANEL_MAX_W }}>
              <h3 className="mb-1 flex items-center gap-2 text-[13px] font-bold text-gray-700">
                <BrincoBovinoIcon size={18} className="text-[#16a34a]" /> Bezerros mamando
              </h3>
              <p className="mb-3 text-[11.5px] text-gray-400">
                Escolha a nova categoria, informe o peso e clique em “Desmamar” — a categoria do animal muda na hora.
              </p>

              {mamandoRows.length ? (
                <div className="overflow-auto rounded-xl border border-gray-200" style={{ maxHeight: 460 }}>
                  <table className="w-full border-collapse text-[13px]">
                    <thead className="sticky top-0 z-10 bg-[#fcfcfd]">
                      <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                        <th className="border-b border-gray-200 px-3 py-2.5">ID Manejo</th>
                        <th className="border-b border-gray-200 px-3 py-2.5">Categoria atual</th>
                        <th className="border-b border-gray-200 px-3 py-2.5" style={{ width: 220 }}>Nova categoria</th>
                        <th className="border-b border-gray-200 px-3 py-2.5" style={{ width: 130 }}>Peso (kg)</th>
                        <th className="border-b border-gray-200 px-3 py-2.5 text-center" style={{ width: 130 }}>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mamandoRows.map((row) => {
                        const st = rowState[row.apelido] || { destino: '', peso: '' };
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
                                onChange={(e) => setDestino(row.apelido, e.target.value)}
                              >
                                <option value="">Selecione…</option>
                                {destinoOptions.map((c) => (
                                  <option key={c.id} value={c.id}>{c.nome}</option>
                                ))}
                              </select>
                            </td>
                            <td className="border-b border-[#f1f2f4] px-3 py-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                className={inputCls}
                                placeholder="Ex.: 180"
                                value={st.peso}
                                onChange={(e) => setPeso(row.apelido, e.target.value)}
                              />
                            </td>
                            <td className="border-b border-[#f1f2f4] px-3 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => desmamar(row)}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#16a34a] px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-[#15803d]"
                              >
                                Desmamar
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
                  Nenhum bezerro mamando disponível para desmame
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
            <h2 className="text-[17px] font-bold text-gray-900">Todos os lançamentos — Desmame</h2>
            <p className="mt-0.5 text-[12.5px] text-gray-500">Cada registro agrupa os desmames de uma sessão (data/fazenda/retiro/proprietário).</p>
          </div>
          {desmameMovs.length ? (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[#fcfcfd] text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    <th className="border-b border-gray-200 px-4 py-3">Data</th>
                    <th className="border-b border-gray-200 px-4 py-3">Fazenda</th>
                    <th className="border-b border-gray-200 px-4 py-3">Distribuição (destino)</th>
                    <th className="border-b border-gray-200 px-4 py-3 text-right">Cabeças</th>
                  </tr>
                </thead>
                <tbody>
                  {desmameMovs.map((m) => (
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
              <h4 className="text-sm font-bold text-gray-700">Nenhum desmame registrado ainda</h4>
              <p className="max-w-sm text-[12.5px] leading-relaxed text-gray-400">
                Vá até a aba “Lançamentos”, ligue o detalhamento individual e desmame os bezerros mamando.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DesmameView;
