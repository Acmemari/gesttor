import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Loader2, Target, CalendarCheck2, TrendingUp } from 'lucide-react';
import type { Lote } from '../../../lib/api/lotesClient';
import { listRegimesAlimentares, type RegimeAlimentar } from '../../../lib/api/regimesAlimentaresClient';
import {
  getPlanejamentoByLote, savePlanejamento,
  type FaseNutricional,
} from '../../../lib/api/planejamentoNutricionalClient';
import {
  projetarFases, statusMeta, pesoMorto, pesoMortoEmArrobas, precoPorArroba, toNum,
} from './planejamentoNutri';
import { formatDateBR, todayISO } from './util';
import { inputCls, labelCls } from './LoteModals';

// Representação de edição (tudo string p/ permitir campos vazios enquanto digita).
interface FaseForm {
  id: string;
  dataInicio: string;
  dataFinal: string;
  regimeAlimentarId: string;   // '' = nenhum
  ganhoPrevisto: string;       // kg/dia (raw)
}

const strToNumOrNull = (v: string): number | null => {
  const t = (v ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const s = (v: string | null | undefined): string => (v == null ? '' : String(v));
const uuid = () => (globalThis.crypto?.randomUUID?.() ?? `f_${Date.now()}_${Math.round(performance.now())}`);

/** Formata número no padrão pt-BR; '—' quando não computável. */
const nf = (n: number, dec = 1): string =>
  Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—';
const brl = (n: number): string =>
  Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';

const emptyFase = (): FaseForm => ({
  id: uuid(),
  dataInicio: todayISO(),
  dataFinal: '',
  regimeAlimentarId: '',
  ganhoPrevisto: '',
});

interface Props {
  lote: Lote;
  organizationId: string;
  encerrado: boolean;
  onToast?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const PlanejamentoNutricionalTab: React.FC<Props> = ({ lote, organizationId, encerrado, onToast }) => {
  const [pesoInicial, setPesoInicial] = useState('');
  const [pesoVivoAbate, setPesoVivoAbate] = useState('');
  const [rendimentoCarcaca, setRendimentoCarcaca] = useState('');
  const [metaValorVenda, setMetaValorVenda] = useState('');
  const [fases, setFases] = useState<FaseForm[]>([]);

  const [regimes, setRegimes] = useState<RegimeAlimentar[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Carga: plano do lote + regimes alimentares da org ──────────────────────
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const [plano, regs] = await Promise.all([
          getPlanejamentoByLote(lote.id, ac.signal),
          organizationId ? listRegimesAlimentares(organizationId, ac.signal) : Promise.resolve([]),
        ]);
        if (ac.signal.aborted) return;
        setRegimes((regs ?? []).filter((r) => r.ativo));
        if (plano) {
          setPesoInicial(s(plano.pesoInicial));
          setPesoVivoAbate(s(plano.pesoVivoAbate));
          setRendimentoCarcaca(s(plano.rendimentoCarcaca));
          setMetaValorVenda(s(plano.metaValorVenda));
          setFases((plano.fases ?? []).map((f) => ({
            id: f.id || uuid(),
            dataInicio: s(f.dataInicio),
            dataFinal: s(f.dataFinal),
            regimeAlimentarId: s(f.regimeAlimentarId),
            ganhoPrevisto: f.ganhoPrevisto != null ? String(f.ganhoPrevisto) : '',
          })));
        } else {
          setPesoInicial(''); setPesoVivoAbate(''); setRendimentoCarcaca(''); setMetaValorVenda('');
          setFases([]);
        }
      } catch (err: any) {
        if (!ac.signal.aborted) onToast?.(err?.message || 'Erro ao carregar o planejamento nutricional', 'error');
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [lote.id, organizationId, onToast]);

  const regimeNome = useCallback(
    (id: string): string | null => regimes.find((r) => r.id === id)?.nome ?? null,
    [regimes],
  );

  // ── Fases → shape canônico p/ cálculo ──────────────────────────────────────
  const fasesCalc = useMemo<FaseNutricional[]>(
    () => fases.map((f) => ({
      id: f.id,
      dataInicio: f.dataInicio,
      dataFinal: f.dataFinal,
      regimeAlimentarId: f.regimeAlimentarId || null,
      regimeNome: regimeNome(f.regimeAlimentarId),
      ganhoPrevisto: toNum(strToNumOrNull(f.ganhoPrevisto)),
    })),
    [fases, regimeNome],
  );

  const pesoIni = toNum(strToNumOrNull(pesoInicial));
  const pesoAbate = toNum(strToNumOrNull(pesoVivoAbate));
  const rc = toNum(strToNumOrNull(rendimentoCarcaca));
  const valorVenda = toNum(strToNumOrNull(metaValorVenda));

  const projecao = useMemo(() => projetarFases(pesoIni, fasesCalc), [pesoIni, fasesCalc]);
  const status = useMemo(() => statusMeta(pesoIni, fasesCalc, pesoAbate), [pesoIni, fasesCalc, pesoAbate]);

  const pMorto = pesoMorto(pesoAbate, rc);
  const arrobas = pesoMortoEmArrobas(pesoAbate, rc);
  const rPorArroba = precoPorArroba(valorVenda, pesoAbate, rc);

  // ── Edição das fases ───────────────────────────────────────────────────────
  const patchFase = (id: string, patch: Partial<FaseForm>) =>
    setFases((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const addFase = () => setFases((prev) => {
    const last = prev[prev.length - 1];
    const nova = emptyFase();
    // Encadeia a data: a próxima fase começa no fim da anterior.
    if (last?.dataFinal) nova.dataInicio = last.dataFinal;
    return [...prev, nova];
  });
  const removeFase = (id: string) => setFases((prev) => prev.filter((f) => f.id !== id));

  // ── Salvar ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!organizationId) { onToast?.('Selecione uma organização.', 'error'); return; }
    setSaving(true);
    try {
      await savePlanejamento({
        organizationId,
        loteId: lote.id,
        pesoInicial: strToNumOrNull(pesoInicial),
        pesoVivoAbate: strToNumOrNull(pesoVivoAbate),
        rendimentoCarcaca: strToNumOrNull(rendimentoCarcaca),
        metaValorVenda: strToNumOrNull(metaValorVenda),
        fases: fasesCalc,
      });
      onToast?.('Planejamento nutricional salvo.', 'success');
    } catch (err: any) {
      onToast?.(err?.message || 'Erro ao salvar o planejamento nutricional', 'error');
    } finally {
      setSaving(false);
    }
  }, [organizationId, lote.id, pesoInicial, pesoVivoAbate, rendimentoCarcaca, metaValorVenda, fasesCalc, onToast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-gray-400">
        <Loader2 size={16} className="animate-spin" /> Carregando planejamento…
      </div>
    );
  }

  const readOnlyCls = 'flex h-10 items-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 text-sm font-bold text-gray-800';

  return (
    <div className="flex flex-col gap-6">
      {/* ── Metas ──────────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Target size={15} className="text-[#15803d]" />
          <h4 className="text-[12.5px] font-bold uppercase tracking-wide text-gray-600">Metas de abate</h4>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelCls}>Peso inicial (kg)</label>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={pesoInicial} disabled={encerrado}
              onChange={(e) => setPesoInicial(e.target.value)} placeholder="Ex.: 320" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Peso vivo ao abate (kg)</label>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={pesoVivoAbate} disabled={encerrado}
              onChange={(e) => setPesoVivoAbate(e.target.value)} placeholder="Ex.: 520" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Rendimento de carcaça (%)</label>
            <input type="number" inputMode="decimal" min="0" max="100" step="0.01" value={rendimentoCarcaca} disabled={encerrado}
              onChange={(e) => setRendimentoCarcaca(e.target.value)} placeholder="Ex.: 54" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Meta de valor de venda (R$)</label>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={metaValorVenda} disabled={encerrado}
              onChange={(e) => setMetaValorVenda(e.target.value)} placeholder="Ex.: 4500" className={inputCls} />
          </div>
        </div>

        {/* Derivados */}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Peso morto ao abate (kg)</label>
            <div className={readOnlyCls} title="Peso vivo × rendimento de carcaça">{nf(pMorto, 1)}</div>
          </div>
          <div>
            <label className={labelCls}>Peso morto em arrobas (@)</label>
            <div className={readOnlyCls} title="Peso morto ÷ 15">{nf(arrobas, 2)} @</div>
          </div>
          <div>
            <label className={labelCls}>Valor por arroba (R$/@)</label>
            <div className={readOnlyCls} title="Meta de valor ÷ arrobas">{rPorArroba > 0 ? brl(rPorArroba) : '—'}</div>
          </div>
        </div>
      </section>

      {/* ── Plano nutricional (fases) ──────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-[#15803d]" />
            <h4 className="text-[12.5px] font-bold uppercase tracking-wide text-gray-600">Plano nutricional — fases</h4>
          </div>
          {!encerrado && (
            <button type="button" onClick={addFase}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[12.5px] font-semibold text-gray-700 hover:bg-gray-50">
              <Plus size={13} /> Adicionar fase
            </button>
          )}
        </div>

        {fases.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center text-[12.5px] text-gray-400">
            Nenhuma fase. Adicione fases (regime + período + ganho) para projetar o peso até o abate.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[860px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 w-8">#</th>
                  <th className="px-3 py-2">Data início</th>
                  <th className="px-3 py-2">Data final</th>
                  <th className="px-3 py-2 text-right">Dias</th>
                  <th className="px-3 py-2">Regime alimentar</th>
                  <th className="px-3 py-2 text-right">Ganho (kg/dia)</th>
                  <th className="px-3 py-2 text-right">Peso inicial</th>
                  <th className="px-3 py-2 text-right">Peso final</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {fases.map((f, i) => {
                  const l = projecao.linhas[i];
                  const atingiuAqui = status.faseAbateIndex === i;
                  // Regime salvo mas já inativo/excluído: mostra como opção extra p/ não sumir.
                  const regimeMissing = f.regimeAlimentarId && !regimes.some((r) => r.id === f.regimeAlimentarId);
                  return (
                    <tr key={f.id} className={`border-b border-gray-50 last:border-0 ${atingiuAqui ? 'bg-[#f1faf4]' : ''}`}>
                      <td className="px-3 py-2 font-semibold text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        <input type="date" value={f.dataInicio} disabled={encerrado}
                          onChange={(e) => patchFase(f.id, { dataInicio: e.target.value })}
                          className="h-9 w-[150px] rounded-lg border border-gray-200 bg-white px-2 text-[12.5px] focus:border-[#16a34a] focus:outline-none" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="date" value={f.dataFinal} disabled={encerrado}
                          onChange={(e) => patchFase(f.id, { dataFinal: e.target.value })}
                          className="h-9 w-[150px] rounded-lg border border-gray-200 bg-white px-2 text-[12.5px] focus:border-[#16a34a] focus:outline-none" />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{l ? l.dias : 0}</td>
                      <td className="px-3 py-2">
                        <select value={f.regimeAlimentarId} disabled={encerrado}
                          onChange={(e) => patchFase(f.id, { regimeAlimentarId: e.target.value })}
                          className="h-9 w-[220px] rounded-lg border border-gray-200 bg-white px-2 text-[12.5px] focus:border-[#16a34a] focus:outline-none">
                          <option value="">— Selecione —</option>
                          {regimes.map((r) => (
                            <option key={r.id} value={r.id}>{r.nome} ({r.codigoCurto})</option>
                          ))}
                          {regimeMissing && (
                            <option value={f.regimeAlimentarId}>Regime removido</option>
                          )}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" inputMode="decimal" min="0" step="0.01" value={f.ganhoPrevisto} disabled={encerrado}
                          onChange={(e) => patchFase(f.id, { ganhoPrevisto: e.target.value })} placeholder="0,000"
                          className="h-9 w-[90px] rounded-lg border border-gray-200 bg-white px-2 text-right text-[12.5px] focus:border-[#16a34a] focus:outline-none" />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-700">{l ? nf(l.pesoInicio, 1) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold text-gray-900">{l ? nf(l.pesoFinal, 1) : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {!encerrado && (
                          <button type="button" onClick={() => removeFase(f.id)} title="Remover fase"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Resumo da projeção */}
        {fases.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-gray-200 bg-[#fafbfc] px-4 py-3 text-[12.5px]">
            <div>
              <span className="text-gray-500">Peso projetado ao fim do plano: </span>
              <span className="font-bold text-gray-900">{nf(projecao.pesoFinalProjetado, 1)} kg</span>
              <span className="text-gray-400"> · {projecao.diasTotais} dia(s)</span>
            </div>
            {pesoAbate > 0 && (
              status.atingida ? (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[#e7f6ec] px-2.5 py-1 font-semibold text-[#15803d]">
                  <CalendarCheck2 size={14} />
                  Meta atingida
                  {status.dataAbatePrevista && <span>· abate previsto {formatDateBR(status.dataAbatePrevista)}</span>}
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[#fff4e5] px-2.5 py-1 font-semibold text-[#b45309]">
                  <Target size={14} />
                  Faltam {nf(status.faltamKg, 1)} kg — estenda o plano
                </div>
              )
            )}
          </div>
        )}
      </section>

      {/* ── Ações ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2">
        {encerrado && <span className="text-[12px] text-gray-400">Lote encerrado — somente leitura.</span>}
        <button type="button" onClick={handleSave} disabled={saving || encerrado}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#16a34a] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#15803d] disabled:opacity-50">
          {saving && <Loader2 size={15} className="animate-spin" />}
          Salvar planejamento
        </button>
      </div>
    </div>
  );
};

export default PlanejamentoNutricionalTab;
