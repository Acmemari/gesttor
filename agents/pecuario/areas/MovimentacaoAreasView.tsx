import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Split, History, Pencil, ArrowLeftRight, Archive, Combine, Layers, PencilRuler,
  CalendarClock, Info, Loader2, X, Save, AlertTriangle, MapPin, Plus, Trash2, ArrowLeft,
} from 'lucide-react';
import { useHierarchy } from '../../../contexts/HierarchyContext';
import CadastroAreasView from './CadastroAreasView';
import { loadAreas } from './areasClient';
import { NIVEIS, TIPOS_LOCAL, USOS, type Area, type AreaMovimentoRow, type TipoLocal, type Uso } from './types';
import { descreverMovimento, formatDataBR } from './areaTimeline';
import {
  listMovimentosByArea, listMovimentosByFarm, renomear, mover, aposentar, dividir, unir,
  conversaoUso, type FilhoInput, type RealocacaoMap,
} from '../../../lib/api/areaMovimentosClient';
import { reconstruct } from '../../../lib/api/areaVersoesClient';
import {
  reconstructAsOf, parseRebanhoPendente, mergeRealocacao,
  type RebanhoPendente,
} from './reconstrucao';

type ToastFn = (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;

interface Props {
  onToast?: ToastFn;
  onBack?: () => void;
}

interface Ctx {
  organizationId: string;
  farmId: string;
  hoje: string;
}

type ModalKind =
  | 'renomear' | 'mover' | 'aposentar' | 'dividir' | 'unir' | 'conversao' | 'redesenhar' | null;

/** Args de dividir/unir sem a realocação (re-submetidos com ela após o 409). */
interface DividirInfo {
  organizationId: string; farmId: string; data: string; parentId: string; filhos: FilhoInput[]; nota: string | null;
}
interface UnirInfo {
  organizationId: string; farmId: string; data: string; origemIds: string[]; destino: FilhoInput; nota: string | null;
}

/** Contexto da realocação de rebanho pendente (modal do 409). */
type RealocCtx =
  | { op: 'dividir'; pendente: RebanhoPendente; info: DividirInfo; destinos: { ref: string; nome: string }[] }
  | { op: 'unir'; pendente: RebanhoPendente; info: UnirInfo; destinos: { ref: string; nome: string }[] };

const hojeISO = () => new Date().toISOString().slice(0, 10);

const MS_DIA = 86_400_000;
const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / MS_DIA);
const addDias = (iso: string, d: number) =>
  new Date(Date.parse(iso + 'T00:00:00Z') + d * MS_DIA).toISOString().slice(0, 10);

const MovimentacaoAreasView: React.FC<Props> = ({ onToast, onBack }) => {
  const { selectedOrganization, farms } = useHierarchy();
  const organizationId = selectedOrganization?.id ?? '';

  const [fazenda, setFazenda] = useState('');
  const [areas, setAreas] = useState<Area[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [movs, setMovs] = useState<AreaMovimentoRow[]>([]);
  const [loadingAreas, setLoadingAreas] = useState(false);
  const [loadingHist, setLoadingHist] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [modal, setModal] = useState<ModalKind>(null);

  // Linha do tempo (slider) + foto histórica reconstruída.
  const [asOfDate, setAsOfDate] = useState<string>(() => hojeISO());
  const [asOfAreas, setAsOfAreas] = useState<Area[] | null>(null);
  const [reconstruindo, setReconstruindo] = useState(false);
  const [colorByUso, setColorByUso] = useState(false);
  const [movsFarm, setMovsFarm] = useState<AreaMovimentoRow[]>([]);
  // Realocação de rebanho pendente (modal do 409).
  const [realoc, setRealoc] = useState<RealocCtx | null>(null);
  const [realocBusy, setRealocBusy] = useState(false);

  const farmName = useMemo(
    () => (farms.find((f: any) => f.id === fazenda)?.name as string) || 'Fazenda',
    [farms, fazenda],
  );
  const hoje = useMemo(() => hojeISO(), []);
  const ctx: Ctx = { organizationId, farmId: fazenda, hoje };
  const isPast = asOfDate < hoje;

  const selected = useMemo(() => areas.find((a) => a.id === selId) || null, [areas, selId]);
  const retiros = useMemo(() => areas.filter((a) => a.nivel === 'retiro'), [areas]);
  const setores = useMemo(() => areas.filter((a) => a.nivel === 'setor'), [areas]);
  const locaisAtivos = useMemo(() => areas.filter((a) => a.nivel === 'local'), [areas]);

  // Menor data (1º movimento da fazenda) → início do slider.
  const minDate = useMemo(() => {
    const ds = movsFarm.map((m) => m.data).filter(Boolean);
    return ds.length ? ds.reduce((a, b) => (a < b ? a : b)) : hoje;
  }, [movsFarm, hoje]);
  const maxOffset = Math.max(0, diasEntre(minDate, hoje));
  const offset = Math.max(0, Math.min(maxOffset, diasEntre(minDate, asOfDate)));

  // Pré-seleciona a primeira fazenda uma vez.
  const fazInit = useRef(false);
  useEffect(() => {
    if (!fazInit.current && farms.length > 0) {
      fazInit.current = true;
      setFazenda(farms[0].id);
    }
  }, [farms]);

  const carregarAreas = useCallback(async () => {
    if (!fazenda) { setAreas([]); return; }
    try {
      setLoadingAreas(true);
      setAreas(await loadAreas(fazenda, farmName));
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao carregar áreas.', 'error');
    } finally {
      setLoadingAreas(false);
    }
  }, [fazenda, farmName, onToast]);

  useEffect(() => { carregarAreas(); }, [carregarAreas]);

  const carregarHistorico = useCallback(async (areaId: string) => {
    try {
      setLoadingHist(true);
      setMovs(await listMovimentosByArea(areaId));
    } catch {
      setMovs([]);
    } finally {
      setLoadingHist(false);
    }
  }, []);

  useEffect(() => {
    if (selId) carregarHistorico(selId);
    else setMovs([]);
  }, [selId, carregarHistorico, reloadToken]);

  // Movimentos da fazenda (define o início do slider). Recarrega após cada operação.
  useEffect(() => {
    if (!fazenda) { setMovsFarm([]); return; }
    let cancel = false;
    listMovimentosByFarm(fazenda)
      .then((m) => !cancel && setMovsFarm(m))
      .catch(() => !cancel && setMovsFarm([]));
    return () => { cancel = true; };
  }, [fazenda, reloadToken]);

  // Volta ao "hoje" ao trocar de fazenda.
  useEffect(() => { setAsOfDate(hoje); setAsOfAreas(null); }, [fazenda, hoje]);

  // Arrastar o slider: data < hoje reconstrói o mapa daquele dia (debounce).
  const dragTimer = useRef<number | null>(null);
  const onSlide = useCallback((novoOffset: number) => {
    const nova = addDias(minDate, novoOffset);
    setAsOfDate(nova);
    if (dragTimer.current) window.clearTimeout(dragTimer.current);
    if (nova >= hoje) { setAsOfAreas(null); return; }
    dragTimer.current = window.setTimeout(async () => {
      try {
        setReconstruindo(true);
        const resp = await reconstruct(fazenda, nova);
        setAsOfAreas(reconstructAsOf(resp as any, nova, { farmName }));
      } catch (e: any) {
        onToast?.(e?.message || 'Erro ao reconstruir o mapa.', 'error');
      } finally {
        setReconstruindo(false);
      }
    }, 250);
  }, [minDate, hoje, fazenda, farmName, onToast]);

  const voltarParaHoje = useCallback(() => { setAsOfDate(hoje); setAsOfAreas(null); }, [hoje]);

  // Após um movimento: recarrega áreas (projeção), histórico e o mapa, volta a hoje.
  const aposMovimento = useCallback(async (msg: string) => {
    setModal(null);
    setRealoc(null);
    setAsOfDate(hoje);
    setAsOfAreas(null);
    await carregarAreas();
    setReloadToken((t) => t + 1);
    onToast?.(msg, 'success');
  }, [carregarAreas, onToast, hoje]);

  // Abre o modal de realocação a partir de um 409 REBANHO_PENDENTE.
  const abrirRealocacao = useCallback((ctxRealoc: RealocCtx) => {
    setModal(null);
    setRealoc(ctxRealoc);
  }, []);

  // Confirma a realocação: re-submete dividir/unir com o mapa origem→destino.
  const confirmarRealoc = useCallback(async (realocacao: RealocacaoMap) => {
    if (!realoc) return;
    try {
      setRealocBusy(true);
      if (realoc.op === 'dividir') {
        await dividir({ ...realoc.info, realocacao });
        setSelId(null);
        await aposMovimento('Local dividido — rebanho realocado.');
      } else {
        await unir({ ...realoc.info, realocacao });
        setSelId(null);
        await aposMovimento('Locais unidos — rebanho realocado.');
      }
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao concluir a operação.', 'error');
    } finally {
      setRealocBusy(false);
    }
  }, [realoc, aposMovimento, onToast]);

  return (
    <div className="h-full flex flex-col bg-ai-surface">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4 px-6 pt-5 pb-3 border-b border-gray-200">
        <div>
          {onBack && (
            <button type="button" onClick={onBack}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 mb-2">
              <ArrowLeft size={14} /> Voltar
            </button>
          )}
          <h1 className="text-xl font-bold text-gray-900">Movimentação de Áreas</h1>
          <p className="text-xs text-gray-500 mt-1 max-w-xl">
            Divida, renomeie, mova ou aposente áreas. Cada mudança vira um lançamento com data e
            histórico — a foto atual é a projeção dos movimentos sobre o cadastro inicial.
          </p>
        </div>
        <label className="flex flex-col text-xs font-medium text-gray-600">
          Fazenda
          <select
            value={fazenda}
            onChange={(e) => { setFazenda(e.target.value); setSelId(null); }}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 min-w-[200px]"
          >
            {farms.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
      </div>

      {/* Corpo: mapa + painel */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-0 min-h-0">
        <div className="relative min-h-[360px] border-r border-gray-200">
          {fazenda ? (
            <>
              {/* Slider de linha do tempo sobre o mapa */}
              <div className="absolute top-2 left-2 right-2 z-[1000] pointer-events-none">
                <div className="pointer-events-auto mx-auto max-w-2xl rounded-xl bg-white/95 backdrop-blur shadow border border-gray-200 px-3 py-2 flex items-center gap-3">
                  <CalendarClock size={15} className="text-gray-500 shrink-0" />
                  <input
                    type="range" min={0} max={maxOffset} value={offset} step={1}
                    onChange={(e) => onSlide(Number(e.target.value))}
                    className="flex-1 accent-teal-600"
                    aria-label="Linha do tempo das áreas"
                  />
                  <span className={`text-xs font-medium tabular-nums whitespace-nowrap ${isPast ? 'text-amber-700' : 'text-gray-700'}`}>
                    {formatDataBR(asOfDate)}{isPast ? '' : ' · hoje'}
                  </span>
                  {reconstruindo && <Loader2 size={13} className="animate-spin text-gray-400" />}
                  <button
                    type="button" disabled={!isPast} onClick={voltarParaHoje}
                    className="text-xs font-medium text-teal-700 disabled:text-gray-300 hover:underline"
                  >
                    Hoje
                  </button>
                  <label className="flex items-center gap-1 text-[0.7rem] text-gray-500 cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={colorByUso} onChange={(e) => setColorByUso(e.target.checked)} /> Cor por uso
                  </label>
                </div>
              </div>
              {isPast && (
                <div className="absolute bottom-2 left-2 z-[1000] rounded-md bg-amber-600/90 text-white text-[0.7rem] px-2 py-1 shadow">
                  Vendo {formatDataBR(asOfDate)} — edição desativada
                </div>
              )}
              <CadastroAreasView
                key={fazenda}
                farmId={fazenda}
                farmName={farmName}
                readOnly
                onToast={onToast}
                selId={selId}
                onSelect={setSelId}
                reloadToken={reloadToken}
                asOfAreas={asOfAreas}
                colorByUso={colorByUso}
              />
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">
              Selecione uma fazenda.
            </div>
          )}
        </div>

        {/* Painel direito */}
        <div className="overflow-y-auto p-4 space-y-4">
          {!selected ? (
            <div className="text-sm text-gray-500 flex items-start gap-2 mt-4">
              <MapPin size={16} className="mt-0.5 shrink-0" />
              Selecione uma área no mapa para ver o histórico e lançar movimentos.
            </div>
          ) : (
            <>
              {/* Cartão da área selecionada + ações */}
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ background: NIVEIS[selected.nivel].cor }}
                  />
                  <span className="text-[0.65rem] uppercase tracking-wide text-gray-400">
                    {NIVEIS[selected.nivel].label}
                  </span>
                </div>
                <h2 className="text-base font-bold text-gray-900">{selected.nome}</h2>
                {selected.nivel === 'local' && selected.uso && (
                  <p className="text-xs text-gray-500 mt-0.5">Uso: <b>{selected.uso}</b></p>
                )}

                {isPast ? (
                  <p className="mt-3 text-xs text-amber-700 flex items-center gap-1">
                    <Info size={13} /> Modo histórico — volte para “Hoje” para lançar movimentos.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <ActionBtn icon={<Pencil size={14} />} label="Renomear" onClick={() => setModal('renomear')} />
                    {selected.nivel === 'local' && (
                      <>
                        <ActionBtn icon={<ArrowLeftRight size={14} />} label="Mover" onClick={() => setModal('mover')} />
                        <ActionBtn icon={<Split size={14} />} label="Dividir" onClick={() => setModal('dividir')} accent />
                        <ActionBtn icon={<Combine size={14} />} label="Unir" onClick={() => setModal('unir')} />
                        <ActionBtn icon={<Layers size={14} />} label="Uso" onClick={() => setModal('conversao')} />
                        <ActionBtn icon={<PencilRuler size={14} />} label="Redesenhar" onClick={() => setModal('redesenhar')} />
                        <ActionBtn
                          icon={<Archive size={14} />}
                          label="Aposentar"
                          danger
                          onClick={async () => {
                            if (!confirm(`Aposentar “${selected.nome}”? Ele sai do mapa ativo, mas o histórico e os lançamentos ligados a ele continuam preservados.`)) return;
                            try {
                              await aposentar({ organizationId, farmId: fazenda, data: hoje, areaId: selected.id });
                              setSelId(null);
                              await aposMovimento(`Área aposentada · ${selected.nome}`);
                            } catch (err: any) { onToast?.(err?.message || 'Erro ao aposentar.', 'error'); }
                          }}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Linha do tempo */}
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2 mb-3 text-gray-700">
                  <History size={15} />
                  <h3 className="text-sm font-semibold">Histórico</h3>
                </div>
                {loadingHist ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
                    <Loader2 size={14} className="animate-spin" /> Carregando…
                  </div>
                ) : movs.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">Sem movimentos registrados.</p>
                ) : (
                  <ol className="space-y-3">
                    {movs.map((m) => {
                      const d = descreverMovimento(m);
                      return (
                        <li key={m.id} className="relative pl-4 border-l-2 border-gray-200">
                          <span className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-gray-400" />
                          <div className="text-sm font-medium text-gray-900">{d.titulo}</div>
                          {d.detalhe && <div className="text-xs text-gray-600">{d.detalhe}</div>}
                          <div className="text-[0.7rem] text-gray-400 mt-0.5">
                            {formatDataBR(m.data)}
                            {m.classe === 'correcao' ? ' · correção' : ''}
                            {m.nota ? ` · ${m.nota}` : ''}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </>
          )}

          {loadingAreas && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 size={14} className="animate-spin" /> Atualizando áreas…
            </div>
          )}
        </div>
      </div>

      {/* Modais */}
      {modal === 'renomear' && selected && (
        <RenomearModal ctx={ctx} area={selected} onClose={() => setModal(null)}
          onDone={() => aposMovimento(`Área renomeada · ${selected.nome}`)} onToast={onToast} />
      )}
      {modal === 'mover' && selected && (
        <MoverModal ctx={ctx} area={selected} retiros={retiros} setores={setores}
          onClose={() => setModal(null)} onDone={() => aposMovimento('Área movida.')} onToast={onToast} />
      )}
      {modal === 'dividir' && selected && (
        <DividirModal ctx={ctx} area={selected} onClose={() => setModal(null)}
          onDone={(qtd) => { setSelId(null); aposMovimento(`Local dividido em ${qtd} áreas · “${selected.nome}” aposentado.`); }}
          onConflict={(pendente, info, destinos) => abrirRealocacao({ op: 'dividir', pendente, info, destinos })}
          onToast={onToast} />
      )}
      {modal === 'unir' && selected && (
        <UnirModal ctx={ctx} area={selected} locais={locaisAtivos} onClose={() => setModal(null)}
          onDone={(qtd) => { setSelId(null); aposMovimento(`${qtd} locais unidos.`); }}
          onConflict={(pendente, info, destinos) => abrirRealocacao({ op: 'unir', pendente, info, destinos })}
          onToast={onToast} />
      )}
      {modal === 'conversao' && selected && (
        <ConversaoUsoModal ctx={ctx} area={selected} onClose={() => setModal(null)}
          onDone={() => aposMovimento(`Uso alterado · ${selected.nome}`)} onToast={onToast} />
      )}
      {modal === 'redesenhar' && selected && (
        <RedesenharModal area={selected} onClose={() => setModal(null)} />
      )}
      {realoc && (
        <RealocacaoModal
          ctx={realoc}
          localNome={(id) => areas.find((a) => a.id === id)?.nome ?? id}
          onClose={() => setRealoc(null)}
          onConfirm={confirmarRealoc}
          busy={realocBusy}
        />
      )}
    </div>
  );
};

// ── Botão de ação ──────────────────────────────────────────────────────────────
const ActionBtn: React.FC<{
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; accent?: boolean;
}> = ({ icon, label, onClick, danger, accent }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
      danger
        ? 'border-red-200 text-red-600 hover:bg-red-50'
        : accent
          ? 'border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100'
          : 'border-gray-300 text-gray-700 hover:bg-gray-50'
    }`}
  >
    {icon}{label}
  </button>
);

// ── Shell de modal ──────────────────────────────────────────────────────────────
const ModalShell: React.FC<{
  title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode; footer: React.ReactNode;
}> = ({ title, icon, onClose, children, footer }) => (
  <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2 text-gray-900 font-semibold">{icon}{title}</div>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
      </div>
      <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">{children}</div>
      <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">{footer}</div>
    </div>
  </div>
);

const Campo: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="text-xs font-medium text-gray-600">{label}</span>
    <div className="mt-1">{children}</div>
  </label>
);

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900';

const UsoSelect: React.FC<{ value: Uso; onChange: (u: Uso) => void }> = ({ value, onChange }) => (
  <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as Uso)}>
    {USOS.map((u) => <option key={u} value={u}>{u}</option>)}
  </select>
);

/** Trata o 409 de tolerância de área: pergunta e devolve true p/ re-enviar com ack. */
function confirmarTolerancia(err: any): boolean {
  if (err?.code !== 'AREA_TOLERANCIA') return false;
  const p = err.payload ?? {};
  return confirm(
    `A soma das áreas (${p.informado} ha) diverge ${(Number(p.difPct) * 100).toFixed(1)}% do esperado (${p.esperado} ha). Concluir mesmo assim?`,
  );
}

interface ModalBaseProps {
  ctx: Ctx;
  area: Area;
  onClose: () => void;
  onToast?: ToastFn;
}

// ── Renomear ────────────────────────────────────────────────────────────────────
const RenomearModal: React.FC<ModalBaseProps & { onDone: () => void }> = ({ ctx, area, onClose, onDone, onToast }) => {
  const [nome, setNome] = useState(area.nome);
  const [data, setData] = useState(ctx.hoje);
  const [classe, setClasse] = useState<'movimento' | 'correcao'>('movimento');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);

  const salvar = async () => {
    if (!nome.trim()) { onToast?.('Informe o novo nome.', 'error'); return; }
    try {
      setBusy(true);
      await renomear({ organizationId: ctx.organizationId, farmId: ctx.farmId, data, areaId: area.id, name: nome.trim(), classe, nota: nota || null });
      onDone();
    } catch (err: any) { onToast?.(err?.message || 'Erro ao renomear.', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <ModalShell title="Renomear área" icon={<Pencil size={16} />} onClose={onClose}
      footer={<><BtnSec onClick={onClose}>Cancelar</BtnSec><BtnPri onClick={salvar} busy={busy}>Salvar</BtnPri></>}>
      <Campo label="Novo nome"><input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus /></Campo>
      <Campo label="Data efetiva"><input type="date" className={inputCls} value={data} onChange={(e) => setData(e.target.value)} /></Campo>
      <Campo label="Tipo de mudança">
        <select className={inputCls} value={classe} onChange={(e) => setClasse(e.target.value as any)}>
          <option value="movimento">Mudança no mundo real</option>
          <option value="correcao">Correção de cadastro</option>
        </select>
      </Campo>
      <Campo label="Observação (opcional)"><input className={inputCls} value={nota} onChange={(e) => setNota(e.target.value)} /></Campo>
    </ModalShell>
  );
};

// ── Mover ───────────────────────────────────────────────────────────────────────
const MoverModal: React.FC<ModalBaseProps & { retiros: Area[]; setores: Area[]; onDone: () => void }> = ({
  ctx, area, retiros, setores, onClose, onDone, onToast,
}) => {
  const [retiroId, setRetiroId] = useState('');
  const [setorId, setSetorId] = useState('');
  const [data, setData] = useState(ctx.hoje);
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);

  const salvar = async () => {
    try {
      setBusy(true);
      await mover({
        organizationId: ctx.organizationId, farmId: ctx.farmId, data, areaId: area.id,
        retiroId: retiroId || null, setorId: setorId || null, nota: nota || null,
      });
      onDone();
    } catch (err: any) { onToast?.(err?.message || 'Erro ao mover.', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <ModalShell title="Mover área" icon={<ArrowLeftRight size={16} />} onClose={onClose}
      footer={<><BtnSec onClick={onClose}>Cancelar</BtnSec><BtnPri onClick={salvar} busy={busy}>Mover</BtnPri></>}>
      <p className="text-xs text-gray-500">Defina o novo retiro e/ou setor. Deixe em branco para desvincular do nível.</p>
      <Campo label="Retiro">
        <select className={inputCls} value={retiroId} onChange={(e) => setRetiroId(e.target.value)}>
          <option value="">— nenhum —</option>
          {retiros.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </select>
      </Campo>
      <Campo label="Setor">
        <select className={inputCls} value={setorId} onChange={(e) => setSetorId(e.target.value)}>
          <option value="">— nenhum —</option>
          {setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      </Campo>
      <Campo label="Data efetiva"><input type="date" className={inputCls} value={data} onChange={(e) => setData(e.target.value)} /></Campo>
      <Campo label="Observação (opcional)"><input className={inputCls} value={nota} onChange={(e) => setNota(e.target.value)} /></Campo>
    </ModalShell>
  );
};

// ── Dividir ─────────────────────────────────────────────────────────────────────
interface FilhoForm { name: string; tipo: TipoLocal; uso: Uso; area: string }

interface DividirProps extends ModalBaseProps {
  onDone: (qtd: number) => void;
  onConflict: (pendente: RebanhoPendente, info: DividirInfo, destinos: { ref: string; nome: string }[]) => void;
}

const DividirModal: React.FC<DividirProps> = ({ ctx, area, onClose, onDone, onConflict, onToast }) => {
  const tipo0: TipoLocal = (area.tipo as TipoLocal) || 'Pasto';
  const uso0: Uso = (area.uso as Uso) || 'Pastagem';
  const [filhos, setFilhos] = useState<FilhoForm[]>([
    { name: `${area.nome} 1`, tipo: tipo0, uso: uso0, area: '' },
    { name: `${area.nome} 2`, tipo: tipo0, uso: uso0, area: '' },
  ]);
  const [data, setData] = useState(ctx.hoje);
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);

  const setFilho = (i: number, patch: Partial<FilhoForm>) =>
    setFilhos((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const addFilho = () => setFilhos((prev) => [...prev, { name: `${area.nome} ${prev.length + 1}`, tipo: tipo0, uso: uso0, area: '' }]);
  const rmFilho = (i: number) => setFilhos((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));

  const enviar = async (ackTolerancia?: boolean) => {
    const limpos = filhos.map((f) => ({ ...f, name: f.name.trim() }));
    if (limpos.some((f) => !f.name)) { onToast?.('Dê um nome a cada área-filho.', 'error'); return; }
    const payload: FilhoInput[] = limpos.map((f) => ({
      name: f.name, tipo: f.tipo || null, uso: f.uso || null, area: f.area.trim() ? f.area.trim() : null,
    }));
    const info: DividirInfo = { organizationId: ctx.organizationId, farmId: ctx.farmId, data, parentId: area.id, filhos: payload, nota: nota || null };
    try {
      setBusy(true);
      await dividir({ ...info, ackTolerancia });
      onDone(payload.length);
    } catch (err: any) {
      const pend = parseRebanhoPendente(err);
      if (pend) {
        onConflict(pend, info, payload.map((f, idx) => ({ ref: String(idx), nome: f.name })));
        return;
      }
      if (confirmarTolerancia(err)) { await enviar(true); return; }
      onToast?.(err?.message || 'Erro ao dividir.', 'error');
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title={`Dividir “${area.nome}”`} icon={<Split size={16} />} onClose={onClose}
      footer={<><BtnSec onClick={onClose}>Cancelar</BtnSec><BtnPri onClick={() => enviar()} busy={busy}>Dividir</BtnPri></>}>
      <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        O local original será <b>aposentado</b> (não excluído). O histórico e os lançamentos ligados a ele
        continuam preservados. Você pode desenhar a forma de cada nova área depois, no Cadastro de Áreas.
      </div>

      {filhos.map((f, i) => (
        <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">Área {i + 1}</span>
            {filhos.length > 2 && (
              <button type="button" onClick={() => rmFilho(i)} className="text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
            )}
          </div>
          <input className={inputCls} placeholder="Nome" value={f.name} onChange={(e) => setFilho(i, { name: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <select className={inputCls} value={f.tipo} onChange={(e) => setFilho(i, { tipo: e.target.value as TipoLocal })}>
              {TIPOS_LOCAL.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className={inputCls} value={f.uso} onChange={(e) => setFilho(i, { uso: e.target.value as Uso })}>
              {USOS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <input className={inputCls} placeholder="ha" value={f.area} onChange={(e) => setFilho(i, { area: e.target.value })} />
          </div>
        </div>
      ))}

      <button type="button" onClick={addFilho} className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline">
        <Plus size={14} /> Adicionar área
      </button>

      <Campo label="Data efetiva"><input type="date" className={inputCls} value={data} onChange={(e) => setData(e.target.value)} /></Campo>
      <Campo label="Observação (opcional)"><input className={inputCls} placeholder="Ex.: cerca nova dividindo o pasto" value={nota} onChange={(e) => setNota(e.target.value)} /></Campo>
    </ModalShell>
  );
};

// ── Unir ─────────────────────────────────────────────────────────────────────────
interface UnirProps extends ModalBaseProps {
  locais: Area[];
  onDone: (qtd: number) => void;
  onConflict: (pendente: RebanhoPendente, info: UnirInfo, destinos: { ref: string; nome: string }[]) => void;
}

const UnirModal: React.FC<UnirProps> = ({ ctx, area, locais, onClose, onDone, onConflict, onToast }) => {
  const candidatos = locais.filter((l) => l.id !== area.id);
  const [origens, setOrigens] = useState<string[]>([area.id]);
  const [nome, setNome] = useState(`${area.nome} (unificado)`);
  const [tipo, setTipo] = useState<TipoLocal>((area.tipo as TipoLocal) || 'Pasto');
  const [uso, setUso] = useState<Uso>((area.uso as Uso) || 'Pastagem');
  const [areaHa, setAreaHa] = useState('');
  const [data, setData] = useState(ctx.hoje);
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setOrigens((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const enviar = async (ackTolerancia?: boolean) => {
    if (origens.length < 2) { onToast?.('Selecione ao menos 2 locais para unir.', 'error'); return; }
    if (!nome.trim()) { onToast?.('Dê um nome à área de destino.', 'error'); return; }
    const destino: FilhoInput = { name: nome.trim(), tipo, uso, area: areaHa.trim() ? areaHa.trim() : null };
    const info: UnirInfo = { organizationId: ctx.organizationId, farmId: ctx.farmId, data, origemIds: origens, destino, nota: nota || null };
    try {
      setBusy(true);
      await unir({ ...info, ackTolerancia });
      onDone(origens.length);
    } catch (err: any) {
      const pend = parseRebanhoPendente(err);
      if (pend) { onConflict(pend, info, [{ ref: 'destino', nome: destino.name }]); return; }
      if (confirmarTolerancia(err)) { await enviar(true); return; }
      onToast?.(err?.message || 'Erro ao unir.', 'error');
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title="Unir locais" icon={<Combine size={16} />} onClose={onClose}
      footer={<><BtnSec onClick={onClose}>Cancelar</BtnSec><BtnPri onClick={() => enviar()} busy={busy}>Unir</BtnPri></>}>
      <p className="text-xs text-gray-500">Os locais escolhidos serão <b>aposentados</b> e substituídos por uma nova área. Histórico preservado.</p>
      <Campo label="Locais a unir">
        <div className="space-y-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 p-2">
          {[area, ...candidatos].map((l) => (
            <label key={l.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={origens.includes(l.id)} onChange={() => toggle(l.id)} /> {l.nome}
            </label>
          ))}
        </div>
      </Campo>
      <Campo label="Nome do destino"><input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
      <div className="grid grid-cols-3 gap-2">
        <Campo label="Tipo">
          <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value as TipoLocal)}>
            {TIPOS_LOCAL.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Campo>
        <Campo label="Uso"><UsoSelect value={uso} onChange={setUso} /></Campo>
        <Campo label="Área (ha)"><input className={inputCls} placeholder="ha" value={areaHa} onChange={(e) => setAreaHa(e.target.value)} /></Campo>
      </div>
      <Campo label="Data efetiva"><input type="date" className={inputCls} value={data} onChange={(e) => setData(e.target.value)} /></Campo>
      <Campo label="Observação (opcional)"><input className={inputCls} value={nota} onChange={(e) => setNota(e.target.value)} /></Campo>
    </ModalShell>
  );
};

// ── Conversão de uso ─────────────────────────────────────────────────────────────
const ConversaoUsoModal: React.FC<ModalBaseProps & { onDone: () => void }> = ({ ctx, area, onClose, onDone, onToast }) => {
  const [uso, setUso] = useState<Uso>((area.uso as Uso) || 'Pastagem');
  const [data, setData] = useState(ctx.hoje);
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);

  const salvar = async () => {
    if (uso === area.uso) { onToast?.('Escolha um uso diferente do atual.', 'warning'); return; }
    try {
      setBusy(true);
      await conversaoUso({ organizationId: ctx.organizationId, farmId: ctx.farmId, data, areaId: area.id, uso, nota: nota || null });
      onDone();
    } catch (err: any) { onToast?.(err?.message || 'Erro ao converter uso.', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <ModalShell title="Conversão de uso" icon={<Layers size={16} />} onClose={onClose}
      footer={<><BtnSec onClick={onClose}>Cancelar</BtnSec><BtnPri onClick={salvar} busy={busy}>Converter</BtnPri></>}>
      <p className="text-xs text-gray-500">Uso atual: <b>{area.uso ?? '—'}</b>. A geometria é preservada; cria uma nova versão na linha do tempo.</p>
      <Campo label="Novo uso"><UsoSelect value={uso} onChange={setUso} /></Campo>
      <Campo label="Data efetiva"><input type="date" className={inputCls} value={data} onChange={(e) => setData(e.target.value)} /></Campo>
      <Campo label="Observação (opcional)"><input className={inputCls} value={nota} onChange={(e) => setNota(e.target.value)} /></Campo>
    </ModalShell>
  );
};

// ── Redesenhar (instrucional) ────────────────────────────────────────────────────
const RedesenharModal: React.FC<{ area: Area; onClose: () => void }> = ({ area, onClose }) => (
  <ModalShell title="Redesenhar forma" icon={<PencilRuler size={16} />} onClose={onClose}
    footer={<BtnSec onClick={onClose}>Entendi</BtnSec>}>
    <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
      <Info size={14} className="mt-0.5 shrink-0" />
      Para alterar o contorno de “{area.nome}”, edite os vértices no mapa do <b>Cadastro de Áreas</b>. A mudança
      é registrada como <b>remodelar</b> no histórico, com a área recalculada e uma nova versão na linha do tempo.
    </div>
  </ModalShell>
);

// ── Realocação de rebanho (409 REBANHO_PENDENTE) ─────────────────────────────────
const RealocacaoModal: React.FC<{
  ctx: RealocCtx;
  localNome: (id: string) => string;
  onClose: () => void;
  onConfirm: (r: RealocacaoMap) => void;
  busy: boolean;
}> = ({ ctx, localNome, onClose, onConfirm, busy }) => {
  const single = ctx.op === 'unir' ? ctx.destinos[0]?.ref : null;
  const [escolhas, setEscolhas] = useState<Record<string, string>>(() =>
    single ? Object.fromEntries(ctx.pendente.locais.map((l) => [l.localId, single])) : {},
  );
  const set = (localId: string, ref: string) => setEscolhas((p) => ({ ...p, [localId]: ref }));
  const completo = mergeRealocacao(ctx.pendente.locais, escolhas).ok;

  return (
    <ModalShell title="Realocar rebanho" icon={<AlertTriangle size={16} />} onClose={onClose}
      footer={<><BtnSec onClick={onClose}>Cancelar</BtnSec>
        <BtnPri busy={busy} onClick={() => { const r = mergeRealocacao(ctx.pendente.locais, escolhas); if (r.ok) onConfirm(r.realocacao); }}>
          Confirmar e {ctx.op === 'unir' ? 'unir' : 'dividir'}
        </BtnPri></>}>
      <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        Há rebanho nos locais que serão aposentados. Indique para onde vai o rebanho de cada um antes de concluir.
      </div>
      {ctx.pendente.locais.map((l) => (
        <div key={l.localId} className="rounded-lg border border-gray-200 p-3 space-y-2">
          <div className="text-xs font-semibold text-gray-700">{localNome(l.localId)} · {l.total} cab.</div>
          <ul className="text-[0.7rem] text-gray-500 space-y-0.5">
            {l.porCategoria.map((c) => (
              <li key={c.categoriaId}>{c.categoriaNome ?? 'Categoria'} · {c.quantidade}</li>
            ))}
          </ul>
          {ctx.op === 'unir' ? (
            <p className="text-xs text-gray-500">→ destino: <b>{ctx.destinos[0]?.nome}</b></p>
          ) : (
            <select className={inputCls} value={escolhas[l.localId] ?? ''} onChange={(e) => set(l.localId, e.target.value)}>
              <option value="">— destino —</option>
              {ctx.destinos.map((d) => <option key={d.ref} value={d.ref}>{d.nome}</option>)}
            </select>
          )}
        </div>
      ))}
      {!completo && <p className="text-[0.7rem] text-amber-700">Defina um destino para cada local para concluir.</p>}
    </ModalShell>
  );
};

// ── Botões do rodapé ────────────────────────────────────────────────────────────
const BtnSec: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button type="button" onClick={onClick} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">{children}</button>
);
const BtnPri: React.FC<{ onClick: () => void; busy?: boolean; children: React.ReactNode }> = ({ onClick, busy, children }) => (
  <button type="button" onClick={onClick} disabled={busy}
    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60">
    {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}{children}
  </button>
);

export default MovimentacaoAreasView;
