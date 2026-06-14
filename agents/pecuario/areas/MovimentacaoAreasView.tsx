import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Split, History, Pencil, ArrowLeftRight, Archive,
  Loader2, X, Save, AlertTriangle, MapPin, Plus, Trash2, ArrowLeft,
} from 'lucide-react';
import { useHierarchy } from '../../../contexts/HierarchyContext';
import CadastroAreasView from './CadastroAreasView';
import { loadAreas } from './areasClient';
import { NIVEIS, TIPOS_LOCAL, type Area, type AreaMovimentoRow } from './types';
import { descreverMovimento, formatDataBR } from './areaTimeline';
import {
  listMovimentosByArea, renomear, mover, aposentar, dividir,
  type FilhoInput,
} from '../../../lib/api/areaMovimentosClient';

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

type ModalKind = 'renomear' | 'mover' | 'aposentar' | 'dividir' | null;

const hojeISO = () => new Date().toISOString().slice(0, 10);

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

  const farmName = useMemo(
    () => (farms.find((f: any) => f.id === fazenda)?.name as string) || 'Fazenda',
    [farms, fazenda],
  );
  const hoje = useMemo(() => hojeISO(), []);
  const ctx: Ctx = { organizationId, farmId: fazenda, hoje };

  const selected = useMemo(() => areas.find((a) => a.id === selId) || null, [areas, selId]);
  const retiros = useMemo(() => areas.filter((a) => a.nivel === 'retiro'), [areas]);
  const setores = useMemo(() => areas.filter((a) => a.nivel === 'setor'), [areas]);

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

  // Após um movimento: recarrega áreas (projeção), histórico e o mapa.
  const aposMovimento = useCallback(async (msg: string) => {
    setModal(null);
    await carregarAreas();
    setReloadToken((t) => t + 1);
    onToast?.(msg, 'success');
  }, [carregarAreas, onToast]);

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
            <CadastroAreasView
              key={fazenda}
              farmId={fazenda}
              farmName={farmName}
              readOnly
              onToast={onToast}
              selId={selId}
              onSelect={setSelId}
              reloadToken={reloadToken}
            />
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

                <div className="flex flex-wrap gap-2 mt-3">
                  <ActionBtn icon={<Pencil size={14} />} label="Renomear" onClick={() => setModal('renomear')} />
                  {selected.nivel === 'local' && (
                    <>
                      <ActionBtn icon={<ArrowLeftRight size={14} />} label="Mover" onClick={() => setModal('mover')} />
                      <ActionBtn icon={<Split size={14} />} label="Dividir" onClick={() => setModal('dividir')} accent />
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
          onToast={onToast} />
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
interface FilhoForm { name: string; tipo: string; area: string }

const DividirModal: React.FC<ModalBaseProps & { onDone: (qtd: number) => void }> = ({ ctx, area, onClose, onDone, onToast }) => {
  const [filhos, setFilhos] = useState<FilhoForm[]>([
    { name: `${area.nome} 1`, tipo: area.tipo || 'Pasto', area: '' },
    { name: `${area.nome} 2`, tipo: area.tipo || 'Pasto', area: '' },
  ]);
  const [data, setData] = useState(ctx.hoje);
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);

  const setFilho = (i: number, patch: Partial<FilhoForm>) =>
    setFilhos((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const addFilho = () => setFilhos((prev) => [...prev, { name: `${area.nome} ${prev.length + 1}`, tipo: area.tipo || 'Pasto', area: '' }]);
  const rmFilho = (i: number) => setFilhos((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));

  const salvar = async () => {
    const limpos = filhos.map((f) => ({ ...f, name: f.name.trim() }));
    if (limpos.some((f) => !f.name)) { onToast?.('Dê um nome a cada área-filho.', 'error'); return; }
    const payload: FilhoInput[] = limpos.map((f) => ({
      name: f.name, tipo: f.tipo || null, area: f.area.trim() ? f.area.trim() : null,
    }));
    try {
      setBusy(true);
      await dividir({ organizationId: ctx.organizationId, farmId: ctx.farmId, data, parentId: area.id, filhos: payload, nota: nota || null });
      onDone(payload.length);
    } catch (err: any) { onToast?.(err?.message || 'Erro ao dividir.', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <ModalShell title={`Dividir “${area.nome}”`} icon={<Split size={16} />} onClose={onClose}
      footer={<><BtnSec onClick={onClose}>Cancelar</BtnSec><BtnPri onClick={salvar} busy={busy}>Dividir</BtnPri></>}>
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
          <div className="grid grid-cols-2 gap-2">
            <select className={inputCls} value={f.tipo} onChange={(e) => setFilho(i, { tipo: e.target.value })}>
              {TIPOS_LOCAL.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input className={inputCls} placeholder="Área (ha) — opcional" value={f.area} onChange={(e) => setFilho(i, { area: e.target.value })} />
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
